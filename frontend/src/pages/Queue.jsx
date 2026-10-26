import { useNavigate } from 'react-router-dom';
import { Zap, Timer, Coffee, Utensils, ShieldCheck, LogOut, Bell, GitFork, Hourglass } from 'lucide-react';
import { api } from '../api';
import { useFetch, useNow } from '../hooks';
import { useLiveEvent, useToast } from '../live';
import { Badge, Data, Empty, Page, mmss } from '../ui';

export default function Queue() {
  const nav = useNavigate(), toast = useToast(); const now = useNow(1000);
  const q = useFetch(() => api.get('/api/queue/active'), [], { interval: 5000 });
  useLiveEvent('QUEUE_UPDATE', () => q.reload()); useLiveEvent('STATION_UPDATE', () => q.reload()); useLiveEvent('QUEUE_BAY_FREE', () => q.reload());
  const act = async (fn, ok) => { try { const r = await fn(); ok && toast(ok); return r; } catch (e) { toast(e.message, 'err'); } };
  return (
    <Page title="Smart Queue & Counter">
      <Data q={q}>{(d) => {
        if (!d.active) return <Empty icon={Hourglass} title="You are not in a queue"><p>Join the smart queue from a busy station and we will hold the next free bay for you.</p><button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => nav('/map')}>FIND A STATION</button></Empty>;
        const e = d.active, s = d.station, hold = e.status === 'HOLD';
        const left = hold ? Math.max(0, (new Date(e.holdExpiresAt) - now) / 1000) : null;
        const ready = new Date(d.readyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const near = s.amenities.find((a) => a.type === 'cafe');
        return <>
          <div className="card yellow"><div className="between"><span className="label">● LIVE QUEUE TELEMETRY</span><Badge kind="gold" dot={false}>{s.network}</Badge></div>
            <div className="between"><h3 style={{ fontSize: 20 }}>{s.name}</h3><Badge kind="gold" dot={false}>{d.ahead} Ahead</Badge></div></div>
          <div className="card center">
            <div className="between"><span className="badge off nodot">SMART QUEUE SYNC</span><span className="label">AUTO-REASSIGN ON</span></div>
            <div style={{ width: 150, height: 150, borderRadius: '50%', background: 'var(--yellow)', margin: '16px auto', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 10px var(--tint)' }}><div><div className="label">TOKEN</div><div className="tele" style={{ fontSize: 44 }}>#{String(e.token).padStart(2, '0')}</div></div></div>
            <h3>{hold ? `Bay #${e.assignedBay} is yours!` : 'YOUR POSITION IN LINE'}</h3>
            <div className="muted">{hold ? 'Plug in before the timer runs out' : <>Position <b>#{d.position}</b> · next free: Bay on {Math.round(s.maxKw)} kW</>}</div>
            <div className="grid2" style={{ marginTop: 12, textAlign: 'left' }}>
              <div className="panel"><div className="label">Estimated wait</div><b className="tele" style={{ fontSize: 30 }}>{d.waitMin}</b> mins<div className="sm" style={{ color: 'var(--brown)' }}>Ready at ~{ready}</div></div>
              <div className="panel"><div className="label">Hold window</div><b className="tele" style={{ fontSize: 30 }}>{mmss(d.holdWindowSeconds)}</b> mins<div className="sm muted">Grace buffer auto-starts</div></div></div>
          </div>
          <div className="card soft"><div className="between"><div className="row"><Timer /><div><b>Driver Arrival Window</b><div className="sm muted">{hold ? `Bay #${e.assignedBay} held for you` : `Activates when a bay disengages`}</div></div></div>
            <span className="badge gold nodot tele" style={{ fontSize: 16, background: 'var(--yellow)' }}>{hold ? mmss(left) : mmss(d.holdWindowSeconds)}</span></div>
            <div className="bar striped" style={{ margin: '10px 0' }}><i style={{ width: hold ? (left / d.holdWindowSeconds * 100) + '%' : '100%' }} /></div>
            <div className="sm muted"><ShieldCheck size={14} /> Bay reserved for {Math.round(d.holdWindowSeconds / 60)} min on handoff. Zero penalty if you plug in within the window.</div></div>

          <div className="between"><h2>Live Bay Telemetry</h2><span className="label">{d.bays.filter((b) => b.status !== 'AVAILABLE').length}/{d.bays.length} OCCUPIED</span></div>
          {d.bays.map((b) => (
            <div key={b.number} className="card" style={{ marginTop: 8, padding: 14, ...(b.assignedToYou ? { background: 'var(--tint)', border: '1px solid #e7c84a' } : {}) }}>
              <div className="between"><span className="badge gold nodot" style={{ background: 'var(--yellow)' }}>BAY {String(b.number).padStart(2, '0')}</span><b>{b.vehicle || (b.status === 'RESERVED' ? 'Held' : 'Free')}</b><span className="muted tele">{b.powerKw} kW</span>{b.assignedToYou && <Badge kind="gold" dot={false}>ASSIGNED NEXT</Badge>}</div>
              <div className="bar" style={{ margin: '8px 0', background: '#ddd' }}><i style={{ width: b.soc + '%', background: 'var(--ink)' }} /></div>
              <div className="between sm"><span>{b.status === 'AVAILABLE' ? 'Available now' : `${b.soc}% SoC`}</span><span className="muted">{b.status === 'AVAILABLE' || b.status === 'RESERVED' ? '' : `~${b.minutesLeft} mins left`}</span></div></div>))}

          <div className="card"><div className="between"><h3>Queue Progression</h3><span className="label">{d.progression.length} VEHICLES</span></div>
            {d.progression.map((p) => <div key={p.token} className="row between" style={{ marginTop: 10, padding: 10, borderRadius: 14, background: p.you ? 'var(--tint)' : 'var(--soft)' }}>
              <span className="row"><span className="icon-btn" style={{ width: 32, height: 32, background: p.you ? 'var(--yellow)' : 'var(--ink)', color: p.you ? 'var(--ink)' : '#fff', fontWeight: 800 }}>{p.token}</span><span><b>{p.vehicle}</b> {p.you && <span className="badge gold nodot" style={{ background: 'var(--yellow)' }}>YOU</span>}<div className="sm muted">{p.status === 'HOLD' ? 'Bay assigned' : 'Waiting'}</div></span></span>
              <span className="badge off nodot">{p.etaMin}m ETA</span></div>)}</div>

          {near && <div className="card soft"><div className="row"><span className="icon-btn" style={{ background: '#FFD9B8' }}><Coffee size={18} /></span><div><b>While You Wait</b><div className="sm muted">{near.name} is {near.meters} m away</div></div></div>
            <button className="btn btn-soft md" style={{ marginTop: 10, background: '#fff' }} onClick={() => act(() => api.post(`/api/queue/${e.id}/preorder`), 'Pre-order noted for the station staff')}><Utensils size={16} />Pre-order coffee & snacks</button></div>}

          <div className="col" style={{ marginTop: 16 }}>
            {hold ? <button className="btn btn-primary" onClick={async () => { const r = await act(() => api.post(`/api/queue/${e.id}/arrive`)); r && nav('/charging'); }}><Zap size={18} />I'VE ARRIVED · START CHARGING</button>
              : <button className="btn btn-primary" disabled={e.notify} onClick={async () => { await act(() => api.post(`/api/queue/${e.id}/notify`), "We'll alert you the moment a bay frees up"); q.reload(); }}><Bell size={18} />{e.notify ? 'WE WILL NOTIFY YOU' : 'NOTIFY ME WHEN A BAY FREES'}</button>}
            {d.swap && <button className="btn btn-dark" onClick={async () => { const r = await act(() => api.post(`/api/queue/${e.id}/swap`, { stationId: d.swap.id }), `Swapped to ${d.swap.name}`); r && q.setData(r); }}><GitFork size={16} />Swap to {d.swap.name.split('–').pop().trim()} ({d.swap.distanceKm} km · {d.swap.waitMin} min wait)</button>}
            <button className="muted center" style={{ padding: 10 }} onClick={async () => { await act(() => api.del(`/api/queue/${e.id}`), 'Left the queue'); nav('/home'); }}><LogOut size={14} /> Leave queue / release stall reservation</button>
          </div>
        </>; }}
      </Data>
    </Page>);
}
