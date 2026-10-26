import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Navigation, MapPin, Gauge, Snowflake, Repeat, CheckCircle2, Phone, Truck, BatteryWarning, Siren } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useGeo, useNow } from '../hooks';
import { useToast } from '../live';
import { Badge, ErrorBox, Page, Spinner, mapsDir, mmss } from '../ui';

export default function Emergency() {
  const nav = useNavigate(), toast = useToast(), geo = useGeo(), now = useNow(1000), { user, setUser } = useAuth();
  const [d, setD] = useState(null), [err, setErr] = useState('');
  const load = () => api.post('/api/emergency/start', geo ? { lat: geo.lat, lng: geo.lng } : {}).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { if (geo) load(); }, [geo?.lat, geo?.lng]);
  const tip = async (t) => { if (!t.command) return; try { setUser(await api.post(`/api/me/vehicles/${d.vehicleId}/command`, { type: t.command })); load(); } catch (e) { toast(e.message, 'err'); } };
  const best = d?.best, s = best?.station, bk = d?.booking;
  const left = bk ? Math.max(0, (new Date(bk.expiresAt) - now) / 1000) : 0;
  const phone = d?.helplines?.find((h) => /^[+\d][\d\s-]{2,}$/.test(h.phone) && h.phone !== '112') || d?.helplines?.find((h) => h.phone === '112');
  const hl = d?.helplines?.[0];
  return (
    <Page title="Emergency Mode" back nav={false}>
      <ErrorBox error={err} retry={load} />
      {!d && !err && <Spinner />}
      {d && <>
        <div className="card red"><div className="between"><span className="badge nodot" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}>● EMERGENCY SAFE MODE</span><span className="badge nodot" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}>{Math.round(d.soc)}% SoC</span></div>
          <h1 className="h-xl" style={{ color: '#fff', margin: '8px 0', fontSize: 24 }}>{d.critical ? 'CRITICAL BATTERY' : 'LOW BATTERY'}: {Math.round(d.soc)}% ({Math.round(d.rangeKm)} KM)</h1>
          <div style={{ opacity: .9 }}>Power-saver advice active. Pick the options below to stretch your remaining range.</div></div>

        {!s ? <div className="card"><h3>No compatible charger found</h3><div className="muted">Use the roadside helpline below.</div></div> : <div className="card">
          <div className="between"><Badge kind="gold" dot={false}>⚡ LIFELINE PRIORITY STATION</Badge></div>
          <h2 style={{ margin: '10px 0 2px', fontSize: 22 }}>{s.name}</h2>
          <div className="sm muted"><Navigation size={12} /> {best.distanceKm} km away • <b>{best.driveMin} mins driving</b></div>
          {bk ? <div className="panel row" style={{ marginTop: 10 }}><span className="icon-btn" style={{ background: 'var(--yellow)', fontFamily: 'var(--m)', fontWeight: 800 }}>#{String(bk.bay).padStart(2, '0')}</span><div className="grow"><b className="tele">BAY #{String(bk.bay).padStart(2, '0')} AUTO-HELD</b><div className="sm">Zero fee • Reserved for next <b style={{ color: 'var(--red)' }}>{mmss(left)}</b></div></div><CheckCircle2 /></div>
            : <div className="panel" style={{ marginTop: 10 }}>{s.freeBays > 0 ? 'Bay hold unavailable. Head there directly.' : 'No free bay right now. Join the queue on arrival.'}</div>}
          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="panel"><div className="label">Arrival battery</div><b className="tele" style={{ fontSize: 24, color: best.reachable ? 'var(--ink)' : 'var(--red)' }}>{Math.round(best.arrivalSoc)}%</b></div>
            <div className="panel"><div className="label">Safe buffer</div><b className="tele" style={{ fontSize: 24 }}>+{best.bufferKm} km</b></div></div>
          {!best.reachable && <div className="err-box">This charger may be beyond your remaining range. Call roadside assistance.</div>}
          <div className="sm muted" style={{ marginTop: 8 }}>{Math.round(s.maxKw)} kW {s.connector} · {s.freeBays}/{s.totalBays} bays free · compatibility ✓ · availability {s.freeBays > 0 ? '✓' : '✗'}</div>
        </div>}

        <div className="card soft"><h3>🔋 Battery Preservation Guide</h3>
          {d.tips.map((t) => <button key={t.id} className="panel white row between" style={{ width: '100%', textAlign: 'left', marginTop: 8 }} onClick={() => tip(t)}>
            <span className="row"><span className="icon-btn" style={{ background: 'var(--soft)', borderRadius: 12 }}>{t.id === 'SPEED' ? <Gauge size={18} /> : t.id === 'HVAC' ? <Snowflake size={18} /> : <Repeat size={18} />}</span><span><b>{t.title}</b><div className="sm muted">{t.detail}</div></span></span>
            {t.command ? (t.active ? <CheckCircle2 color="#2E9E5B" /> : <span className="badge gold nodot">TAP</span>) : <span className="badge gold nodot">+{t.gainKm} KM</span>}</button>)}</div>

        {hl && <div className="card"><div className="row"><span className="icon-btn" style={{ background: '#FFDAD6', color: 'var(--red)', fontWeight: 800, fontSize: 11 }}>SOS</span><div className="grow"><h3>{hl.name}</h3><div className="sm muted">{hl.detail}</div></div><span className="badge off nodot">24/7 Priority</span></div>
          <div className="chips" style={{ marginTop: 8 }}>{hl.services.map((x) => <span key={x} className="chip" style={{ textTransform: 'none', fontFamily: 'var(--f)' }}><Truck size={14} />{x} ({hl.etaMin}m ETA)</span>)}</div></div>}

        <div className="col" style={{ marginTop: 16 }}>
          {s && <a className="btn btn-primary" href={mapsDir(s.lat, s.lng)} target="_blank" rel="noreferrer"><Navigation size={18} />START EMERGENCY NAVIGATION</a>}
          {phone ? <a className="btn btn-dark" href={`tel:${phone.phone.replace(/\s/g, '')}`}><Phone size={18} />Call {phone.phone === '112' ? 'Emergency 112' : 'Roadside EV Assistance'}</a>
            : <div className="btn btn-dark" style={{ opacity: .5 }}>Roadside number not configured</div>}
        </div>
      </>}
    </Page>);
}
