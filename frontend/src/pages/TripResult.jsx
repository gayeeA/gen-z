import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import { Clock, Zap, Navigation, PiggyBank, Send, Sparkles, GitCompare, BatteryCharging } from 'lucide-react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { useToast } from '../live';
import { AmenIcons, Badge, Data, Page, dur, inr } from '../ui';

function Fit({ pts }) { const map = useMap(); useEffect(() => { if (pts.length) map.fitBounds(pts, { padding: [24, 24] }); }, [pts.length]); return null; }
const pinIcon = (cls, txt) => L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="pin ${cls}">${txt}</div>` });

export default function TripResult() {
  const { id } = useParams(); const nav = useNavigate(), toast = useToast();
  const q = useFetch(() => api.get(`/api/trips/${id}`), [id]);
  const [ai, setAi] = useState(null), [ask, setAsk] = useState(''), [chat, setChat] = useState(null), [busy, setBusy] = useState('');
  const t = q.data, p = t?.plan, stop = p?.stops?.[0];
  useEffect(() => { if (stop) api.post('/api/ai/explain', { tripId: id, stationId: stop.stationId }).then(setAi).catch(() => {}); }, [stop?.stationId]);
  useEffect(() => { // while navigating, share position so the failsafe engine can reroute from where you are
    if (t?.status !== 'ACTIVE' || !navigator.geolocation) return;
    const w = navigator.geolocation.watchPosition((pos) => api.post(`/api/trips/${id}/position`, { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {}), () => {}, { maximumAge: 30000 });
    return () => navigator.geolocation.clearWatch(w);
  }, [t?.status]);
  const run = (k, fn) => async () => { setBusy(k); try { await fn(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(''); } };
  const start = run('start', async () => { const r = await api.post(`/api/trips/${id}/start`); q.setData(r.trip); window.open(r.navUrl, '_blank'); toast('Live monitoring on. We will reroute you if a charger fails.', 'ok', 'Navigation started'); });
  const reserve = run('res', async () => { q.setData(await api.post(`/api/trips/${id}/select`, { stationId: stop.stationId })); toast(`Bay held at ${stop.name} for 25 min`, 'ok', 'Reserved'); });
  const send = run('ask', async () => { setChat(await api.post('/api/ai/assist', { tripId: id, message: ask })); setAsk(''); });
  return (
    <Page title="Route Plan" back="/trip" nav={false}>
      <Data q={q}>{() => <>
        <div className="card">
          <div className="between"><Badge kind="gold" dot>{t.status === 'ACTIVE' ? 'NAVIGATING' : 'ROUTE READY'}</Badge><span className="badge off nodot">{p.feasible ? 'Optimal Efficiency' : 'Needs attention'}</span></div>
          <div className="between" style={{ margin: '10px 0' }}><h1 className="h-xl" style={{ margin: 0, fontSize: 24 }}>{t.from.name} → {t.to.name}</h1><span className="tele" style={{ fontSize: 22 }}>{p.distanceKm} km</span></div>
          <div style={{ position: 'relative', margin: '8px 0 20px' }}>
            <div className="bar"><i style={{ width: '100%' }} /></div>
            {p.stops.map((s) => <span key={s.stationId} style={{ position: 'absolute', left: `${Math.min(96, s.km / p.distanceKm * 100)}%`, top: -7, transform: 'translateX(-50%)' }}><Zap size={22} fill="#1E1E1E" color="#FFCB05" /></span>)}
            <div className="between label" style={{ marginTop: 8 }}><span>0 km ({Math.round(p.startSoc)}%)</span>{p.stops.map((s) => <span key={s.stationId}>⚡ {Math.round(s.km)} km</span>)}<span>{p.distanceKm} km ({t.to.name})</span></div></div>
          <div className="panel between"><span className="row"><Clock size={18} /><b style={{ fontSize: 16 }}>{dur(p.totalMin)} total</b></span><span className="sm muted">⚡ Incl. {dur(p.chargeMin)} charging</span></div>
          {!p.feasible && <div className="err-box">{p.message}</div>}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <MapContainer center={[p.route[0][0], p.route[0][1]]} zoom={8} style={{ height: 200, borderRadius: 18 }} zoomControl={false} attributionControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Fit pts={p.route} />
            <Polyline positions={p.route} pathOptions={{ color: '#1E1E1E', weight: 5 }} />
            {p.stops.map((s) => <Marker key={s.stationId} position={[s.lat, s.lng]} icon={pinIcon('ai', '⚡ ' + s.name.split('–').pop().trim())} />)}
            {p.backup && <Marker position={[p.backup.lat, p.backup.lng]} icon={pinIcon('', 'Backup')} />}
          </MapContainer>
        </div>

        {p.stops.length === 0 && p.feasible && <div className="card tint center"><BatteryCharging /><h3>No charging stop needed</h3><div className="muted">You will arrive with about {Math.round(p.arrivalSoc)}% battery.</div></div>}
        {p.stops.map((s, i) => (
          <div key={s.stationId} className={`card ${i === 0 ? 'ai' : ''}`}>
            <div className="between"><Badge kind="ai">AI RECOMMENDED{p.stops.length > 1 ? ` · STOP ${i + 1}` : ''}</Badge><div style={{ textAlign: 'right' }}><span className="tele" style={{ fontSize: 34 }}>{Math.round(s.powerKw)}</span><b>kW</b><div className="label">{s.connector}</div></div></div>
            <h3 style={{ fontSize: 20, margin: '6px 0 0', cursor: 'pointer' }} onClick={() => nav(`/station/${s.stationId}`)}>{s.name}</h3>
            <div className="sm muted">Km {Math.round(s.km)} on route · detour {s.detourKm} km</div>
            <div className="grid2" style={{ marginTop: 10 }}>
              <div className="panel"><div className="label">Live bays</div><b className="tele" style={{ fontSize: 24 }}>{s.freeBays}/{s.totalBays} Free</b></div>
              <div className="panel"><div className="label">Tariff</div><b className="tele" style={{ fontSize: 24 }}>{inr(s.tariff)}</b>/kWh</div></div>
            <div className="panel" style={{ marginTop: 10 }}><div className="between"><span className="label">Battery strategy</span><span className="badge gold nodot">{s.chargeMin} mins</span></div>
              <div className="between" style={{ margin: '8px 0' }}><b className="tele" style={{ fontSize: 24, color: 'var(--red)' }}>{Math.round(s.arrivalSoc)}% <span className="sm muted">Arrival</span></b><span>→</span><b className="tele" style={{ fontSize: 24 }}>{Math.round(s.targetSoc)}% <span className="sm muted">Target</span></b></div>
              <div className="bar"><i style={{ width: s.targetSoc + '%' }} /></div></div>
            <div className="between" style={{ marginTop: 10 }}><AmenIcons types={s.amenityTypes} /><span className="sm muted">{inr(s.cost)} · wait {s.waitMin} min</span></div>
          </div>))}

        {ai && <div className="card tint"><div className="row" style={{ marginBottom: 6 }}><Sparkles size={16} /><b>Why this stop</b><span className="badge gold nodot">{ai.source === 'gemini' ? 'Gemini AI' : 'Rules'}</span></div><div>{ai.text}</div></div>}

        {p.backup && <div className="card"><div className="between"><Badge kind="warn">BACKUP STOP</Badge><div><span className="tele" style={{ fontSize: 24 }}>{Math.round(p.backup.powerKw)}</span><b>kW</b></div></div>
          <h3 style={{ marginTop: 6 }}>{p.backup.name}</h3><div className="sm muted">Km {Math.round(p.backup.km)} · {p.backup.freeBays} bays free</div>
          <div className="panel between" style={{ marginTop: 8 }}><span className="sm">Arrival: <b>{Math.round(p.backup.arrivalSoc)}% SoC</b></span><span className="sm">{inr(p.backup.cost)}</span></div></div>}

        <div className="card"><div className="between"><h3>Trip Energy & Savings</h3><span className="label">ESTIMATED</span></div>
          <div className="panel row between" style={{ marginTop: 10 }}><span className="row"><span className="icon-btn" style={{ background: 'var(--yellow)' }}><Zap size={18} /></span><span><div className="label">Net energy needed</div><b className="tele" style={{ fontSize: 24 }}>{p.energyKwh} kWh</b></span></span><span className="sm muted">~{(p.energyKwh / p.distanceKm * 100).toFixed(1)} kWh/100km</span></div>
          <div className="grid2" style={{ marginTop: 10 }}><div className="panel center"><div className="label">EV charge cost</div><b className="tele" style={{ fontSize: 22 }}>{inr(p.cost)}</b></div>
            <div className="panel center"><div className="label">Petrol equiv.</div><b className="tele" style={{ fontSize: 22, textDecoration: 'line-through' }}>{inr(p.petrolCost)}</b></div></div>
          {p.savings > 0 && <div className="card tint row" style={{ margin: '10px 0 0', padding: 14 }}><PiggyBank /><div><b style={{ fontSize: 18 }}>Saved {inr(p.savings)}!</b><div className="sm">{p.savingsPct}% cheaper than petrol</div></div></div>}</div>

        <div className="card soft"><b>Ask the AI trip assistant</b>
          <div className="row" style={{ marginTop: 8 }}><input className="input" placeholder="e.g. Is it safe to stop at night?" value={ask} onChange={(e) => setAsk(e.target.value)} /><button className="btn btn-dark" style={{ width: 52, padding: 0 }} disabled={!ask || busy === 'ask'} onClick={send}><Send size={18} /></button></div>
          {chat && <div className="panel white" style={{ marginTop: 8 }}>{chat.text}</div>}</div>

        <div className="col" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" disabled={busy === 'start' || !p.feasible} onClick={start}><Navigation size={18} />START LIVE NAVIGATION</button>
          {stop && <button className="btn btn-soft" onClick={reserve} disabled={busy === 'res'}>{t.bookingId ? 'Bay held · tap to re-reserve' : 'Reserve Bay Now (Guaranteed Slot)'}</button>}
          {p.candidates?.length > 1 && <Link className="btn btn-ghost md" to={`/trip/${id}/compare`}><GitCompare size={16} />COMPARE {p.candidates.length} STATIONS</Link>}
        </div>
      </>}</Data>
    </Page>);
}
