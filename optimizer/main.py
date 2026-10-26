"""GEN_Z optimizer: station ranking, route/charging-stop planning, failsafe reroute, emergency picks.
Pure functions over the data the Java backend sends (which comes from MongoDB) - nothing here is hard-coded data."""
import math, os
from fastapi import FastAPI, Body

app = FastAPI(title="GEN_Z Optimizer")
PETROL_PER_KM = float(os.getenv("PETROL_PER_KM", "11.06"))   # INR per km for a petrol car (savings comparison)
AVG_KMPH = float(os.getenv("AVG_SPEED_KMPH", "68"))          # highway average
CITY_KMPH = float(os.getenv("CITY_SPEED_KMPH", "35"))        # detours / emergency drives
RESERVE = float(os.getenv("MIN_ARRIVAL_SOC", "8"))           # never plan to arrive at a stop below this SoC %


def hav(a, b, c, d):
    p1, p2 = math.radians(a), math.radians(c)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 12742.0 * math.asin(math.sqrt(h))


def project(route, lat, lng):
    """Project a point on a polyline -> (km along, km off the line, polyline length)."""
    best, cum = (0.0, 1e9), 0.0
    for i in range(len(route) - 1):
        (a1, o1), (a2, o2) = route[i], route[i + 1]
        seg = hav(a1, o1, a2, o2)
        k = math.cos(math.radians(a1))
        dx, dy, px, py = (o2 - o1) * k, a2 - a1, (lng - o1) * k, lat - a1
        l2 = dx * dx + dy * dy
        t = 0 if l2 == 0 else max(0.0, min(1.0, (px * dx + py * dy) / l2))
        off = math.hypot(px - dx * t, py - dy * t) * 111.2
        if off < best[1]:
            best = (cum + t * seg, off)
        cum += seg
    return best[0], best[1], cum


def taper(s):  # charging power multiplier by state of charge
    if s < 50: return 1.0
    if s < 80: return 1 - 0.45 * (s - 50) / 30
    return 0.55 - 0.40 * (min(s, 100) - 80) / 20


def charge(B, pmax, s0, s1):
    t = e = 0.0
    s = s0
    while s < s1 - 1e-9:
        step = min(1.0, s1 - s)
        de = B * step / 100
        e += de
        t += de / max(pmax * taper(s), 1.0) * 60
        s += step
    return t, e


def price(st, hour):
    o = st.get("offPeakTariff") or 0
    if o > 0:
        f, t = st.get("offPeakFrom", 23), st.get("offPeakTo", 6)
        if (hour >= f or hour < t) if f > t else (f <= hour < t):
            return o
    return st["tariff"]


BASE = {
    "FASTEST": dict(time=.38, power=.18, avail=.14, rel=.10, safety=.10, cost=.05, amen=.0, prog=.05),
    "LOWEST_COST": dict(cost=.42, time=.14, power=.05, avail=.10, rel=.10, safety=.10, amen=.04, prog=.05),
    "BALANCED": dict(time=.20, cost=.20, power=.10, avail=.10, rel=.12, safety=.12, amen=.08, prog=.08),
}


def weights(pref, custom, wanted):
    w = dict(BASE.get(pref, BASE["BALANCED"]))
    if pref == "CUSTOM":
        w.update({k: float(v) for k, v in (custom or {}).items() if k in w})
        if wanted: w["amen"] += .15
    tot = sum(w.values())
    return {k: v / tot for k, v in w.items()}


def inv(x, lo, hi):
    return 1.0 if hi <= lo else 1 - (x - lo) / (hi - lo)


def score_all(items, w, wanted):
    if not items: return
    lo = lambda k: min(i[k] for i in items)
    hi = lambda k: max(i[k] for i in items)
    for i in items:
        avail = i["freeBays"] / max(1, i["totalBays"]) if i["freeBays"] > 0 else max(0.0, .25 - i["waitMin"] / 120)
        rel = .5 * i["confidence"] / 100 + .5 * i["rating"] / 5
        types = set(i["amenityTypes"])
        am = (sum(1 for a in wanted if a in types) / len(wanted)) if wanted else min(1.0, len(types) / 5)
        comp = dict(time=inv(i["stopMin"], lo("stopMin"), hi("stopMin")), cost=inv(i["cost"], lo("cost"), hi("cost")),
                    power=(i["powerKw"] - lo("powerKw")) / (hi("powerKw") - lo("powerKw")) if hi("powerKw") > lo("powerKw") else 1.0,
                    avail=avail, rel=rel, safety=i["safety"] / 100, amen=am, prog=i.get("progress", .5))
        i["score"] = round(100 * sum(w[k] * comp[k] for k in w), 1)
    items.sort(key=lambda x: -x["score"])
    for n, i in enumerate(items):
        i["rank"] = n + 1
        i["reasons"] = reasons(i, items)


def reasons(i, items):
    r = []
    if i["waitMin"] == min(x["waitMin"] for x in items): r.append("No queue, bay free now" if i["waitMin"] == 0 else "Shortest wait")
    if i["powerKw"] == max(x["powerKw"] for x in items): r.append(f"Fastest charger ({int(i['powerKw'])} kW)")
    if i["cost"] == min(x["cost"] for x in items): r.append("Lowest cost")
    if i.get("detourKm", 0) == min(x.get("detourKm", 0) for x in items): r.append("Smallest detour")
    if i["safety"] >= 90: r.append(f"High safety score ({i['safety']}/100)")
    if i["confidence"] >= 90: r.append(f"Verified live data ({i['confidence']}%)")
    if i.get("amenities"): r.append("On site: " + ", ".join(i["amenities"][:3]))
    return r[:5]


def base_item(st, hour):
    return dict(stationId=st["id"], name=st["name"], network=st.get("network"), lat=st["lat"], lng=st["lng"],
                tariff=price(st, hour), powerKw=st["maxKw"], freeBays=st["freeBays"], totalBays=st["totalBays"],
                waitMin=int(st.get("waitMin", 0)), safety=int(st.get("safetyScore", 0)), confidence=int(st.get("confidence", 80)),
                rating=float(st.get("rating", 4)), amenities=st.get("amenityNames", []), amenityTypes=st.get("amenityTypes", []),
                connector=st.get("connector"), toll=bool(st.get("toll")), status=st.get("status"))


def stop_item(st, v, arrival, target, hour, along, off):
    it = base_item(st, hour)
    mins, en = charge(v["batteryKwh"], max(1.0, st["maxKw"]), arrival, target)
    it.update(km=round(along, 1), detourKm=round(2 * off, 1), arrivalSoc=round(arrival, 1), targetSoc=round(target, 1),
              chargeMin=round(mins), energyKwh=round(en, 1), cost=round(en * it["tariff"]),
              stopMin=round(2 * off / CITY_KMPH * 60 + it["waitMin"] + mins))
    return it


def target_for(arrival, need, limit):
    need_t = need + 3          # just enough to finish; only exceed the user's charge limit when the trip needs it
    return min(100.0, max(need_t if need_t <= 100 else limit, arrival + 4))


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/rank")
def rank(r: dict = Body(...)):
    v, hour, wanted = r["vehicle"], int(r.get("hour", 12)), r.get("amenities") or []
    items = []
    for st in r["stations"]:
        if st.get("offline") or not st.get("compatible", True): continue
        it = base_item(st, hour)
        mins, en = charge(v["batteryKwh"], max(1.0, st["maxKw"]), min(v.get("soc", 40), 79), 80)
        it.update(detourKm=st.get("distanceKm") or 0, stopMin=(st.get("driveMin") or 0) + it["waitMin"] + mins,
                  cost=en * it["tariff"], estCostTo80=round(en * it["tariff"]), estChargeMin=round(mins))
        items.append(it)
    score_all(items, weights(r.get("preference", "BALANCED"), r.get("weights"), wanted), wanted)
    pick = next((i for i in items if i["freeBays"] > 0 or i["waitMin"] <= 15), items[0] if items else None)
    return {"ranked": [dict(id=i["stationId"], score=i["score"], rank=i["rank"], aiPick=i is pick, reasons=i["reasons"],
                            estCostTo80=i["estCostTo80"], estChargeMin=i["estChargeMin"]) for i in items]}


def route_of(r):
    o, d = r["origin"], r["dest"]
    return r.get("route") or [[o["lat"], o["lng"]], [d["lat"], d["lng"]]], float(r.get("roadFactor", 1.22))


def on_route(r, route, rf, dist, lo=3.0):
    out = []
    for st in r["stations"]:
        if st.get("offline") or st["freeBays"] + st["totalBays"] == 0: continue
        if st.get("safetyScore", 0) < int(r.get("minSafety", 0)): continue
        if r.get("avoidTolls") and st.get("toll"): continue
        along, off, _ = project(route, st["lat"], st["lng"])
        along, off = along * rf, off * 1.3
        if off <= 25 and lo < along < dist - 3:
            out.append((st, along, off))
    return out


@app.post("/plan")
def plan(r: dict = Body(...)):
    v = r["vehicle"]
    B, c = v["batteryKwh"], v["consumption"]
    e = c / B                                     # SoC % consumed per km
    route, rf = route_of(r)
    avoid = bool(r.get("avoidTolls"))
    total_straight = sum(hav(*route[i], *route[i + 1]) for i in range(len(route) - 1))
    dist = total_straight * rf * (1.04 if avoid else 1.0)
    avg = AVG_KMPH * (0.93 if avoid else 1.0)
    soc0, buf, limit = float(r.get("socPct", v["soc"])), float(r.get("bufferPct", 20)), float(r.get("limitPct", 80))
    hour, wanted = int(r.get("hour", 12)), r.get("amenities") or []
    w = weights(r.get("preference", "BALANCED"), r.get("weights"), wanted)
    sts = on_route(r, route, rf, dist)
    stops, first, pos, soc, feasible, msg = [], [], 0.0, soc0, True, None
    for _ in range(5):
        if soc >= (dist - pos) * e + buf: break
        reach = (soc - RESERVE) / e
        items = []
        for st, along, off in sts:
            if along <= pos + 3 or (along - pos) + off > reach: continue
            arrival = soc - ((along - pos) + off) * e
            need = (dist - along) * e + buf + off * e
            it = stop_item(st, v, arrival, target_for(arrival, need, limit), hour, along, off)
            it["progress"] = min(1.0, (along - pos) / max(reach, 1))
            items.append(it)
        if not items:
            feasible, msg = False, "No compatible charger is reachable on this route with the current battery."
            break
        score_all(items, w, wanted)
        far = [x for x in items if x["km"] >= pos + .55 * reach] or items   # prefer stops that make real progress
        pick = far[0]
        if r.get("forceFirst") and not stops:
            pick = next((x for x in items if x["stationId"] == r["forceFirst"]), pick)
        if not stops: first = items
        stops.append(pick)
        soc, pos = pick["targetSoc"] - (pick["detourKm"] / 2) * e, pick["km"]
    else:
        feasible, msg = False, "Route needs more charging stops than can be planned."
    arrival_soc = soc - (dist - pos) * e
    detour_min = sum(s["detourKm"] / CITY_KMPH * 60 for s in stops)
    stop_min = sum(s["chargeMin"] + s["waitMin"] for s in stops) + detour_min
    drive = dist / avg * 60
    cost = sum(s["cost"] for s in stops)
    chosen = stops[0]["stationId"] if stops else None
    alts = [x for x in first if x["stationId"] != chosen]
    saves = max(0, alts[0]["stopMin"] - first[0]["stopMin"]) if alts and first and first[0]["stationId"] == chosen else 0
    petrol = dist * PETROL_PER_KM
    energy = dist * c / 100 + sum(s["detourKm"] for s in stops) * c / 100
    return dict(feasible=feasible, message=msg, distanceKm=round(dist), driveMin=round(drive + detour_min), chargeMin=round(stop_min),
                totalMin=round(drive + stop_min), energyKwh=round(energy, 1), cost=round(cost), petrolCost=round(petrol),
                savings=round(petrol - cost), savingsPct=round(100 * (petrol - cost) / petrol) if petrol else 0,
                startSoc=soc0, arrivalSoc=round(arrival_soc, 1), bufferPct=buf, stopsNeeded=len(stops), stops=stops,
                backup=alts[0] if alts else None, candidates=first, savesMin=round(saves), route=route, roadFactor=rf,
                avgKmph=round(avg))


@app.post("/reroute")
def reroute(r: dict = Body(...)):
    p, v, faulted = r["plan"], r["vehicle"], r["faultedId"]
    B, c = v["batteryKwh"], v["consumption"]
    e = c / B
    route, rf, dist = r["route"], float(r.get("roadFactor", 1.22)), p["distanceKm"]
    hour, buf = int(r.get("hour", 12)), float(p.get("bufferPct", 20))
    pos, soc = 0.0, float(p["startSoc"])
    if r.get("lat") is not None:
        pos = min(dist, project(route, r["lat"], r["lng"])[0] * rf)
        soc = p["startSoc"] - pos * e
    # if the driver already charged at an earlier stop, plan from that stop's target
    for s in p["stops"]:
        if s["stationId"] != faulted and s["km"] <= pos:
            soc, pos = s["targetSoc"] - (pos - s["km"]) * e, pos
    reach = (soc - RESERVE) / e
    items = []
    for st, along, off in on_route({**r, "avoidTolls": False, "minSafety": 0}, route, rf, dist, lo=pos):
        if st["id"] == faulted or (along - pos) + off > reach: continue
        arrival = soc - ((along - pos) + off) * e
        need = (dist - along) * e + buf + off * e
        it = stop_item(st, v, arrival, target_for(arrival, need, float(r.get("limitPct", 80))), hour, along, off)
        it["progress"] = min(1.0, (along - pos) / max(reach, 1))
        items.append(it)
    score_all(items, weights("BALANCED", None, []), [])
    orig = next((s for s in p["stops"] if s["stationId"] == faulted), None)
    if not items:
        return dict(backup=None, original=orig, positionKm=round(pos, 1), alternatives=[])
    b = items[0]
    after = b["targetSoc"] - (b["detourKm"] / 2) * e - (dist - b["km"]) * e
    return dict(backup=b, original=orig, alternatives=items[1:4], positionKm=round(pos, 1),
                deltaMin=round(b["stopMin"] - (orig["stopMin"] if orig else 0)), detourKm=b["detourKm"],
                arrivalBufferPct=round(after, 1), bufferGain=round(after - p.get("arrivalSoc", after), 1))


@app.post("/emergency")
def emergency(r: dict = Body(...)):
    v, soc, pos, flags = r["vehicle"], float(r["soc"]), r["pos"], r.get("flags") or {}
    e = v["consumption"] / v["batteryKwh"]
    rng = soc / e
    items = []
    for st in r["stations"]:
        if st.get("offline") or not st.get("compatible", True): continue
        dist = hav(pos["lat"], pos["lng"], st["lat"], st["lng"]) * 1.3
        arrival = soc - dist * e
        items.append(dict(station=st, distanceKm=round(dist, 1), driveMin=round(dist / CITY_KMPH * 60), arrivalSoc=round(arrival, 1),
                          bufferKm=round(max(arrival, 0) / e, 1), reachable=arrival >= 1, free=st["freeBays"] > 0))
    items.sort(key=lambda x: (not x["reachable"], not x["free"], x["distanceKm"], -x["station"]["maxKw"]))
    if r.get("forceId"):
        items.sort(key=lambda x: x["station"]["id"] != r["forceId"])
    best = items[0] if items else None
    tips = [dict(id="SPEED", title="Maintain speed under 50 km/h", detail="Reduces aerodynamic drag significantly", gainKm=round(rng * .12, 1), active=False, command=None),
            dict(id="HVAC", title="Cabin climate turned off", detail="Blower set to passive ventilation", gainKm=round(rng * .04, 1), active=bool(flags.get("hvacOff")), command="HVAC_OFF"),
            dict(id="REGEN", title="High regenerative braking", detail="Recaptures kinetic energy on deceleration", gainKm=round(rng * .03, 1), active=bool(flags.get("regenHigh")), command="REGEN_HIGH")]
    return dict(best=best, alternatives=items[1:4], rangeKm=round(rng, 1), tips=tips, critical=soc <= 10,
                unreachable=best is None or not best["reachable"])
