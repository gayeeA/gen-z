import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';

export default function Splash() {
  const { user, loading } = useAuth(); const nav = useNavigate();
  const [steps, setSteps] = useState([
    { title: 'Battery BMS Handshake', badge: 'SYNCED' }, { title: 'Grid Capacity & Slot Check', badge: 'LIVE' }, { title: 'AI Route Optimization', badge: 'ACTIVE' }]);
  const fact = useFetch(() => api.get('/api/public/fact'), []);
  const ses = useFetch(() => (user ? api.get('/api/sessions/active') : Promise.resolve(null)), [user?.id]);
  useEffect(() => {
    if (!user) return;
    let dead = false;
    const set = (i, p) => !dead && setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
    (async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const v = user.vehicle;
      await wait(400); set(0, { done: true, ok: !!v, detail: v ? `Verified ${v.packV}V ${v.connector} · ${v.model}` : 'No EV linked yet. Add one next.' });
      try { const h = await api.get('/api/health');
        await wait(400); set(1, { done: true, ok: true, detail: `${h.liveChargers} live chargers across ${h.stations} stations` });
        await wait(400); set(2, { done: true, ok: h.optimizer, detail: h.optimizer ? `Optimizer online · ${h.gemini ? 'Gemini AI ready' : 'Gemini key not set'}` : 'Optimizer offline: plans unavailable' });
      } catch (e) { set(1, { done: true, ok: false, detail: e.message }); set(2, { done: true, ok: false, detail: 'Skipped' }); }
    })();
    return () => { dead = true; };
  }, [user?.id]);
  const done = steps.filter((s) => s.done).length, pct = Math.round((done / steps.length) * 100);
  const v = user?.vehicle, s = ses.data?.session;

  if (loading) return <div className="spin" />;
  if (!user) return (
    <div className="page nonav center" style={{ paddingTop: 80 }}>
      <div className="mascot"><Zap size={48} fill="#1E1E1E" /></div>
      <h1 className="h-xl" style={{ marginTop: 24 }}>GEN_Z</h1>
      <p className="muted">One app. One journey. Zero charging anxiety.</p>
      <button className="btn btn-primary" style={{ marginTop: 40 }} onClick={() => nav('/login')}><Zap size={18} />GET STARTED</button>
    </div>);
  return (
    <div className="page nonav" style={{ paddingTop: 16 }}>
      <div className="center"><span className="badge gold">THUNDERGRID SYNC {done < steps.length ? 'RUNNING' : 'ACTIVE'} ⚡</span></div>
      <div className="card yellow center" style={{ padding: 26 }}>
        <div className="mascot"><Zap size={48} fill="#1E1E1E" /></div>
        <div className="panel white between" style={{ marginTop: 18, textAlign: 'left' }}>
          <div className="row"><div className="icon-btn" style={{ background: 'var(--yellow)', borderRadius: 12 }}><Zap size={20} fill="#1E1E1E" /></div>
            <div><div className="label">Current output</div><span className="tele" style={{ fontSize: 22 }}>{s ? s.powerKw : 0}</span> kW</div></div>
          <div style={{ textAlign: 'right' }}><div className="label">Battery level</div><span className="tele" style={{ fontSize: 22, color: '#6f5700' }}>{Math.round(s ? s.soc : v?.soc || 0)}%</span></div>
        </div>
      </div>
      <h1 className="h-xl center" style={{ marginTop: 22 }}>Powering Up Your Journey…</h1>
      <p className="center muted">Syncing real-time telemetry with the charging grid.</p>
      <div className="card"><div className="between"><b>System Calibration</b><span className="tele" style={{ fontSize: 20 }}>{pct}%</span></div>
        <div className={`bar ${pct < 100 ? 'striped' : ''}`} style={{ margin: '10px 0' }}><i style={{ width: pct + '%' }} /></div>
        <div className="between label"><span>{pct < 100 ? 'INITIALIZING' : 'READY'}</span><span>{pct < 100 ? 'READY SHORTLY' : 'ALL SYSTEMS GO'}</span></div></div>
      {steps.map((s) => (
        <div key={s.title} className="card row" style={{ padding: 14, marginTop: 10 }}>
          {s.done ? <CheckCircle2 color={s.ok ? '#2E9E5B' : '#E53935'} /> : <Loader2 className="spin-i" size={22} style={{ animation: 'spin 1s linear infinite' }} />}
          <div className="grow"><b>{s.title}</b><div className="sm muted">{s.detail || 'Checking…'}</div></div>
          {s.done && <span className={`badge ${s.ok ? 'ok' : 'bad'} nodot`}>{s.ok ? s.badge : 'CHECK'}</span>}
        </div>))}
      {fact.data?.text && <div className="card tint row" style={{ padding: 14 }}><Zap size={18} fill="#1E1E1E" /><div className="sm"><b>Fun fact:</b> {fact.data.text}</div></div>}
      <button className="btn btn-primary" style={{ marginTop: 20 }} disabled={done < steps.length} onClick={() => nav(v ? '/home' : '/vehicle-setup')}><Zap size={18} />SYNC NOW & DRIVE</button>
      <button className="center muted" style={{ width: '100%', marginTop: 14 }} onClick={() => nav(v ? '/home' : '/vehicle-setup')}>Skip to Dashboard →</button>
    </div>);
}
