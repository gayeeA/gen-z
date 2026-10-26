import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import { Zap, PlugZap, Timer, ArrowDown, Clock, BatteryCharging, ShieldCheck, GitFork, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { useFetch, useNow } from '../hooks';
import { useLiveEvent, useToast } from '../live';
import { AmenIcons, Badge, Data, Empty, Modal, Page, ago, inr } from '../ui';

const pin = (cls, t) => L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="pin ${cls}">${t}</div>` });
function Fit({ pts }) { const m = useMap(); if (pts.length) setTimeout(() => m.fitBounds(pts, { padding: [30, 30] }), 0); return null; }

export default function Failsafe() {
  const nav = useNavigate(), toast = useToast(), now = useNow(500);
  const q = useFetch(() => api.get('/api/alerts/active'), [], { interval: 4000 });
  useLiveEvent('FAILSAFE_ALERT', () => q.reload()); useLiveEvent('FAILSAFE_RESOLVED', () => q.reload());
  const [busy, setBusy] = useState(false), [alts, setAlts] = useState(false);
  const act = async (fn) => { setBusy(true); try { await fn(); q.reload(); } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <Page title="Failsafe Reroute Alert" back nav={false}>
      <Data q={q}>{({ alert: a, route }) => {
        if (!a) return <Empty icon={ShieldCheck} title="No active alerts"><p>If a charger on your route faults, GEN_Z finds the best safe alternative and shows it here.</p></Empty>;
        const r = a.reroute || {}, b = r.backup, o = r.original, pending = a.status === 'PENDING';
        const left = Math.max(0, (new Date(a.expiresAt) - now) / 1000);
        return <>
          <div className="card red"><div className="between"><span className="badge nodot" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}>● {pending ? 'CRITICAL ALERT' : a.status} · {ago(a.createdAt).toUpperCase()}</span><b style={{ color: 'var(--yellow)' }}>⚡ FAILSAFE ENGAGED</b></div>
            <div className="row" style={{ marginTop: 10, alignItems: 'flex-start' }}><span className="icon-btn" style={{ background: 'rgba(255,255,255,.2)' }}><PlugZap /></span><div><h2 style={{ margin: 0, color: '#fff' }}>Station Offline — Instant Reroute</h2><div style={{ opacity: .9, marginTop: 4 }}>{a.stationName} reported: {a.reason}. {b ? 'Auto-rerouting now to prevent delay and battery starvation.' : 'No safe backup is within range.'}</div></div></div></div>
          {pending && b && <div className="card soft"><div className="between"><div className="row"><Timer /><div>Auto-accepting reroute in <b className="tele" style={{ fontSize: 20, color: 'var(--red)' }}>{Math.ceil(left)}s</b></div></div><span className="badge gold nodot" style={{ background: 'var(--yellow)' }}>RESERVING BAY</span></div><div className="bar" style={{ marginTop: 10 }}><i style={{ width: left / 30 * 100 + '%', transition: 'width .5s linear' }} /></div></div>}

          <div className="card"><div className="between"><span className="label">Dynamic relay switch</span><span className="label">{route ? 'Route corridor' : ''}</span></div>
            {o && <div className="panel" style={{ marginTop: 10, opacity: .7 }}><div className="between"><Badge kind="bad">OFFLINE (GRID TRIPPED)</Badge><span className="label">KM {Math.round(o.km)}</span><b className="tele" style={{ color: 'var(--red)' }}>0/{o.totalBays} Free</b></div><h3 style={{ textDecoration: 'line-through', marginTop: 6 }}>{o.name}</h3><div className="sm muted">Original stop · {Math.round(o.targetSoc)}% SoC plan</div></div>}
            {b && <><div className="center" style={{ margin: '8px 0' }}><span className="icon-btn" style={{ background: 'var(--yellow)', margin: '0 auto' }}><ArrowDown /></span></div>
              <div className="panel" style={{ background: '#fff', boxShadow: 'var(--shadow)' }}><div className="between"><Badge kind="gold" dot={false}>✦ AI OPTIMAL BACKUP</Badge><span className="label">KM {Math.round(b.km)}</span><b className="tele" style={{ color: 'var(--green)', fontSize: 20 }}>{b.freeBays}/{b.totalBays} Free</b></div>
                <h3 style={{ fontSize: 20, marginTop: 6 }}>{b.name}</h3><div className="sm muted">{b.network} · {b.waitMin} min wait</div>
                <div className="between" style={{ marginTop: 8 }}><span className="sm"><Zap size={12} fill="#FFCB05" /> {Math.round(b.powerKw)} kW {b.connector}</span><Badge kind="gold" dot={false}>{Math.round(b.targetSoc)}% target</Badge></div></div></>}</div>

          {b && route && <div className="card" style={{ padding: 0, overflow: 'hidden' }}><MapContainer center={[b.lat, b.lng]} zoom={9} style={{ height: 210, borderRadius: 18 }} zoomControl={false} attributionControl={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Fit pts={[...(o ? [[o.lat, o.lng]] : []), [b.lat, b.lng]]} />
            <Polyline positions={route} pathOptions={{ color: '#9AA0A6', weight: 4, dashArray: '6 8' }} />
            {o && <Marker position={[o.lat, o.lng]} icon={pin('', '✕ ' + o.name.split('–').pop().trim())} />}<Marker position={[b.lat, b.lng]} icon={pin('ai', '⚡ ' + b.name.split('–').pop().trim())} /></MapContainer></div>}

          {b && <div className="grid2"><div className="card" style={{ margin: '14px 0 0' }}><div className="label">Arrival buffer</div><b className="tele" style={{ fontSize: 32 }}>{Math.round(r.arrivalBufferPct)}%</b> {r.bufferGain != null && <span className="sm" style={{ color: r.bufferGain >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{r.bufferGain >= 0 ? '+' : ''}{Math.round(r.bufferGain)}% vs plan</span>}<div className="sm muted">{r.arrivalBufferPct < 5 ? 'Tight: consider charging more' : 'Prevents highway drain'}</div></div>
            <div className="card" style={{ margin: '14px 0 0' }}><div className="label">Trip delta</div><b className="tele" style={{ fontSize: 32 }}>{r.deltaMin >= 0 ? '+' : ''}{r.deltaMin}m</b> <span className="sm muted">detour</span><div className="sm muted">{r.detourKm} km off-route</div></div></div>}
          {b?.amenities?.length > 0 && <div className="chips" style={{ marginTop: 10 }}>{b.amenities.map((x) => <span key={x} className="chip" style={{ textTransform: 'none', fontFamily: 'var(--f)' }}>{x}</span>)}</div>}

          {pending && <div className="col" style={{ marginTop: 14 }}>
            {b ? <button className="btn btn-primary" disabled={busy} onClick={() => act(async () => { await api.post(`/api/alerts/${a.id}/accept`); toast(`Navigating to ${b.name}`, 'ok', 'Reroute confirmed'); })}><Zap size={18} />CONFIRM REROUTE & HOLD BAY</button>
              : <button className="btn btn-red" onClick={() => nav('/emergency')}><AlertTriangle size={18} />OPEN EMERGENCY MODE</button>}
            {r.alternatives?.length > 0 && <button className="btn btn-dark" onClick={() => setAlts(true)}><GitFork size={16} />View other {r.alternatives.length} alternatives</button>}
            <button className="muted center sm" style={{ padding: 8 }} disabled={busy} onClick={() => act(() => api.post(`/api/alerts/${a.id}/ignore`))}>⚠ IGNORE ALERT & CONTINUE (HIGH RISK OF 0% SOC)</button></div>}
          {a.status === 'ACCEPTED' && <div className="card tint row"><CheckCircle2 color="#2E9E5B" /><div><b>Reroute confirmed</b><div className="sm">Your navigation now points to {b?.name}.</div></div></div>}
          {alts && <Modal title="Other safe alternatives" onClose={() => setAlts(false)}><div className="col" style={{ marginTop: 12 }}>{r.alternatives.map((x) => <div key={x.stationId} className="panel white"><div className="between"><b>{x.name}</b><span className="badge off nodot">Km {Math.round(x.km)}</span></div><div className="sm muted">{Math.round(x.powerKw)} kW · {x.freeBays}/{x.totalBays} free · {x.detourKm} km detour · {inr(x.cost)}</div>
            <button className="btn btn-soft sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => { setAlts(false); act(() => api.post(`/api/alerts/${a.id}/accept`, { stationId: x.stationId })); }}>Use this stop</button></div>)}</div></Modal>}
        </>; }}
      </Data>
    </Page>);
}
