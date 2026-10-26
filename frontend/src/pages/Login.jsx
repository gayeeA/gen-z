import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Smartphone, AtSign, Star, MapPin } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';

export default function Login() {
  const nav = useNavigate(); const { login } = useAuth();
  const stats = useFetch(() => api.get('/api/public/stats'), []);
  const [mode, setMode] = useState('phone'); const [val, setVal] = useState(''); const [code, setCode] = useState('');
  const [sent, setSent] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const id = () => (mode === 'phone' ? '+91' + val.replace(/\D/g, '') : val.trim());
  const send = async () => {
    setErr(''); setBusy(true);
    try { const r = await api.post('/api/auth/otp', { id: id() }); setSent(r); if (r.devOtp) setCode(r.devOtp); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setErr(''); setBusy(true);
    try { const r = await api.post('/api/auth/verify', { id: id(), code }); login(r.token, r.user); nav('/'); } catch (e) { setErr(e.message); setBusy(false); }
  };
  const valid = mode === 'phone' ? val.replace(/\D/g, '').length === 10 : /\S+@\S+\.\S+/.test(val);
  return (
    <div className="page nonav center" style={{ paddingTop: 40 }}>
      <div className="mascot" style={{ width: 72, height: 72 }}><Zap size={36} fill="#1E1E1E" /></div>
      <h1 className="h-xl">GEN_Z <span className="badge gold nodot" style={{ verticalAlign: 'middle' }}>EV GO</span></h1>
      <p style={{ fontSize: 16, margin: 0 }}>One app. One journey. <b>Zero charging anxiety.</b></p>
      <div className="card between" style={{ textAlign: 'left' }}>
        <div className="row"><div className="icon-btn" style={{ background: 'var(--tint)' }}><MapPin size={20} /></div><div><div className="muted">Nearby Stalls</div><b className="tele">{stats.data ? stats.data.chargers.toLocaleString('en-IN') + '+ Chargers' : '…'}</b></div></div>
        <span className="badge off nodot"><Star size={12} /> {stats.data ? stats.data.rating : '–'}/5 Rating</span>
      </div>
      <div className="card" style={{ textAlign: 'left' }}>
        <div className="tabs"><button className={`tab ${mode === 'phone' ? 'on' : ''}`} onClick={() => { setMode('phone'); setSent(null); }}><Smartphone size={16} />Mobile Number</button>
          <button className={`tab ${mode === 'email' ? 'on' : ''}`} onClick={() => { setMode('email'); setSent(null); }}><AtSign size={16} />Email Address</button></div>
        <div className="between" style={{ margin: '16px 0 8px' }}><span className="label" style={{ fontSize: 12 }}>ENTER {mode === 'phone' ? 'MOBILE NUMBER' : 'EMAIL'}</span><span className="muted">Instant OTP</span></div>
        <div className="row">
          {mode === 'phone' && <div className="input row" style={{ width: 90, flex: 'none', fontWeight: 700 }}>🇮🇳 +91</div>}
          <input className="input" inputMode={mode === 'phone' ? 'numeric' : 'email'} placeholder={mode === 'phone' ? '98765 43210' : 'you@example.com'} value={val} onChange={(e) => setVal(e.target.value)} />
        </div>
        {sent && <>
          <input className="input tele" style={{ marginTop: 10, letterSpacing: '.4em', textAlign: 'center', fontSize: 20 }} maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          {sent.devOtp && <div className="sm muted" style={{ marginTop: 6 }}>Dev mode: OTP auto-filled ({sent.devOtp}). Wire an SMS/email provider and set DEV_OTP=false for production.</div>}
        </>}
        {err && <div className="err-box">{err}</div>}
        {!sent
          ? <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={!valid || busy} onClick={send}><Zap size={18} />{busy ? 'SENDING…' : 'GET OTP'}</button>
          : <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={code.length !== 6 || busy} onClick={verify}><Zap size={18} />{busy ? 'VERIFYING…' : 'SPARK IN'}</button>}
        {sent && <button className="muted" style={{ width: '100%', marginTop: 12 }} onClick={send}>Resend OTP</button>}
      </div>
      <p className="sm muted">By sparking in, you agree to the Terms of Service and Privacy Policy.</p>
    </div>);
}
