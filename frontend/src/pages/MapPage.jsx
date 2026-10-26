import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, Polyline, useMap } from 'react-leaflet';
import { Search, SlidersHorizontal, Crosshair, List, Zap, Bookmark, Navigation, Star, Lock } from 'lucide-react';
import { api, qs } from '../api';
import { useDebounced, useFetch, useGeo } from '../hooks';
import { useLiveEvent } from '../live';
import { AmenIcons, AMEN_ICON, AMEN_LABEL, Header, BottomNav, StatusBadge, inr, statusColor } from '../ui';
import { ActionButton, StationCard, useStationActions } from '../components';

const FILTERS = ['cafe', 'restroom', 'wifi', 'parking', 'security', 'restaurant'];

function Fly({ to }) { const map = useMap(); useEffect(() => { if (to) map.flyTo(to, Math.max(map.getZoom(), 12), { duration: 0.6 }); }, [to?.[0], to?.[1]]); return null; }

export default function MapPage() {
  const nav = useNavigate(); const geo = useGeo(); const acts = useStationActions();
  const [q, setQ] = useState(''); const dq = useDebounced(q, 350);
  const [ultra, setUltra] = useState(false); const [am, setAm] = useState([]); const [list, setList] = useState(false);
  const [center, setCenter] = useState(null); const [sel, setSel] = useState(null);
  const origin = center || geo;
  const data = useFetch(() => api.get('/api/stations/nearby?' + qs({ lat: origin?.lat, lng: origin?.lng, q: dq, minKw: ultra ? 100 : 0, amenities: am.join(','), limit: 40, radiusKm: 60 })), [origin?.lat, origin?.lng, dq, ultra, am.join(',')]);
  const places = useFetch(() => (dq.length > 1 ? api.get('/api/public/places?q=' + encodeURIComponent(dq)) : Promise.resolve([])), [dq]);
  useLiveEvent('STATION_UPDATE', () => data.reload());
  useLiveEvent('STATION_FAULT', () => data.reload());
  const stations = data.data?.stations || [];
  const cur = useMemo(() => stations.find((s) => s.id === sel) || stations.find((s) => s.aiPick) || stations[0], [stations, sel]);
  const icon = (s) => L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="pin ${s.aiPick ? 'ai' : ''} ${cur?.id === s.id ? 'sel' : ''}" style="--c:${statusColor[s.status]}">${s.aiPick ? '⚡ AI PICK • ' : ''}${Math.round(s.maxKw)}kW • ${s.status === 'OFFLINE' ? 'Offline' : s.freeBays + ' Free'}</div>` });
  const meIcon = L.divIcon({ className: '', iconSize: [0, 0], html: '<div class="me-dot"></div>' });
  const mapCenter = origin ? [origin.lat, origin.lng] : [12.9716, 77.5946];
  return (
    <>
      <Header title="Station Map" />
      <div className="page">
        <div className="card row" style={{ padding: 6, marginTop: 4 }}>
          <Search size={20} style={{ marginLeft: 10 }} />
          <input className="grow" style={{ border: 0, outline: 0, height: 42, background: 'none' }} placeholder="Search stations, highways, malls…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="icon-btn" style={{ background: 'var(--soft)', borderRadius: 12 }} onClick={() => setList(!list)}><SlidersHorizontal size={18} /></button>
        </div>
        {places.data?.length > 0 && q && <div className="chips">{places.data.map((p) => <button key={p.id} className="chip" onClick={() => { setCenter({ lat: p.lat, lng: p.lng }); setSel(null); }}>📍 {p.name}</button>)}</div>}
        <div className="chips">
          <button className={`chip ${ultra ? 'yellow' : ''}`} onClick={() => setUltra(!ultra)}><Zap size={14} />&gt;100kW Ultra fast</button>
          {FILTERS.map((f) => { const I = AMEN_ICON[f]; return <button key={f} className={`chip ${am.includes(f) ? 'sel' : ''}`} onClick={() => setAm(am.includes(f) ? am.filter((x) => x !== f) : [...am, f])}><I size={14} />{AMEN_LABEL[f]}</button>; })}
        </div>

        {list ? <div>{stations.map((s) => <StationCard key={s.id} st={s} />)}{!stations.length && <div className="empty">No stations match these filters.</div>}</div> : (
          <div style={{ position: 'relative', marginTop: 6 }}>
            <MapContainer center={mapCenter} zoom={11} style={{ height: 380 }} zoomControl={false}>
              <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Fly to={center ? [center.lat, center.lng] : cur ? [cur.lat, cur.lng] : null} />
              {geo && <Marker position={[geo.lat, geo.lng]} icon={meIcon} interactive={false} />}
              {stations.map((s) => <Marker key={s.id} position={[s.lat, s.lng]} icon={icon(s)} eventHandlers={{ click: () => setSel(s.id) }} />)}
            </MapContainer>
            <div className="col" style={{ position: 'absolute', right: 10, top: 10, zIndex: 500 }}>
              <button className="fab" onClick={() => { setCenter(null); setSel(null); }}><Crosshair size={20} /></button>
              <button className="fab" onClick={() => setList(true)}><List size={20} /></button>
            </div>
          </div>)}
        {data.error && <div className="err-box">{data.error}</div>}
        {data.data?.rankError && <div className="sm muted" style={{ marginTop: 8 }}>AI ranking unavailable ({data.data.rankError}). Showing nearest first.</div>}

        {!list && cur && (
          <div className="sheet">
            <div className="between"><span className="badge gold nodot">{cur.network.toUpperCase()} NETWORK</span><span className="muted">• {cur.hours} Access</span><button className="icon-btn" style={{ background: 'var(--soft)' }} onClick={() => nav(`/station/${cur.id}`)}><Bookmark size={18} /></button></div>
            <h3 style={{ fontSize: 20, margin: '8px 0', cursor: 'pointer' }} onClick={() => nav(`/station/${cur.id}`)}>{cur.name}</h3>
            <div className="sm muted"><Star size={12} fill="#FFCB05" /> <b>{cur.rating}</b> ({cur.reviewCount} reviews) · {cur.distanceKm} km away · {cur.driveMin} min drive</div>
            <div className="panel between" style={{ marginTop: 10 }}>
              <div className="row"><StatusBadge status={cur.status} text={`${cur.freeBays} of ${cur.totalBays} bays free`} /></div>
              <div style={{ textAlign: 'right' }}><span className="tele" style={{ fontSize: 22 }}>{inr(cur.tariff)}</span><span className="sm">/kWh</span><div className="sm muted">{cur.estCostTo80 != null && `Est. ${inr(cur.estCostTo80)} to 80%`}</div></div>
            </div>
            <div className="sm muted" style={{ margin: '8px 0' }}>{Math.round(cur.maxKw)} kW · {cur.connector} · {cur.amenities.slice(0, 2).map((a) => a.name).join(' · ')}</div>
            <div className="grid2">
              <a className="btn btn-dark md" href={`https://www.google.com/maps/dir/?api=1&destination=${cur.lat},${cur.lng}`} target="_blank" rel="noreferrer"><Navigation size={16} />NAVIGATE</a>
              <ActionButton st={cur} />
            </div>
          </div>)}
      </div>
      <BottomNav />
    </>);
}
