import { useNavigate } from 'react-router-dom';
import { Zap, Power, Battery, MapPin, IndianRupee, Thermometer, Wallet, Coffee, ChevronRight, TrendingUp, Compass } from 'lucide-react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { useLiveEvent, useToast } from '../live';
import { Badge, Data, Empty, Page, Ring, inr, inr2 } from '../ui';

export default function Charging() {
  const nav = useNavigate(), toast = useToast();
  const q = useFetch(() => api.get('/api/sessions/active'), []);
  useLiveEvent('SESSION_UPDATE', (d) => q.setData({ session: d }));
  useLiveEvent('SESSION_DONE', () => nav('/review'));
  const act = async (fn) => { try { return await fn(); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Page title="Live Charging" nav={false} back="/home">
      <Data q={q}>{({ session: s }) => {
        if (!s) return <Empty icon={Zap} title="No active charging session"><p>Pick a station and tap START on a free bay.</p><button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => nav('/map')}>FIND A CHARGER</button></Empty>;
        const mode = s.done ? 'COMPLETE' : s.powerKw >= 50 ? 'FAST-CHARGE ACTIVE' : 'AC CHARGING';
        return <>
          <div className="card row between" style={{ padding: 14 }}><div className="row"><span className="icon-btn" style={{ background: 'var(--tint)', borderRadius: 14 }}><MapPin /></span><div><div className="label">● LIVE HUB CONNECTION</div><b style={{ fontSize: 17 }}>{s.stationName} · Bay {s.bay}</b></div></div>
            <button className="btn sm" style={{ background: '#FFD9D6', color: 'var(--red)' }} onClick={async () => { await act(() => api.post(`/api/sessions/${s.id}/stop`)); nav('/review'); }}><Power size={14} />Stop</button></div>
          <div className="card yellow center" style={{ padding: 24 }}>
            <Ring pct={s.soc} size={250} stroke={26}>
              <div style={{ width: 150, height: 150, borderRadius: '50%', background: 'var(--tint)', display: 'grid', placeItems: 'center' }}><div><Zap size={34} fill="#1E1E1E" /><div className="tele" style={{ fontSize: 50, lineHeight: '50px' }}>{Math.round(s.soc)}<span style={{ fontSize: 22 }}>%</span></div><div className="badge gold nodot" style={{ background: '#fff' }}>⚡ {mode}</div></div></div>
            </Ring>
            <div className="btn btn-dark" style={{ marginTop: 16, justifyContent: 'space-between', borderRadius: 30, textTransform: 'none' }}><span><Zap size={16} fill="#FFCB05" color="#FFCB05" /> <b className="tele" style={{ color: '#FFCB05', fontSize: 20 }}>{s.powerKw} kW</b> <span className="sm">{s.powerKw >= 100 ? 'Hyper' : s.powerKw >= 50 ? 'Superfast' : 'AC'}</span></span><span className="sm">⏱ {s.minsTo80 > 0 ? `${s.minsTo80}m to 80%` : s.done ? 'Done' : `${s.minsToTarget}m to ${Math.round(s.targetSoc)}%`}</span></div>
          </div>
          <div className="grid2">
            <div className="card" style={{ margin: '14px 0 0' }}><div className="between"><span>Energy added</span><Battery size={16} /></div><span className="tele" style={{ fontSize: 30 }}>{s.energyKwh}</span> kWh<div className="sm" style={{ color: 'var(--green)', fontWeight: 700 }}><TrendingUp size={12} /> +{s.rateKwhPerMin} kWh/min</div></div>
            <div className="card" style={{ margin: '14px 0 0' }}><div className="between"><span>Added range</span><Compass size={16} /></div><span className="tele" style={{ fontSize: 30 }}>+{Math.round(s.addedRangeKm)}</span> km<div className="sm muted">Est. {Math.round(s.totalRangeKm)} km total</div></div>
            <div className="card" style={{ margin: 0 }}><div className="between"><span>Session cost</span><IndianRupee size={16} /></div><span className="tele" style={{ fontSize: 30 }}>{inr2(s.cost)}</span><div className="label">Tariff: {inr(s.tariff)}/kWh</div></div>
            <div className="card" style={{ margin: 0 }}><div className="between"><span>Battery temp</span><Thermometer size={16} color="#E53935" /></div><span className="tele" style={{ fontSize: 30 }}>{s.tempC}°C</span><div className="sm" style={{ color: s.tempC > 45 ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>● {s.tempC > 45 ? 'High' : 'Optimal condition'}</div></div>
          </div>
          <div className="card row between" onClick={() => nav('/profile')} style={{ cursor: 'pointer' }}><div className="row"><span className="icon-btn" style={{ background: 'var(--soft)' }}><Wallet /></span><div><b style={{ fontSize: 17 }}>GEN_Z Spark AutoPay ✔</b><div className="sm muted">Prepaid balance: {inr(s.wallet)} {s.autopay ? '· Auto-debit on' : '· Autopay off'}</div></div></div><span className="badge off nodot">Manage</span></div>
          {s.cafe && <div className="card soft row between"><span className="row"><Coffee /><span><div className="label">{s.cafe.name} · {Math.max(1, Math.round(s.cafe.meters / 80))} min walk</div><b>Grab a coffee while Bay #{s.bay} charges</b></span></span><ChevronRight /></div>}
          {s.targetSoc < 100 && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={async () => { const r = await act(() => api.post(`/api/sessions/${s.id}/boost`)); r && q.setData({ session: r }); }}><Zap size={18} />BOOST TO 100% (OVERRIDE)</button>}
        </>; }}
      </Data>
    </Page>);
}
