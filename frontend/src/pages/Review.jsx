import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Camera, Check, Plus, Lock, Gauge, ParkingSquare, Radio, Gift, BatteryCharging, Timer } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { useToast } from '../live';
import { Badge, Data, Empty, Page, Stars } from '../ui';

const shrink = (file) => new Promise((res) => { const img = new Image(); img.onload = () => { const k = 480 / Math.max(img.width, img.height, 480); const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.6)); }; img.src = URL.createObjectURL(file); });
const WORDS = ['', 'Poor experience', 'Could be better', 'Decent charge', 'Great charging!', 'Excellent Fast Charging!'];

export default function Review() {
  const nav = useNavigate(), toast = useToast(), { refresh, user } = useAuth(); const file = useRef();
  const q = useFetch(() => api.get('/api/reviews/pending'), []); const tags = useFetch(() => api.get('/api/reviews/tags'), []);
  const [rating, setRating] = useState(0), [sel, setSel] = useState([]), [latch, setLatch] = useState(true), [clear, setClear] = useState(true), [photos, setPhotos] = useState([]), [text, setText] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (s) => {
    setBusy(true);
    try { const r = await api.post('/api/reviews', { sessionId: s.id, rating, tags: sel, latchOk: latch, bayClear: clear, photos, comment: text }); toast(`+${r.pointsAwarded} Spark points added`, 'ok', 'Review verified'); refresh(); nav('/home'); } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  const Seg = ({ v, set, a, b }) => <div className="tabs" style={{ padding: 3 }}>{[[true, a], [false, b]].map(([k, t]) => <button key={t} className={`tab ${v === k ? 'on' : ''}`} style={{ height: 30, fontSize: 11, padding: '0 12px', flex: 'none' }} onClick={() => set(k)}>{t}</button>)}</div>;
  return (
    <Page title="Review Station" back="/home" nav={false}>
      <Data q={q}>{(d) => {
        if (!d.session) return <Empty icon={Check} title="Nothing to review"><p>Finish a charging session and you can review the station here.</p></Empty>;
        const s = d.session, st = d.station, eff = Math.min(99, Math.round(s.peakKw / s.powerKw * 100));
        return <>
          <div className="card row" style={{ border: '1px solid var(--red)', padding: 12 }}><span className="icon-btn" style={{ background: 'var(--yellow)' }}><Zap fill="#1E1E1E" /></span><div className="grow"><div className="label" style={{ color: 'var(--red)' }}>DRIVER REWARD</div><b>+100 Spark Points for Verified Review</b></div><span className="badge off nodot">Lv.{user.level}</span></div>
          <div className="card"><div className="between"><span className="badge gold nodot">● Completed {Math.max(0, Math.round((Date.now() - new Date(s.endAt)) / 60000))} mins ago</span><span className="badge off nodot">{st.connector}</span></div>
            <h3 style={{ fontSize: 22, margin: '8px 0 2px' }}>{st.name.split('–').pop().trim()}</h3><div className="sm muted">{st.address} · Bay #{s.bay}</div>
            <div className="grid2" style={{ marginTop: 10 }}><div className="panel row"><BatteryCharging size={18} /><div><div className="label">Delivered</div><b className="tele">{s.energy.toFixed(1)} kWh</b></div></div><div className="panel row"><Timer size={18} /><div><div className="label">Duration</div><b className="tele">{d.durationMin} mins</b></div></div></div>
            <div className="panel row" style={{ marginTop: 10 }}><Zap size={18} /><span>How was your Spark session, <b>{user.name.split(' ')[0]}</b>? Real community intelligence saves other drivers from range anxiety!</span></div></div>
          <div className="card"><Stars value={rating} onChange={setRating} />{rating > 0 && <div className="center" style={{ marginTop: 10 }}><Badge kind="gold" dot={false}>✔ {WORDS[rating]} ({rating}.0)</Badge></div>}</div>
          <div className="card"><div className="between"><h3>Session Highlights</h3><span className="label">TAP TO TAG</span></div>
            <div className="chips" style={{ flexWrap: 'wrap', marginTop: 10 }}>{tags.data?.map((t) => <button key={t.id} className={`chip ${sel.includes(t.label) ? 'sel' : ''}`} style={{ textTransform: 'none', fontFamily: 'var(--f)', height: 40 }} onClick={() => setSel(sel.includes(t.label) ? sel.filter((x) => x !== t.label) : [...sel, t.label])}>{sel.includes(t.label) ? <Check size={14} /> : <Plus size={14} />}{t.label}</button>)}</div></div>
          <div className="card"><h3><Radio size={16} /> Station Telemetry Check</h3>
            <div className="panel between" style={{ marginTop: 10 }}><div><div className="label">Telemetry peak measured</div><b className="tele" style={{ fontSize: 24 }}>{s.peakKw} kW</b> <span className="sm muted">(Advertised {s.powerKw} kW)</span></div><span className="badge gold nodot">{eff}% Efficiency</span></div>
            <div className="panel between" style={{ marginTop: 8 }}><span className="row"><Lock size={16} />Gun latch unlocked cleanly on stop?</span><Seg v={latch} set={setLatch} a="Yes" b="No" /></div>
            <div className="panel between" style={{ marginTop: 8 }}><span className="row"><ParkingSquare size={16} />EV bays clear of non-EV ICE cars?</span><Seg v={clear} set={setClear} a="Clear" b="Blocked" /></div></div>
          <div className="card"><div className="between"><h3><Camera size={16} /> Photo Verification</h3><span style={{ color: 'var(--red)', fontWeight: 700 }} className="label">+50 SPARK PTS</span></div>
            <div className="row" style={{ marginTop: 10 }}>{photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 90, height: 90, borderRadius: 14, objectFit: 'cover' }} />)}
              {photos.length < 3 && <button className="panel col" style={{ width: 90, height: 90, alignItems: 'center', justifyContent: 'center' }} onClick={() => file.current.click()}><Camera /><span className="label">Add Photo</span></button>}
              <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files[0]; if (f) setPhotos([...photos, await shrink(f)]); e.target.value = ''; }} /></div></div>
          <div className="card"><div className="between"><h3>Community Advice</h3><span className="label">{text.length}/300</span></div><textarea className="input" rows={3} maxLength={300} style={{ marginTop: 8 }} placeholder="Share a tip for the next driver…" value={text} onChange={(e) => setText(e.target.value)} /></div>
          <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={!rating || busy} onClick={() => submit(s)}><Zap size={18} />SUBMIT VERIFIED REVIEW</button>
          <button className="muted center" style={{ width: '100%', padding: 14 }} onClick={() => nav('/home')}>Skip for now</button>
        </>; }}
      </Data>
    </Page>);
}
