import { useNavigate } from 'react-router-dom';
import { Zap, Navigation, Clock } from 'lucide-react';
import { api } from './api';
import { useAuth } from './auth';
import { useToast } from './live';
import { AmenIcons, Badge, StatusBadge, inr, mapsDir } from './ui';

export function useStationActions() {
  const nav = useNavigate(), toast = useToast(), { refresh } = useAuth();
  const wrap = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, 'err'); } };
  return {
    reserve: wrap(async (st, bay) => { const b = await api.post(`/api/stations/${st.id}/reserve`, bay ? { bayNumber: bay } : {}); toast(`Bay #${b.bay} held at ${st.name}. Fee ${inr(b.fee)} is refunded when you plug in.`, 'ok', 'Reserved'); refresh(); }),
    charge: wrap(async (st, bay) => { await api.post('/api/sessions/start', { stationId: st.id, bayNumber: bay }); nav('/charging'); }),
    queue: wrap(async (st) => { await api.post(`/api/stations/${st.id}/queue`); nav('/queue'); }),
  };
}

/** Which primary action makes sense right now for this station. */
export function primaryFor(st) {
  if (st.offline || st.status === 'OFFLINE') return null;
  if (st.freeBays > 0) return st.aiPick ? 'CHARGE' : 'RESERVE';
  return 'QUEUE';
}

export function ActionButton({ st, kind, small }) {
  const a = useStationActions();
  const k = kind || primaryFor(st);
  if (!k) return <Badge kind="off">Offline</Badge>;
  const cfg = { CHARGE: ['PLUG & CHARGE', a.charge, 'btn-primary', Zap], RESERVE: ['RESERVE', a.reserve, 'btn-primary', Zap], QUEUE: ['HOLD SLOT', a.queue, 'btn-soft', Clock] }[k];
  const I = cfg[3];
  return <button className={`btn ${cfg[2]} ${small ? 'sm' : 'md'}`} onClick={() => cfg[1](st)}><I size={16} />{cfg[0]}</button>;
}

export function StationCard({ st, onOpen }) {
  const nav = useNavigate();
  const open = () => (onOpen ? onOpen(st) : nav(`/station/${st.id}`));
  return (
    <div className={`card ${st.aiPick ? 'ai' : ''}`}>
      <div className="between">
        {st.aiPick ? <Badge kind="ai" dot={false}>✦ AI BEST CHOICE</Badge> : <span className="label">● {st.network}</span>}
        <StatusBadge status={st.status} text={st.status === 'OFFLINE' ? 'Offline' : `${st.freeBays}/${st.totalBays} Free`} />
      </div>
      <h3 style={{ marginTop: 8, cursor: 'pointer' }} onClick={open}>{st.name}</h3>
      <div className="sm muted">{st.distanceKm} km away • ~{st.driveMin} min drive{st.waitMin > 0 && st.waitMin < 999 ? ` • ${st.waitMin} min wait` : st.freeBays > 0 ? ' • No queue' : ''}</div>
      <div className="panel between" style={{ marginTop: 10 }}>
        <div><span className="tele" style={{ fontSize: 20 }}>{Math.round(st.maxKw)}</span> <span className="sm">kW</span><div className="label">{st.connector} {st.maxKw >= 50 ? 'DC fast' : 'AC'}</div></div>
        <div style={{ textAlign: 'right' }}><span className="tele" style={{ fontSize: 20 }}>{inr(st.tariff)}</span><span className="sm">/kWh</span><div className="label">{st.estCostTo80 != null ? `EST. ${inr(st.estCostTo80)} TO 80%` : ''}</div></div>
      </div>
      {st.aiPick && st.reasons?.[0] && <div className="sm muted" style={{ marginTop: 8 }}>✦ {st.reasons.slice(0, 2).join(' · ')}</div>}
      <div className="between" style={{ marginTop: 12 }}>
        <AmenIcons types={st.amenityTypes} />
        <div className="row">
          <a className="btn btn-soft sm" style={{ padding: 0, width: 40 }} href={mapsDir(st.lat, st.lng)} target="_blank" rel="noreferrer"><Navigation size={16} /></a>
          <ActionButton st={st} small />
        </div>
      </div>
    </div>
  );
}
