import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Mic, Zap, Snowflake, SlidersHorizontal, Briefcase, Plane, MapPin, ChevronRight, Leaf, PiggyBank, Star, Clock } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { useFetch, useGeo } from '../hooks';
import { useLive, useLiveEvent, useToast } from '../live';
import { Data, Page, Ring, dur, inr, Badge } from '../ui';
import { StationCard } from '../components';

export default function Home() {
  const { user, setUser } = useAuth(); const nav = useNavigate(); const toast = useToast(); const { connected } = useLive();
  const geo = useGeo(); const v = user.vehicle; const [text, setText] = useState('');
  const st = useFetch(() => api.get('/api/stations/nearby?' + qs({ lat: geo?.lat, lng: geo?.lng, limit: 3 })), [geo?.lat, geo?.lng]);
  const sum = useFetch(() => api.get('/api/activity/summary'), []);
  const quick = useFetch(() => api.get('/api/public/places?' + qs({ quick: true, lat: geo?.lat, lng: geo?.lng })), [geo?.lat, geo?.lng]);
  const ses = useFetch(() => api.get('/api/sessions/active'), []);
  const que = useFetch(() => api.get('/api/queue/active'), []);
  useLiveEvent('STATION_UPDATE', () => st.reload());
  useLiveEvent('SESSION_UPDATE', (d) => ses.setData({ session: d }));
  useLiveEvent('QUEUE_UPDATE', () => que.reload());
  const h = new Date().getHours(), greet = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  const first = (user.name || 'Driver').split(' ')[0];
  const go = (p) => nav('/trip?to=' + encodeURIComponent(JSON.stringify(p)));
  const cmd = async (type) => { try { setUser(await api.post(`/api/me/vehicles/${v.id}/command`, { type })); } catch (e) { toast(e.message, 'err'); } };
  const limits = [80, 90, 100], nextLimit = limits[(limits.indexOf(user.settings.limitPct) + 1) % 3] || 80;
  const setLimit = async () => { try { setUser(await api.put('/api/me/settings', { ...user.settings, limitPct: nextLimit })); toast(`Charge limit set to ${nextLimit}%`); } catch (e) { toast(e.message, 'err'); } };
  const tempLabel = v.tempC < 15 ? 'Cold' : v.tempC > 35 ? 'High' : 'Optimal';
  const places = [...user.saved.map((p) => ({ ...p, icon: Briefcase })), ...(quick.data || []).map((p) => ({ name: p.name, label: `${p.name} · ${p.distanceKm ?? '–'} km`, lat: p.lat, lng: p.lng, icon: p.name.includes('Airport') ? Plane : MapPin }))];
  return (
    <Page title="Dashboard">
      <div className="row between"><Badge kind="gold">{connected ? 'CONNECTED LIVE' : 'RECONNECTING…'}</Badge></div>
      <h1 className="h-xl" style={{ fontSize: 30 }}>Good {greet}, {first} 👋</h1>
      <div className="muted">🚗 {v.model} • {ses.data?.session ? 'Charging now' : que.data?.active ? 'In queue' : 'Ready for commute'}</div>

      {ses.data?.session && <div className="card tint between" onClick={() => nav('/charging')} style={{ cursor: 'pointer' }}>
        <div><div className="label">Charging now · Bay #{ses.data.session.bay}</div><b>{ses.data.session.stationName}</b></div>
        <span className="tele" style={{ fontSize: 22 }}>{Math.round(ses.data.session.soc)}%</span></div>}
      {que.data?.active && <div className="card tint between" onClick={() => nav('/queue')} style={{ cursor: 'pointer' }}>
        <div><div className="label">Smart queue · {que.data.active.status === 'HOLD' ? 'Bay ready!' : `Position #${que.data.position}`}</div><b>{que.data.station.name}</b></div><ChevronRight /></div>}

      <div className="card yellow">
        <div className="row" style={{ gap: 16 }}>
          <Ring pct={v.soc} size={104} stroke={10} color="#1E1E1E"><div className="tele" style={{ fontSize: 26 }}>{Math.round(v.soc)}%</div><div className="label">SOC</div></Ring>
          <div className="grow"><div className="between"><span className="label">Remaining range</span><Badge kind="gold" dot={false}>{v.health}% Health</Badge></div>
            <div><span className="tele" style={{ fontSize: 36 }}>{Math.round(v.rangeKm)}</span> <b>KM</b></div>
            <div className="sm muted">⏱ ~{dur(v.rangeKm / 65 * 60)} drive · {tempLabel} temp {Math.round(v.tempC)}°C</div></div>
        </div>
        <div className="grid2" style={{ marginTop: 14 }}>
          <button className="btn btn-soft md" style={{ background: v.precool ? 'var(--ink)' : '#fff', color: v.precool ? '#fff' : 'inherit' }} onClick={() => cmd('PRECOOL')}><Snowflake size={16} />{v.precool ? 'COOLING…' : 'PRE-COOL CABIN'}</button>
          <button className="btn btn-soft md" style={{ background: '#fff' }} onClick={setLimit}><SlidersHorizontal size={16} />LIMIT: {user.settings.limitPct}%</button>
        </div>
      </div>

      <form className="card row" style={{ padding: 8, marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); text.trim() && nav('/trip?q=' + encodeURIComponent(text.trim())); }}>
        <span className="icon-btn" style={{ background: 'var(--yellow)' }}><Search size={20} /></span>
        <input className="grow" style={{ border: 0, outline: 0, height: 40, background: 'none' }} placeholder="Where are you going?" value={text} onChange={(e) => setText(e.target.value)} />
        <Mic size={20} />
      </form>
      <div className="chips" style={{ marginTop: 6 }}>{places.map((p, i) => <button key={i} className="chip" onClick={() => go({ name: p.name, lat: p.lat, lng: p.lng })}><p.icon size={14} />{p.label || p.name}</button>)}</div>

      <button className="btn btn-red" style={{ height: 64, marginTop: 14, borderRadius: 32, justifyContent: 'space-between' }} onClick={() => nav('/emergency')}>
        <span className="row" style={{ textAlign: 'left', textTransform: 'none', fontFamily: 'var(--f)' }}><span className="icon-btn" style={{ background: 'rgba(255,255,255,.2)' }}>!</span>
          <span><b style={{ textTransform: 'uppercase', fontFamily: 'var(--m)', fontSize: 13 }}>Low battery emergency SOS</b><br /><span className="sm" style={{ fontWeight: 500 }}>Auto-reserve slot & route to guaranteed charger</span></span></span><ChevronRight />
      </button>

      <div className="grid3" style={{ marginTop: 14 }}>
        <div className="panel"><Leaf size={16} /><div className="tele" style={{ fontSize: 20 }}>{sum.data?.co2Kg ?? '–'}</div><div className="label">kg CO₂ saved</div></div>
        <div className="panel"><PiggyBank size={16} /><div className="tele" style={{ fontSize: 20 }}>{sum.data ? inr(sum.data.fuelSavings) : '–'}</div><div className="label">vs petrol</div></div>
        <div className="panel"><Star size={16} /><div className="tele" style={{ fontSize: 20 }}>{user.points.toLocaleString('en-IN')}</div><div className="label">Spark pts · Lv {user.level}</div></div>
      </div>

      <div className="between"><h2 style={{ marginBottom: 0 }}>Nearby Superchargers</h2><button className="label" onClick={() => nav('/map')}>VIEW MAP →</button></div>
      <div className="sm muted">Compatible chargers around you, ranked for {v.model}</div>
      <Data q={st}>{(d) => d.rankError && !d.stations.length ? null : d.stations.length ? d.stations.map((s) => <StationCard key={s.id} st={s} />) : <div className="empty">No compatible chargers within 40 km.</div>}</Data>
    </Page>);
}
