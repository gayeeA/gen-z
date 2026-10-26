import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Zap, Gauge, PiggyBank, Scale, SlidersHorizontal, Ban, ShieldCheck, Coffee, Navigation, Car, Lightbulb, MapPin } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useDebounced, useGeo } from '../hooks';
import { useToast } from '../live';
import { AMEN_ICON, AMEN_LABEL, ErrorBox, Page, Toggle, dur, inr } from '../ui';

const PREFS = [['FASTEST', 'Fastest', 'Min. total elapsed trip time', Gauge], ['LOWEST_COST', 'Lowest Cost', 'Prefer off-peak kWh rates', PiggyBank],
  ['BALANCED', 'Balanced', 'Ideal mix of speed & rest stop', Scale], ['CUSTOM', 'Custom', 'Specific food & coffee hubs', SlidersHorizontal]];

export default function TripPlanner() {
  const { user } = useAuth(); const nav = useNavigate(), toast = useToast(), geo = useGeo(); const [sp] = useSearchParams();
  const v = user.vehicle;
  const [from, setFrom] = useState(null), [to, setTo] = useState(null), [text, setText] = useState(sp.get('q') || '');
  const [soc, setSoc] = useState(Math.round(v.soc)), [buffer, setBuffer] = useState(20), [pref, setPref] = useState('BALANCED');
  const [avoidTolls, setAvoid] = useState(false), [safe, setSafe] = useState(true), [food, setFood] = useState(true), [custom, setCustom] = useState(['cafe']);
  const [results, setResults] = useState([]), [prev, setPrev] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const dtext = useDebounced(text, 300);

  useEffect(() => { if (!geo) return; api.get(`/api/public/places/nearest?lat=${geo.lat}&lng=${geo.lng}`).then((p) => setFrom({ name: p.name, sub: p.state, lat: geo.lat, lng: geo.lng })).catch(() => {}); }, [geo?.lat, geo?.lng]);
  useEffect(() => { const t = sp.get('to'); if (t) { try { const p = JSON.parse(t); setTo(p); setText(p.name); } catch {} } }, []);
  useEffect(() => { if (dtext.length > 1 && dtext !== to?.name) api.get('/api/public/places?q=' + encodeURIComponent(dtext)).then(setResults).catch(() => {}); else setResults([]); }, [dtext]);

  const amen = pref === 'CUSTOM' ? custom : food ? ['cafe'] : [];
  const body = () => ({ from, to, socPct: soc, bufferPct: buffer, preference: pref, avoidTolls, minSafety: safe ? 90 : 0, amenities: amen });
  const key = JSON.stringify([from?.lat, to?.lat, soc, buffer, pref, avoidTolls, safe, amen]);
  const dkey = useDebounced(key, 500);
  useEffect(() => {
    if (!from || !to) { setPrev(null); return; }
    let dead = false; setLoading(true); setErr('');
    api.post('/api/trips/plan?preview=true', body()).then((t) => !dead && setPrev(t.plan)).catch((e) => !dead && (setErr(e.message), setPrev(null))).finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [dkey]);

  const plan = async () => {
    setBusy(true);
    try { const t = await api.post('/api/trips/plan', body()); nav(`/trip/${t.id}`); } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  const stop = prev?.stops?.[0];
  const sweet = Math.min(100, 80);
  return (
    <Page title="Trip Planner">
      <span className="badge gold nodot" style={{ marginTop: 6 }}>⚡ ZERO-STRESS NAVIGATOR</span>
      <h1 className="h-xl">Intelligent Trip Planner</h1>
      <p className="muted" style={{ margin: 0 }}>Plan long intercity drives with guaranteed zero battery anxiety.</p>

      <div className="card">
        <div className="between"><div className="grow"><div className="label">Starting point</div><b style={{ fontSize: 17 }}>{from ? `${from.name}, ${from.sub || ''}` : 'Locating you…'}</b><div className="sm muted">Current location</div></div>
          <button className="icon-btn" style={{ background: 'var(--soft)' }} disabled={!to} onClick={() => { const f = from, t = to; setFrom({ ...t, sub: '' }); setTo({ ...f }); setText(f.name); }}><ArrowUpDown size={18} /></button></div>
        <div className="divider" style={{ margin: '12px 0' }} />
        <div className="label">Destination</div>
        <input className="input" style={{ marginTop: 6 }} placeholder="Where to? e.g. Chennai" value={text} onChange={(e) => { setText(e.target.value); setTo(null); }} />
        {results.length > 0 && !to && <div className="col" style={{ marginTop: 8 }}>{results.map((p) => <button key={p.id} className="panel row" onClick={() => { setTo({ name: p.name, sub: p.state, lat: p.lat, lng: p.lng }); setText(p.name); setResults([]); }}><MapPin size={16} /><div style={{ textAlign: 'left' }}><b>{p.name}</b><span className="muted"> · {p.state}</span><div className="sm muted">{p.landmark}</div></div></button>)}</div>}
        {prev && <div className="panel between" style={{ marginTop: 12 }}><span className="row"><Car size={16} /><b>{prev.distanceKm} km</b></span><span className="sm">⏱ Est. {dur(prev.totalMin)} with charging</span></div>}
      </div>

      <div className="card">
        <div className="label">Battery telemetry</div>
        <div className="between"><b style={{ fontSize: 17 }}>Current battery SoC</b><span className="panel tele" style={{ fontSize: 24, padding: '6px 12px' }}>{soc}% <span className="sm">{Math.round(soc / 100 * v.batteryKwh / v.consumption * 100)} km</span></span></div>
        <input type="range" className="slider" min="5" max="100" value={soc} style={{ margin: '12px 0' }} onChange={(e) => setSoc(+e.target.value)} />
        <div className="between label"><span>Critical (15%)</span><span>⚡ Sweet spot ({sweet}%)</span><span>Full (100%)</span></div>
        {stop && <div className="panel row" style={{ marginTop: 12 }}><Lightbulb size={16} /><span className="sm">Charging stop recommended around <b>{prev.stops.map((s) => s.name.split('–').pop().trim()).join(' & ')}</b> to hit the optimal charging curve.</span></div>}
        {prev && !prev.stopsNeeded && prev.feasible && <div className="panel row" style={{ marginTop: 12 }}><Lightbulb size={16} /><span className="sm">You can make it without charging.</span></div>}
      </div>

      <div className="card row between"><div className="row"><ShieldCheck /><div><b style={{ fontSize: 16 }}>Target Arrival Buffer</b><div className="sm muted">Safety reserve at {to?.name || 'destination'}</div></div></div>
        <div className="tabs" style={{ padding: 3 }}>{[15, 20, 25].map((b) => <button key={b} className={`tab ${buffer === b ? 'on' : ''}`} style={{ height: 34, width: 48, flex: 'none', background: buffer === b ? 'var(--yellow)' : 'none', color: 'var(--ink)' }} onClick={() => setBuffer(b)}>{b}%</button>)}</div></div>

      <div className="between"><h2>Optimization Engine</h2><span className="label">AI SYNCED</span></div>
      <div className="grid2">{PREFS.map(([k, t, d, I]) => <button key={k} className={`opt ${pref === k ? 'on' : ''}`} onClick={() => setPref(k)}><I size={20} /><b>{t}</b><span className="sm">{d}</span></button>)}</div>
      {pref === 'CUSTOM' && <div className="chips" style={{ marginTop: 8 }}>{Object.keys(AMEN_LABEL).map((a) => { const I = AMEN_ICON[a]; return <button key={a} className={`chip ${custom.includes(a) ? 'sel' : ''}`} onClick={() => setCustom(custom.includes(a) ? custom.filter((x) => x !== a) : [...custom, a])}><I size={14} />{AMEN_LABEL[a]}</button>; })}</div>}

      <div className="card"><div className="label">Drive constraints</div>
        {[[Ban, 'Avoid toll roads', null, avoidTolls, setAvoid], [ShieldCheck, 'Only 90+ Safety Score stations', 'Well-lit, 24/7 guarded plazas', safe, setSafe], [Coffee, 'Prefer food & coffee stops', null, food, setFood]].map(([I, t, d, on, set]) =>
          <div key={t} className="between" style={{ marginTop: 14 }}><div className="row"><I size={20} /><div><b>{t}</b>{d && <div className="sm muted">{d}</div>}</div></div><button className={`toggle ${on ? 'on' : ''}`} onClick={() => set(!on)} /></div>)}</div>

      <ErrorBox error={err} />
      {loading && <div className="spin" />}
      {prev && !prev.feasible && <div className="err-box">{prev.message}</div>}
      {stop && prev.feasible && <div className="card"><div className="between"><span className="badge gold nodot">OPTIMAL ROUTE STOP · {stop.chargeMin} MIN</span><span className="label">KM {Math.round(stop.km)}</span></div>
        <h3 style={{ marginTop: 8 }}>{stop.name}</h3><div className="sm muted">{stop.amenities.slice(0, 2).join(' · ')}</div>
        <div className="sm" style={{ marginTop: 6 }}><Zap size={12} fill="#FFCB05" /> {Math.round(stop.powerKw)} kW {stop.connector} · {stop.freeBays}/{stop.totalBays} Free</div></div>}
      {prev?.feasible && <div className="card"><div className="between"><span className="label">Journey telemetry overview</span><span className="label">{prev.feasible ? '100% RELIABILITY' : ''}</span></div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="panel"><div className="label">Distance</div><b className="tele" style={{ fontSize: 22 }}>{prev.distanceKm} km</b></div>
          <div className="panel"><div className="label">Stops needed</div><b className="tele" style={{ fontSize: 22 }}>{prev.stopsNeeded} Fast Stop{prev.stopsNeeded === 1 ? '' : 's'}</b></div>
          <div className="panel"><div className="label">Est. energy</div><b className="tele" style={{ fontSize: 22 }}>~{Math.round(prev.energyKwh)} kWh</b></div>
          <div className="panel"><div className="label">Est. cost</div><b className="tele" style={{ fontSize: 22 }}>{inr(prev.cost)}</b></div></div></div>}
      <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={!prev?.feasible || busy} onClick={plan}><Zap size={18} />PLAN ROUTE WITH SMART CHARGING</button>
      <p className="center muted sm">Charger holds are placed when you pick a stop and last 25 minutes.</p>
    </Page>);
}
