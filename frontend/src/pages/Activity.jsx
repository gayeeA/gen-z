import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Download, FileText, Mail, Star, Route, ShieldCheck, TrendingUp, Leaf, PiggyBank, Fuel, CalendarDays, RotateCw, BarChart3 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { useToast } from '../live';
import { Badge, Data, Empty, Modal, Page, dur, inr, inr2 } from '../ui';

const TYPES = [['ALL', 'All Sessions', Zap], ['FAST', 'Fast DC Charges', Zap], ['TRIPS', 'Intercity Trips', Route]];
const rel = (iso) => { const d = Math.floor((Date.now() - new Date(iso)) / 86400000); return d < 1 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };

export default function Activity() {
  const nav = useNavigate(), toast = useToast(), { user } = useAuth();
  const [type, setType] = useState('ALL'), [modal, setModal] = useState(null);
  const sum = useFetch(() => api.get('/api/activity/summary'), []);
  const tl = useFetch(() => api.get('/api/activity/timeline?type=' + type), [type]);
  const gm = useFetch(() => api.get('/api/activity/gamification'), []);
  const invoice = async (id) => { try { setModal({ kind: 'inv', data: await api.get(`/api/sessions/${id}/invoice`) }); } catch (e) { toast(e.message, 'err'); } };
  const exportCsv = async () => {
    try { const t = await api.text('/api/activity/export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = `genz-${sum.data?.month || 'export'}.csv`; a.click(); } catch (e) { toast(e.message, 'err'); }
  };
  const replan = async (id) => { try { const t = await api.post(`/api/trips/${id}/replan`); nav(`/trip/${t.id}`); } catch (e) { toast(e.message, 'err'); } };
  return (
    <Page title="Activity">
      <Data q={sum} skeleton={1}>{(s) => <div className="card">
        <Badge kind="gold" dot={false}>⚡ VOLT SPARK DIARY</Badge>
        <h1 className="h-xl" style={{ margin: '8px 0 2px' }}>Charging & Trip Activity</h1><div className="muted">Your electric mileage, hypercharges & eco-savings.</div>
        <div className="panel" style={{ marginTop: 14 }}><div className="between"><span className="label"><CalendarDays size={12} /> This month ({s.title})</span><Badge kind="gold" dot={false}>{s.sessions} Sessions</Badge></div>
          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="panel white"><div className="label">Energy taken</div><b className="tele" style={{ fontSize: 26 }}>{s.energyKwh}</b> kWh{s.deltaPct != null && <div className="sm" style={{ color: s.deltaPct >= 0 ? 'var(--green)' : 'var(--red)' }}><TrendingUp size={12} /> {s.deltaPct >= 0 ? '+' : ''}{s.deltaPct}% vs last month</div>}</div>
            <div className="panel white"><div className="label">Total spent</div><b className="tele" style={{ fontSize: 26 }}>{inr(s.spent)}</b><div className="sm muted">{s.avgRate ? `${inr2(s.avgRate)} / kWh avg` : '–'}</div></div>
            <div className="panel white"><div className="label">Fuel savings</div><b className="tele" style={{ fontSize: 26 }}>{inr(s.fuelSavings)}</b><div className="sm muted"><Fuel size={12} /> vs petrol car</div></div>
            <div className="panel white"><div className="label">CO₂ abated</div><b className="tele" style={{ fontSize: 26 }}>{s.co2Kg}</b> kg<div className="sm muted"><Leaf size={12} /> ~{s.trees} trees planted</div></div></div></div>
      </div>}</Data>
      <div className="chips" style={{ marginTop: 14 }}>{TYPES.map(([k, t, I]) => <button key={k} className={`chip ${type === k ? 'sel' : ''}`} onClick={() => setType(k)}><I size={14} />{t}</button>)}</div>
      <div className="between"><h2 style={{ margin: '10px 0' }}>Timeline Log</h2><button className="label" style={{ color: 'var(--brown)' }} onClick={exportCsv}>EXPORT CSV <Download size={12} /></button></div>
      <Data q={tl}>{(list) => !list.length ? <Empty icon={BarChart3} title="No activity yet"><p>Your charging sessions and trips will show up here.</p></Empty> : list.map((x) => x.kind === 'SESSION' ? (
        <div key={x.id} className="card">
          <div className="between"><div className="row"><span className="icon-btn" style={{ background: 'var(--yellow)', borderRadius: 14 }}><Zap /></span><div><b style={{ fontSize: 17, cursor: 'pointer' }} onClick={() => nav(`/station/${x.stationId}`)}>{x.title}</b><div className="sm muted">{rel(x.at)} · {x.network}</div></div></div><Badge kind="gold" dot={false}>{x.powerKw} kW</Badge></div>
          <div className="panel grid3" style={{ marginTop: 10, textAlign: 'center' }}><div><div className="label">Power</div><b className="tele" style={{ fontSize: 18 }}>{x.energy}</b> kWh</div><div><div className="label">Duration</div><b className="tele" style={{ fontSize: 18 }}>{x.durationMin}</b> min</div><div><div className="label">Billed</div><b className="tele" style={{ fontSize: 18 }}>{inr2(x.cost)}</b></div></div>
          <div className="between" style={{ marginTop: 10 }}><div className="row"><Badge kind={x.payment === 'PAID' ? 'ok' : 'warn'}>{x.payment === 'PAID' ? 'AutoPay Completed' : 'Payment pending'}</Badge>
            {x.rating ? <span>{'★'.repeat(x.rating)}<span className="muted">{'★'.repeat(5 - x.rating)}</span></span> : <button className="label" style={{ color: 'var(--brown)' }} onClick={() => nav('/review')}>☆ Rate</button>}</div>
            <button className="btn btn-soft sm" onClick={() => invoice(x.id)}><FileText size={14} />Invoice</button></div>
        </div>) : (
        <div key={x.id} className="card">
          <div className="between"><div className="row"><span className="icon-btn" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 14 }}><Route /></span><div><b style={{ fontSize: 17 }}>{x.from} → {x.to}</b><div className="sm muted">{rel(x.at)} · {x.status === 'ACTIVE' ? 'In progress' : 'Completed'}</div></div></div><span className="badge off nodot">{x.plan.distanceKm} km</span></div>
          {x.plan.stops?.[0] && <div className="panel" style={{ marginTop: 10 }}><div className="between"><span className="sm">⚡ {x.plan.stops.length} stop{x.plan.stops.length > 1 ? 's' : ''}: <b>{x.plan.stops[0].name.split('–').pop().trim()}</b></span><span className="badge gold nodot">{Math.round(x.plan.stops[0].arrivalSoc)}% → {Math.round(x.plan.stops[0].targetSoc)}%</span></div>
            <div className="between sm" style={{ marginTop: 6 }}><span>Charge stop: {x.plan.stops[0].chargeMin} mins</span><b style={{ color: 'var(--green)' }}>Saved {inr(x.plan.savings)} vs petrol</b></div></div>}
          <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}><button className="btn btn-soft sm" onClick={() => setModal({ kind: 'trip', data: x })}><BarChart3 size={14} />Route Stats</button><button className="btn btn-primary sm" onClick={() => replan(x.id)}><RotateCw size={14} />Re-plan Trip</button></div>
        </div>))}
      </Data>
      <Data q={gm} skeleton={1}>{(g) => <div className="card"><div className="row"><span className="icon-btn" style={{ background: '#FFDAD6' }}><Zap color="#E53935" fill="#E53935" /></span><div className="grow"><h3>Driver Reliability & Sparks</h3></div><span className="label" style={{ color: 'var(--red)' }}>GAMIFIED PERKS</span></div>
        <div className="panel row" style={{ marginTop: 10 }}><span className="icon-btn" style={{ background: 'var(--yellow)', borderRadius: 14 }}><Zap /></span><div className="grow"><b>{g.levelName} Level {g.level}</b><div className="sm muted">{g.perks.find((p) => !p.unlocked)?.title ? `Next: ${g.perks.find((p) => !p.unlocked).title} at ${g.perks.find((p) => !p.unlocked).xpRequired} XP` : 'All perks unlocked'}</div></div><span className="tele">{g.xp.toLocaleString('en-IN')} XP</span></div>
        <div className="bar" style={{ margin: '10px 0' }}><i style={{ width: Math.min(100, g.xp / g.nextLevelXp * 100) + '%' }} /></div>
        {g.perks.map((p) => <div key={p.title} className="between sm" style={{ opacity: p.unlocked ? 1 : .5, marginTop: 6 }}><span>{p.unlocked ? '✅' : '🔒'} {p.title}</span><span className="muted">{p.xpRequired} XP</span></div>)}
        <div className="panel row" style={{ marginTop: 10 }}><span className="icon-btn" style={{ background: 'var(--ink)', color: 'var(--yellow)', borderRadius: 14 }}><ShieldCheck /></span><div className="grow"><b>Zero No-Shows Streak</b><div className="sm muted">{g.streak} consecutive sessions honoured · {g.noShows} no-show{g.noShows === 1 ? '' : 's'}</div></div><span className="badge gold nodot" style={{ background: 'var(--yellow)' }}>+{inr(g.streakCredits)} credits</span></div></div>}</Data>

      {modal?.kind === 'inv' && <Modal title="Invoice" onClose={() => setModal(null)}>{(() => { const i = modal.data, s = i.session; return <div className="col" style={{ marginTop: 12 }}>
        <div className="panel white"><div className="label">{i.invoiceNo}</div><b>{s.stationName}</b><div className="sm muted">{new Date(s.startAt).toLocaleString('en-IN')} · Bay {s.bay} · {s.network}</div></div>
        <div className="panel white sm"><div className="between"><span>Energy</span><b>{s.energy.toFixed(2)} kWh @ {inr2(s.tariff)}</b></div><div className="between"><span>Duration</span><b>{i.durationMin} min</b></div><div className="between"><span>Included GST (18%)</span><b>{inr2(i.gst)}</b></div><div className="between"><span>Total</span><b className="tele" style={{ fontSize: 20 }}>{inr2(s.cost)}</b></div><div className="between"><span>Payment</span><b>{s.payment}</b></div></div>
        <button className="btn btn-dark md" onClick={() => window.print()}><Download size={16} />PRINT / SAVE PDF</button></div>; })()}</Modal>}
      {modal?.kind === 'trip' && <Modal title="Route stats" onClose={() => setModal(null)}>{(() => { const p = modal.data.plan; return <div className="col" style={{ marginTop: 12 }}>
        <div className="grid2"><div className="panel"><div className="label">Distance</div><b className="tele" style={{ fontSize: 22 }}>{p.distanceKm} km</b></div><div className="panel"><div className="label">Total time</div><b className="tele" style={{ fontSize: 22 }}>{dur(p.totalMin)}</b></div>
          <div className="panel"><div className="label">Energy</div><b className="tele" style={{ fontSize: 22 }}>{p.energyKwh} kWh</b></div><div className="panel"><div className="label">Charging cost</div><b className="tele" style={{ fontSize: 22 }}>{inr(p.cost)}</b></div></div>
        {p.stops.map((s) => <div key={s.stationId} className="panel white"><b>{s.name}</b><div className="sm muted">Km {Math.round(s.km)} · {Math.round(s.arrivalSoc)}% → {Math.round(s.targetSoc)}% · {s.chargeMin} min · {inr(s.cost)}</div></div>)}</div>; })()}</Modal>}
    </Page>);
}
