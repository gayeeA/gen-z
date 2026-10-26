import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Phone, Pencil, Settings2, Plus, Snowflake, Ambulance, Music, Landmark, FileText, ChevronRight, Shield, Navigation, LogOut, Wallet, Thermometer } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { useToast } from '../live';
import { Badge, Data, Modal, Page, Toggle, inr } from '../ui';

const LOC = [['WHILE_USING', 'While using the app'], ['NAVIGATION_ONLY', 'Only during navigation'], ['DENY', "Don't allow"]];

export default function Profile() {
  const { user, setUser, logout } = useAuth(); const nav = useNavigate(), toast = useToast();
  const nets = useFetch(() => api.get('/api/networks'), []); const help = useFetch(() => api.get('/api/public/helplines'), []);
  const [modal, setModal] = useState(null), [form, setForm] = useState({});
  const v = user.vehicle, st = user.settings;
  const call = async (fn, ok) => { try { const r = await fn(); if (r?.id) setUser(r); ok && toast(ok); setModal(null); } catch (e) { toast(e.message, 'err'); } };
  const setS = (patch) => call(() => api.put('/api/me/settings', { ...st, ...patch }));
  const toggleNet = (n) => setS({ networks: st.networks.includes(n) ? st.networks.filter((x) => x !== n) : [...st.networks, n] });
  const open = (k, f = {}) => { setForm(f); setModal(k); };
  const roadside = help.data?.find((h) => /^[+\d][\d\s-]{2,}$/.test(h.phone));
  const hl = help.data?.[0];
  return (
    <Page title="Profile">
      <div className="card yellow" style={{ marginTop: 6 }}>
        <div className="row"><div className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>{user.avatar ? <img src={user.avatar} alt="" /> : user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
          <div className="grow"><div className="row"><h2 style={{ margin: 0 }}>{user.name}</h2><button onClick={() => open('name', { name: user.name, email: user.email || '' })}><Pencil size={14} /></button></div>
            <Badge kind="gold" dot={false}>☆ {user.levelName.toUpperCase()}</Badge><div className="sm"><Phone size={12} /> {user.phone || user.email}</div></div></div>
        <div className="panel row between" style={{ marginTop: 12, background: 'var(--tint)' }}><div className="row"><span className="icon-btn" style={{ background: 'var(--yellow)' }}>$</span><div><div className="label">Spark points balance</div><b className="tele" style={{ fontSize: 22 }}>{user.points.toLocaleString('en-IN')} Pts</b></div></div>
          <button className="btn btn-primary sm" disabled={user.redeemable < 10} onClick={() => call(() => api.post('/api/me/redeem'), `${inr(user.redeemable)} added to your wallet`)}>REDEEM {inr(user.redeemable)} →</button></div>
      </div>

      <div className="card"><div className="between"><span className="label">● Primary linked EV</span><span className="badge off nodot">{v.connector} COMBO</span></div>
        <h3 style={{ fontSize: 20, margin: '6px 0 0' }}>{v.model}</h3><div className="sm muted">{v.variant} • {v.plate || 'No plate added'}</div>
        <div className="panel between" style={{ marginTop: 10, background: 'linear-gradient(135deg,#1E1E1E,#4a3b00)', color: '#fff' }}><span className="row"><Zap size={16} color="#FFCB05" />Active telemetry sync</span><b className="tele" style={{ fontSize: 22, color: '#FFCB05' }}>{Math.round(v.soc)}% SoC</b></div>
        <div className="grid3" style={{ marginTop: 10, textAlign: 'center' }}><div className="panel"><div className="label">Capacity</div><b className="tele">{v.batteryKwh} kWh</b></div><div className="panel"><div className="label">Max DC</div><b className="tele">{v.maxDcKw} kW</b></div><div className="panel"><div className="label">Battery SOH</div><b className="tele" style={{ color: 'var(--green)' }}>{v.health}%</b></div></div>
        <div className="row" style={{ marginTop: 10 }}><button className="btn btn-dark md" onClick={() => open('veh', { soc: Math.round(v.soc), tempC: v.tempC, health: v.health, plate: v.plate })}><Settings2 size={16} />MANAGE TELEMETRY</button><button className="btn btn-soft md" style={{ width: 130 }} onClick={() => nav('/vehicle-setup')}><Plus size={16} />ADD EV</button></div>
        {user.vehicles.length > 1 && <div className="chips" style={{ marginTop: 8 }}>{user.vehicles.map((x) => <button key={x.id} className={`chip ${x.id === v.id ? 'sel' : ''}`} onClick={() => call(() => api.put(`/api/me/vehicles/${x.id}/active`))}>{x.model}</button>)}</div>}</div>

      <div className="card"><div className="between"><div><h3>Smart Rules & Delight</h3><div className="sm muted">Automations tuned for seamless road trips</div></div></div>
        {[[Zap, 'Auto-Reserve Preferred Bay', 'Holds a stall 12 mins before arrival', 'autoReserve'], [Ambulance, 'Emergency Auto-Safe', `Reroutes to nearest DC charger below ${st.emergencyThreshold}% SoC`, 'emergencyAutoSafe'], [Music, 'Spark Chime & Sparks', 'Playful chime whenever charging starts', 'chime']].map(([I, t, d, k]) =>
          <div key={k} className="between" style={{ marginTop: 14 }}><div className="row"><span className="icon-btn" style={{ background: 'var(--soft)', borderRadius: 12 }}><I size={18} /></span><div><b>{t}</b><div className="sm muted">{d}</div></div></div><Toggle on={st[k]} onChange={(on) => setS({ [k]: on })} /></div>)}
        <div className="label" style={{ marginTop: 16 }}>Preferred charging networks ({st.networks.length} active)</div>
        <div className="chips" style={{ flexWrap: 'wrap' }}>{nets.data?.map((n) => <button key={n} className={`chip ${st.networks.includes(n) ? 'sel' : ''}`} onClick={() => toggleNet(n)}>{n}</button>)}</div></div>

      <div className="card"><div className="between"><h3>Payment & Billing</h3><Badge kind={user.payment.autopay ? 'ok' : 'off'}>{user.payment.autopay ? 'AUTO-DEBIT ACTIVE' : 'AUTOPAY OFF'}</Badge></div>
        <button className="panel between" style={{ width: '100%', marginTop: 10, textAlign: 'left' }} onClick={() => open('pay', { ...user.payment })}><div className="row"><Landmark /><div><b>GEN_Z Spark AutoPay</b><div className="sm muted">{user.payment.bank || 'Prepaid wallet'} {user.payment.upi && `• ${user.payment.upi}`} • Limit {inr(user.payment.limit)}</div></div></div><ChevronRight /></button>
        <div className="panel between" style={{ marginTop: 8 }}><div className="row"><Wallet /><div><b>Wallet balance</b><div className="tele" style={{ fontSize: 20 }}>{inr(user.wallet)}</div></div></div><button className="btn btn-primary sm" onClick={() => open('topup', { amount: 500 })}>TOP UP</button></div>
        <div className="panel between" style={{ marginTop: 8 }}><div className="row"><FileText /><div><b>GST & corporate invoices</b><div className="sm muted">Auto-email monthly reimbursement summary</div></div></div><Toggle on={st.gstEmail} onChange={(on) => setS({ gstEmail: on })} /></div></div>

      <div className="card"><h3>Driver Reliability & Permissions</h3>
        <div className="grid2" style={{ marginTop: 10 }}><div className="panel"><div className="between"><span className="label">Reliability</span><Shield size={14} /></div><b className="tele" style={{ fontSize: 30 }}>{user.reliability}</b>/100<div className="sm" style={{ color: user.reliability >= 90 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>{user.reliability >= 90 ? 'Safe Driver Pass' : user.noShows + ' no-shows recorded'}</div></div>
          <div className="panel"><div className="between"><span className="label">Background GPS</span><Navigation size={14} color="#2E9E5B" /></div><b style={{ fontSize: 18 }}>{LOC.find((l) => l[0] === st.location)[1]}</b><div className="sm muted">{st.location === 'DENY' ? 'Using last saved place' : 'Nearby & ETA enabled'}</div></div></div>
        <div className="label" style={{ marginTop: 12 }}>Location permission</div>
        <div className="chips" style={{ flexWrap: 'wrap' }}>{LOC.map(([k, t]) => <button key={k} className={`chip ${st.location === k ? 'sel' : ''}`} style={{ textTransform: 'none', fontFamily: 'var(--f)' }} onClick={() => setS({ location: k })}>{t}</button>)}</div>
        {user.blockedUntil && new Date(user.blockedUntil) > new Date() && <div className="err-box">Reservations paused until {new Date(user.blockedUntil).toLocaleString('en-IN')} after repeated no-shows.</div>}
        {hl && <div className="card red row" style={{ margin: '12px 0 0' }}><span className="icon-btn" style={{ background: 'rgba(255,255,255,.2)', fontWeight: 800, fontSize: 11 }}>SOS</span><div className="grow"><div className="label" style={{ color: '#fff' }}>24/7 EV roadside helpline</div><div className="sm">{hl.detail}</div></div>
          {roadside ? <a className="icon-btn" href={`tel:${roadside.phone.replace(/\s/g, '')}`}><Phone color="#fff" /></a> : <button className="icon-btn" onClick={() => nav('/emergency')}><Phone color="#fff" /></button>}</div>}</div>

      <button className="btn btn-soft" style={{ marginTop: 14, color: 'var(--red)' }} onClick={logout}><LogOut size={16} />LOG OUT OF SPARK NETWORK</button>
      <p className="center label" style={{ marginTop: 12 }}>GEN_Z EV OS · v1.0</p>

      {modal === 'name' && <Modal title="Edit profile" onClose={() => setModal(null)}><div className="col" style={{ marginTop: 12 }}><input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><button className="btn btn-primary" onClick={() => call(() => api.put('/api/me', form), 'Profile saved')}>SAVE</button></div></Modal>}
      {modal === 'veh' && <Modal title="Vehicle telemetry" onClose={() => setModal(null)}><div className="col" style={{ marginTop: 12 }}>
        <p className="sm muted">Normally pushed automatically from OBD-II / OCPP. Adjust manually here.</p>
        <span className="label">Battery % — {form.soc}</span><input type="range" className="slider" min="1" max="100" value={form.soc} onChange={(e) => setForm({ ...form, soc: +e.target.value })} />
        <span className="label">Battery temperature °C</span><input className="input" type="number" value={form.tempC} onChange={(e) => setForm({ ...form, tempC: +e.target.value })} />
        <span className="label">Battery health %</span><input className="input" type="number" value={form.health} onChange={(e) => setForm({ ...form, health: +e.target.value })} />
        <span className="label">Number plate</span><input className="input" value={form.plate || ''} onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })} />
        <button className="btn btn-primary" onClick={() => call(() => api.put(`/api/me/vehicles/${v.id}`, form), 'Vehicle updated')}>SAVE</button></div></Modal>}
      {modal === 'pay' && <Modal title="Spark AutoPay" onClose={() => setModal(null)}><div className="col" style={{ marginTop: 12 }}>
        <div className="between"><b>Auto-debit after charging</b><Toggle on={form.autopay} onChange={(on) => setForm({ ...form, autopay: on })} /></div>
        <input className="input" placeholder="Bank (e.g. ICICI Bank)" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} /><input className="input" placeholder="UPI ID" value={form.upi} onChange={(e) => setForm({ ...form, upi: e.target.value })} />
        <span className="label">Per-session limit ₹</span><input className="input" type="number" value={form.limit} onChange={(e) => setForm({ ...form, limit: +e.target.value })} />
        <button className="btn btn-primary" onClick={() => call(() => api.put('/api/me/payment', form), 'Payment settings saved')}>SAVE</button></div></Modal>}
      {modal === 'topup' && <Modal title="Top up wallet" onClose={() => setModal(null)}><div className="col" style={{ marginTop: 12 }}>
        <div className="chips">{[200, 500, 1000, 2000].map((a) => <button key={a} className={`chip ${form.amount === a ? 'sel' : ''}`} onClick={() => setForm({ amount: a })}>{inr(a)}</button>)}</div>
        <input className="input" type="number" value={form.amount} onChange={(e) => setForm({ amount: +e.target.value })} />
        <p className="sm muted">Payment gateway is simulated for the hackathon: the amount is credited instantly.</p>
        <button className="btn btn-primary" onClick={() => call(() => api.post('/api/wallet/topup', { amount: form.amount }), `${inr(form.amount)} added`)}>ADD {inr(form.amount)}</button></div></Modal>}
    </Page>);
}
