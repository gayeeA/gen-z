import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import { Zap, Star, ShieldCheck, Sun, Camera, Siren, Share2, MessageSquare, Navigation, BadgeCheck, Clock, Banknote } from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { useFetch, useGeo } from '../hooks';
import { useLiveEvent } from '../live';
import { AMEN_ICON, AMEN_LABEL, Badge, Data, Page, StatusBadge, ago, inr, mapsDir } from '../ui';
import { ActionButton, useStationActions } from '../components';

export default function StationDetails() {
  const { id } = useParams(); const nav = useNavigate(); const geo = useGeo(); const acts = useStationActions(); const { user } = useAuth();
  const q = useFetch(() => api.get(`/api/stations/${id}?` + qs({ lat: geo?.lat, lng: geo?.lng })), [id, geo?.lat]);
  useLiveEvent('STATION_UPDATE', (d) => d.stationId === id && q.reload());
  useLiveEvent('STATION_FAULT', (d) => d.stationId === id && q.reload());
  const share = async (s) => { const url = location.href; try { navigator.share ? await navigator.share({ title: s.name, url }) : await navigator.clipboard.writeText(url); } catch {} };
  return (
    <Page title="Station Details" back nav={false}>
      <Data q={q}>{(s) => {
        const free = s.freeBays > 0;
        const conf = { VERIFIED: 'Verified', COMMUNITY: 'Community updated', STALE: 'Stale data' }[s.confidenceLabel];
        return <>
          <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
            <div style={{ height: 150, background: s.imageUrl ? `url(${s.imageUrl}) center/cover` : 'linear-gradient(135deg,#1E1E1E,#4a3b00)', display: 'grid', placeItems: 'center' }}>{!s.imageUrl && <Zap size={56} color="#FFCB05" fill="#FFCB05" />}</div>
            <div style={{ position: 'absolute', top: 12, left: 12 }}><Badge kind={s.status === 'OFFLINE' ? 'bad' : 'ok'}>{s.status === 'OFFLINE' ? 'OFFLINE' : `OPEN ${s.hours.toUpperCase()}`}</Badge></div>
            <button className="fab" style={{ position: 'absolute', top: 12, right: 12 }} onClick={() => share(s)}><Share2 size={18} /></button>
            <div style={{ position: 'absolute', bottom: 12, left: 12 }}><Badge kind={s.confidenceLabel === 'STALE' ? 'warn' : 'ok'}>{conf.toUpperCase()} · {s.minutesAgo < 1 ? 'JUST NOW' : s.minutesAgo + 'M AGO'} · {s.confidence}% CONFIDENCE</Badge></div>
          </div>
          <div className="row" style={{ marginTop: 12 }}><span className="badge gold nodot">{s.network.toUpperCase()}</span>{s.distanceKm != null && <span className="muted">{s.distanceKm} km away</span>}</div>
          <h1 className="h-xl" style={{ fontSize: 24 }}>{s.name}</h1>
          <div className="muted">{s.address}</div>
          <div className="chip" style={{ margin: '8px 0' }}><Star size={14} fill="#FFCB05" />{s.rating} <span className="muted" style={{ textTransform: 'none' }}>({s.reviewCount} verified EV drivers)</span></div>
          <div className="grid2">
            <div className="card" style={{ margin: 0 }}><div className="label">Max speed</div><span className="tele" style={{ fontSize: 30 }}>{Math.round(s.maxKw)}</span><b>kW</b><div className="sm muted">{s.connector} compatible</div></div>
            <div className="card" style={{ margin: 0 }}><div className="label">Available</div><span className="tele" style={{ fontSize: 30, color: free ? 'var(--green)' : 'var(--red)' }}>{s.freeBays} / {s.totalBays}</span><div className="sm muted">{free ? 'Stalls ready' : s.queue ? `${s.queue} in queue · ~${s.waitMin} min` : 'All busy'}</div></div>
            <div className="card" style={{ margin: 0 }}><div className="label">Tariff</div><span className="tele" style={{ fontSize: 28 }}>{inr(s.tariff)}</span><b>/kWh</b>{s.offPeakTariff > 0 && <div className="sm" style={{ color: 'var(--green)', fontWeight: 700 }}>{inr(s.offPeakTariff)} {s.offPeakFrom > 12 ? `post ${s.offPeakFrom - 12} PM` : `from ${s.offPeakFrom} AM`}</div>}</div>
            <div className="card" style={{ margin: 0 }}><div className="label">Est. charge</div><span className="tele" style={{ fontSize: 28 }}>~{s.estChargeMin ?? '–'}</span><b>min</b><div className="sm muted">{Math.round(Math.min(user.vehicle.soc, 79))}% → 80% SoC · {s.estCostTo80 != null && inr(s.estCostTo80)}</div></div>
          </div>
          <div className="card soft">
            <div className="between"><div className="row"><span className="icon-btn" style={{ background: 'var(--tint)' }}><ShieldCheck /></span><div><b style={{ fontSize: 16 }}>Safety Index</b><div className="sm muted">{s.safety.audit}</div></div></div><Badge kind="ok" dot={false}>{s.safety.score}/100</Badge></div>
            <div className="grid2" style={{ marginTop: 12 }}>
              {[[s.safety.lighting, Sun, 'Well-lit arena'], [s.safety.guard, ShieldCheck, '24×7 security guard'], [s.safety.cctv, Camera, 'CCTV monitored'], [s.safety.sos, Siren, 'Emergency SOS alert']].map(([on, I, t]) =>
                <div key={t} className="panel white row" style={{ opacity: on ? 1 : .4 }}><I size={16} /><span className="sm">{t}</span></div>)}
            </div>
          </div>
          <div className="between"><h2>Live Bay Status</h2><span className="label">UPDATES LIVE</span></div>
          {s.bays.map((b) => {
            const compat = b.connector === s.connector || b.connector === 'TYPE2';
            const mine = b.status === 'RESERVED' && b.mine;
            const kind = b.status === 'AVAILABLE' ? 'ok' : b.status === 'FAULT' ? 'off' : mine ? 'ai' : b.status === 'RESERVED' ? 'warn' : 'bad';
            const label = b.status === 'AVAILABLE' ? 'AVAILABLE' : b.status === 'FAULT' ? 'FAULT' : mine ? 'HELD FOR YOU' : b.status === 'RESERVED' ? 'RESERVED' : `${b.minutesLeft}m left`;
            return <div key={b.number} className="card row" style={{ padding: 14, marginTop: 8 }}>
              <div className="icon-btn" style={{ background: 'var(--soft)', borderRadius: 10, fontFamily: 'var(--m)', fontWeight: 700 }}>{String(b.number).padStart(2, '0')}</div>
              <div className="grow"><b className="tele" style={{ fontSize: 18 }}>{b.powerKw} kW</b> <span className="badge off nodot">{b.connector}</span><div className="sm muted">{b.label}</div></div>
              {(b.status === 'AVAILABLE' || mine) && compat ? <button className="btn btn-primary sm" onClick={() => acts.charge(s, b.number)}>START</button> : <Badge kind={kind}>{label}</Badge>}
            </div>; })}
          <h2>Station Perks & Amenities</h2>
          <div className="chips" style={{ flexWrap: 'wrap' }}>{s.amenities.map((a) => { const I = AMEN_ICON[a.type] || Zap; return <span key={a.type} className="chip" style={{ textTransform: 'none', fontFamily: 'var(--f)' }}><I size={14} />{a.name} ({a.meters}m)</span>; })}</div>
          {s.latestReview && <div className="card soft"><div className="between"><b><MessageSquare size={16} /> Community Intelligence</b><span className="label">{ago(s.latestReview.createdAt)}</span></div>
            <div className="panel white" style={{ marginTop: 8 }}>"{s.latestReview.comment}" <span className="muted">— {s.latestReview.userName}</span></div></div>}
          <div style={{ marginTop: 14 }}>
            <MapContainer center={[s.lat, s.lng]} zoom={14} style={{ height: 150 }} dragging={false} scrollWheelZoom={false} zoomControl={false} attributionControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[s.lat, s.lng]} icon={L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="me-dot"></div>' })} />
            </MapContainer>
          </div>
          <div style={{ height: 90 }} />
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 'min(480px,100%)', padding: 12, background: 'rgba(252,249,248,.95)', backdropFilter: 'blur(8px)', zIndex: 25 }} className="grid2">
            {s.status === 'OFFLINE' ? <div className="btn btn-soft" style={{ opacity: .6 }}>OFFLINE</div>
              : free ? <button className="btn btn-primary" onClick={() => acts.reserve(s)}><Zap size={18} />Reserve ({inr(s.reservationFee)})</button>
              : <button className="btn btn-primary" onClick={() => acts.queue(s)}><Clock size={18} />Join queue</button>}
            <a className="btn btn-dark" href={mapsDir(s.lat, s.lng)} target="_blank" rel="noreferrer"><Navigation size={18} />Directions</a>
          </div>
        </>; }}
      </Data>
    </Page>);
}
