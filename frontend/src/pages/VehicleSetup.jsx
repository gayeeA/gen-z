import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { Data, Page } from '../ui';
import { useToast } from '../live';

export default function VehicleSetup() {
  const nav = useNavigate(), toast = useToast(), { user, setUser } = useAuth();
  const models = useFetch(() => api.get('/api/vehicle-models'), []);
  const [sel, setSel] = useState(null); const [plate, setPlate] = useState(''); const [soc, setSoc] = useState(60); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { setUser(await api.post('/api/me/vehicles', { modelId: sel.id, plate, soc })); nav('/home'); } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };
  return (
    <Page title="Link your EV" back={user?.vehicle ? true : undefined} nav={false}>
      <h2>Which EV do you drive?</h2><p className="muted">We use your connector, battery size and charging speed to show only compatible chargers.</p>
      <Data q={models}>{(list) => list.map((m) => (
        <button key={m.id} className={`opt ${sel?.id === m.id ? 'on' : ''}`} style={{ marginTop: 10 }} onClick={() => setSel(m)}>
          <div className="between"><b>{m.model}</b><span className="badge gold nodot">{m.connector}</span></div>
          <div className="sm">{m.variant} · {m.batteryKwh} kWh · DC {m.maxDcKw} kW · {m.consumption} kWh/100km</div>
        </button>))}
      </Data>
      {sel && <div className="card">
        <span className="label">Registration number</span>
        <input className="input" style={{ margin: '6px 0 16px' }} placeholder="MH 02 EV 8824" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
        <div className="between"><span className="label">Current battery</span><b className="tele" style={{ fontSize: 22 }}>{soc}%</b></div>
        <input type="range" className="slider" min="1" max="100" value={soc} onChange={(e) => setSoc(+e.target.value)} />
        <button className="btn btn-primary" style={{ marginTop: 18 }} disabled={busy} onClick={save}><Zap size={18} />SAVE & CONTINUE</button>
      </div>}
    </Page>);
}
