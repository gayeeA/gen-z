import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Zap, MapPin, Wand2, Coffee, Bath, Wifi, ShieldCheck, Navigation, GitFork, Lock } from 'lucide-react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { useToast } from '../live';
import { AMEN_ICON, AMEN_LABEL, Badge, Data, Page, StatusBadge, dur, inr } from '../ui';

const stat = (s) => (s.waitMin > 0 && s.freeBays === 0 ? 'OCCUPIED' : s.freeBays <= 1 ? 'LIMITED' : 'AVAILABLE');

export default function Compare() {
  const { id } = useParams(); const nav = useNavigate(), toast = useToast();
  const q = useFetch(() => api.get(`/api/trips/${id}`), [id]);
  const [sort, setSort] = useState('best'), [busy, setBusy] = useState(false);
  const select = async (sid) => { setBusy(true); try { await api.post(`/api/trips/${id}/select`, { stationId: sid }); toast('Bay held for 25 minutes', 'ok', 'FastHold enabled'); nav(`/trip/${id}`); } catch (e) { toast(e.message, 'err'); setBusy(false); } };
  return (
    <Page title="Station Comparison" back={`/trip/${id}`} nav={false}>
      <Data q={q}>{(t) => {
        const p = t.plan; const all = [...p.candidates];
        const list = sort === 'best' ? all : [...all].sort((a, b) => a.detourKm - b.detourKm);
        const best = list[0], rest = list.slice(1), top3 = list.slice(0, 3);
        if (!best) return <div className="empty">No alternative stations on this route.</div>;
        const lo = (k) => Math.min(...top3.map((x) => x[k]));
        return <>
          <div className="row between"><div><span className="label">⇄ Trip stop analyzer</span><h1 className="h-xl" style={{ fontSize: 26 }}>Compare Charging Hubs</h1><div className="sm muted">{t.from.name} → {t.to.name}</div></div><span className="badge gold nodot">{all.length} STATIONS</span></div>
          <div className="tabs" style={{ marginTop: 10 }}><button className={`tab ${sort === 'best' ? 'on' : ''}`} onClick={() => setSort('best')}><Zap size={14} />Best Match First</button><button className={`tab ${sort === 'detour' ? 'on' : ''}`} onClick={() => setSort('detour')}><Navigation size={14} />Min Detour</button></div>

          <div className="card yellow" style={{ border: '2px solid var(--yellow)' }}>
            <div className="between"><Badge kind="gold" dot={false}>✦ {sort === 'best' ? 'AI OPTIMAL PICK' : 'SMALLEST DETOUR'}</Badge>{sort === 'best' && p.savesMin > 0 && <b className="tele" style={{ fontSize: 18 }}>Saves {p.savesMin}m</b>}</div>
            <div className="between" style={{ marginTop: 8 }}><h3 style={{ fontSize: 20 }}>{best.name}</h3><StatusBadge status={stat(best)} text={`${best.freeBays}/${best.totalBays} Free`} /></div>
            <div className="sm muted"><MapPin size={12} /> Km {Math.round(best.km)} · {best.detourKm} km detour · {best.waitMin} min queue</div>
            <div className="panel white grid3" style={{ marginTop: 10, textAlign: 'center' }}>
              <div><div className="label">Max power</div><b className="tele" style={{ fontSize: 22 }}>{Math.round(best.powerKw)} kW</b></div>
              <div style={{ background: 'var(--tint)', borderRadius: 12 }}><div className="label">Session time</div><b className="tele" style={{ fontSize: 22 }}>{best.chargeMin} min</b><div className="sm muted">{Math.round(best.arrivalSoc)}% → {Math.round(best.targetSoc)}%</div></div>
              <div><div className="label">Est. cost</div><b className="tele" style={{ fontSize: 22 }}>{inr(best.cost)}</b><div className="sm muted">{inr(best.tariff)}/kWh</div></div></div>
            {best.reasons?.length > 0 && <div className="card tint" style={{ margin: '10px 0 0', padding: 12 }}><b>✦ Why this wins:</b> <span className="sm">{best.reasons.join(' · ')}.</span></div>}
            <div className="between" style={{ marginTop: 10 }}><div className="row wrap">{best.amenityTypes.slice(0, 4).map((a) => { const I = AMEN_ICON[a] || Zap; return <span key={a} className="chip" style={{ height: 30, textTransform: 'none' }}><I size={13} />{AMEN_LABEL[a] || a}</span>; })}</div><Badge kind="ok" dot={false}><ShieldCheck size={12} /> {best.safety} Safety</Badge></div>
          </div>

          {rest.length > 0 && <div className="between"><h2>Alternative Stations</h2><span className="label">{rest.length} OTHERS ANALYZED</span></div>}
          {rest.map((s) => (
            <div key={s.stationId} className="card">
              <div className="between"><h3>{s.name}</h3><StatusBadge status={stat(s)} text={s.freeBays === 0 ? '0 Free' : `${s.freeBays}/${s.totalBays} Free`} /></div>
              <div className="sm" style={{ color: s.detourKm > 5 ? 'var(--red)' : 'inherit' }}>↗ {s.detourKm} km detour</div>
              <div className="panel grid2" style={{ marginTop: 8, gridTemplateColumns: 'repeat(4,1fr)', textAlign: 'center' }}>
                {[['Speed', Math.round(s.powerKw) + ' kW'], ['Charge', s.chargeMin + ' min'], [s.freeBays ? 'Queue' : 'Wait', s.waitMin ? `~${s.waitMin} min` : '0'], ['Cost', inr(s.cost)]].map(([k, v]) => <div key={k}><div className="label" style={{ fontSize: 9 }}>{k}</div><b className="tele">{v}</b></div>)}</div>
              <div className="between" style={{ marginTop: 8 }}><span className="sm muted">{s.amenities.slice(0, 3).join(', ') || 'Basic'}</span><span className="sm"><ShieldCheck size={12} /> {s.safety}/100</span></div>
              <button className="btn btn-soft md" style={{ marginTop: 10 }} disabled={busy} onClick={() => select(s.stationId)}>Choose this stop</button>
            </div>))}

          <div className="card"><h3>Telemetry Matrix <span className="label" style={{ float: 'right' }}>SIDE-BY-SIDE</span></h3>
            <div className="scroll-x"><table className="table"><thead><tr><th>Metric</th>{top3.map((s, i) => <th key={s.stationId} className={i === 0 ? 'hl' : ''}>{s.network}</th>)}</tr></thead><tbody>
              {[['Max power', (s) => `${Math.round(s.powerKw)} kW`], ['Est. total cost', (s) => inr(s.cost), 'cost'], ['Total stop time', (s) => dur(s.stopMin), 'stopMin'], ['Detour off route', (s) => `${s.detourKm} km`, 'detourKm'], ['Safety rating', (s) => `${s.safety} / 100`], ['Food & washroom', (s) => s.amenities.slice(0, 2).join(', ') || '–']].map(([k, f, best]) =>
                <tr key={k}><td><b>{k}</b></td>{top3.map((s, i) => <td key={s.stationId} className={i === 0 ? 'hl' : ''} style={best && s[best] === lo(best) ? { color: 'var(--green)', fontWeight: 700 } : null}>{f(s)}</td>)}</tr>)}
            </tbody></table></div></div>

          <div className="card yellow row"><span className="icon-btn" style={{ background: 'var(--ink)', color: '#fff' }}><Zap size={18} fill="#FFCB05" /></span><div><b style={{ fontSize: 16 }}>FastHold Enabled</b><div className="sm">Selecting {best.name.split('–').pop().trim()} locks a bay for 25 minutes until you arrive.</div></div></div>
          <div className="col" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => select(best.stationId)}><Zap size={18} />SELECT & RESERVE BAY</button>
            {rest[0] && <button className="btn btn-soft" disabled={busy} onClick={() => select(rest[0].stationId)}><GitFork size={16} />Swap preferred route stop</button>}
          </div>
        </>; }}
      </Data>
    </Page>);
}
