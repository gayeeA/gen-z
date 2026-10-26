import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Zap, Home, Map as MapIcon, Route, Activity as Act, User as UserIcon, X, Star, Coffee, Utensils, Bath, ShoppingBag, BedDouble, Banknote, Wifi, ParkingSquare, ShieldCheck } from 'lucide-react';
import { useAuth } from './auth';
import { useFetch } from './hooks';
import { api } from './api';

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const inr2 = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dur = (m) => { m = Math.round(m || 0); return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`; };
export const ago = (iso) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
export const mmss = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, Math.round(s)) % 60).padStart(2, '0')}`;
export const statusKind = { AVAILABLE: 'ok', LIMITED: 'warn', OCCUPIED: 'bad', OFFLINE: 'off' };
export const statusColor = { AVAILABLE: '#2E9E5B', LIMITED: '#F28C28', OCCUPIED: '#E53935', OFFLINE: '#9AA0A6' };
export const mapsDir = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

export const AMEN_ICON = { cafe: Coffee, restaurant: Utensils, restroom: Bath, shopping: ShoppingBag, hotel: BedDouble, atm: Banknote, wifi: Wifi, parking: ParkingSquare, security: ShieldCheck };
export const AMEN_LABEL = { cafe: 'Café', restaurant: 'Restaurant', restroom: 'Restroom', shopping: 'Shopping', hotel: 'Hotel', atm: 'ATM', wifi: 'Wi-Fi', parking: 'Parking', security: 'Security' };
export function AmenIcons({ types = [], size = 16 }) {
  return <div className="row" style={{ gap: 12 }}>{types.slice(0, 6).map((t) => { const I = AMEN_ICON[t] || Zap; return <I key={t} size={size} title={t} />; })}</div>;
}

export function Badge({ kind = 'ok', children, dot = true }) { return <span className={`badge ${kind} ${dot ? '' : 'nodot'}`}>{children}</span>; }
export function StatusBadge({ status, text }) {
  const label = { AVAILABLE: 'Available', LIMITED: 'Limited', OCCUPIED: 'Occupied', OFFLINE: 'Offline' }[status] || status;
  return <Badge kind={statusKind[status] || 'off'}>{text || label}</Badge>;
}
export const Toggle = ({ on, onChange, disabled }) => <button className={`toggle ${on ? 'on' : ''}`} onClick={() => !disabled && onChange(!on)} aria-pressed={!!on} />;
export const Spinner = () => <div className="spin" />;
export const Skeleton = ({ h = 120 }) => <div className="skeleton" style={{ height: h }} />;
export const ErrorBox = ({ error, retry }) => error ? <div className="err-box">{error}{retry && <button className="chip" style={{ marginLeft: 10 }} onClick={retry}>Retry</button>}</div> : null;
export const Empty = ({ icon: I = Zap, title, children }) => <div className="empty"><I size={36} /><h3 style={{ margin: '10px 0 4px', color: 'var(--ink)' }}>{title}</h3>{children}</div>;

export function Ring({ pct = 0, size = 120, stroke = 12, color = 'var(--yellow)', children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eee7d6" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)} style={{ transition: 'stroke-dashoffset .8s' }} />
      </svg>
      <div className="in">{children}</div>
    </div>
  );
}

export function Stars({ value = 0, onChange, size = 34 }) {
  return <div className="row" style={{ justifyContent: 'center', gap: 8 }}>{[1, 2, 3, 4, 5].map((i) => (
    <button key={i} onClick={() => onChange && onChange(i)}><Star size={size} fill={i <= value ? '#FFCB05' : 'none'} color={i <= value ? '#B58A00' : '#1E1E1E'} /></button>))}</div>;
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="between"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X /></button></div>
        {children}
      </div>
    </div>
  );
}

function Notifications({ onClose }) {
  const { refresh } = useAuth();
  const n = useFetch(() => api.get('/api/notifications'), []);
  const mark = async () => { await api.post('/api/notifications/read'); n.reload(); refresh(); };
  return (
    <Modal title="Notifications" onClose={onClose}>
      {n.loading ? <Spinner /> : !n.data?.length ? <Empty icon={Bell} title="All caught up" /> : (
        <div className="col" style={{ marginTop: 12 }}>
          {n.data.map((x) => <div key={x.id} className="panel white" style={{ opacity: x.read ? .6 : 1 }}><b>{x.title}</b><div className="sm muted">{x.body}</div><div className="label">{ago(x.createdAt)}</div></div>)}
          <button className="btn btn-soft md" onClick={mark}>Mark all as read</button>
        </div>)}
    </Modal>
  );
}

export function Avatar({ user, size = 38 }) {
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className="avatar" style={{ width: size, height: size }}>{user?.avatar ? <img src={user.avatar} alt="" /> : initials}</div>;
}

export function Header({ title, back }) {
  const { user } = useAuth(); const nav = useNavigate(); const [open, setOpen] = useState(false);
  return (
    <>
      <div className="hdr">
        {back ? <button className="icon-btn" onClick={() => (back === true ? nav(-1) : nav(back))}><ArrowLeft /></button> : <span className="logo"><Zap size={9} fill="#1E1E1E" />GEN_Z</span>}
        <h1>{title}</h1>
        <button className="icon-btn" onClick={() => setOpen(true)}><Bell />{user?.unread > 0 && <i className="dot" />}</button>
        <button onClick={() => nav('/profile')}><Avatar user={user} /></button>
      </div>
      {open && <Notifications onClose={() => setOpen(false)} />}
    </>
  );
}

const TABS = [['/home', 'HOME', Home], ['/map', 'MAP', MapIcon], ['/trip', 'TRIP', Route], ['/activity', 'ACTIVITY', Act], ['/profile', 'PROFILE', UserIcon]];
export function BottomNav() {
  return <nav className="nav">{TABS.map(([to, label, I]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'on' : '')}><I size={22} />{label}</NavLink>)}</nav>;
}

export function Page({ title, back, nav = true, children }) {
  return <><Header title={title} back={back} /><div className={`page ${nav ? '' : 'nonav'}`}>{children}</div>{nav && <BottomNav />}</>;
}

export function Data({ q, skeleton = 2, children }) {
  if (q.loading && !q.data) return <>{Array.from({ length: skeleton }).map((_, i) => <Skeleton key={i} />)}</>;
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  return children(q.data);
}
