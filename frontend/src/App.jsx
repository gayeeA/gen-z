import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Spinner } from './ui';
import Splash from './pages/Splash';
import Login from './pages/Login';
import VehicleSetup from './pages/VehicleSetup';
import Home from './pages/Home';
import MapPage from './pages/MapPage';
import StationDetails from './pages/StationDetails';
import TripPlanner from './pages/TripPlanner';
import TripResult from './pages/TripResult';
import Compare from './pages/Compare';
import Queue from './pages/Queue';
import Charging from './pages/Charging';
import Review from './pages/Review';
import Activity from './pages/Activity';
import Profile from './pages/Profile';
import Emergency from './pages/Emergency';
import Failsafe from './pages/Failsafe';

function Guard({ children, vehicle = true }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (vehicle && !user.vehicle) return <Navigate to="/vehicle-setup" replace />;
  return children;
}

export default function App() {
  const g = (el, vehicle = true) => <Guard vehicle={vehicle}>{el}</Guard>;
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route path="/vehicle-setup" element={g(<VehicleSetup />, false)} />
        <Route path="/home" element={g(<Home />)} />
        <Route path="/map" element={g(<MapPage />)} />
        <Route path="/station/:id" element={g(<StationDetails />)} />
        <Route path="/trip" element={g(<TripPlanner />)} />
        <Route path="/trip/:id" element={g(<TripResult />)} />
        <Route path="/trip/:id/compare" element={g(<Compare />)} />
        <Route path="/queue" element={g(<Queue />)} />
        <Route path="/charging" element={g(<Charging />)} />
        <Route path="/review" element={g(<Review />)} />
        <Route path="/activity" element={g(<Activity />)} />
        <Route path="/profile" element={g(<Profile />)} />
        <Route path="/emergency" element={g(<Emergency />)} />
        <Route path="/failsafe" element={g(<Failsafe />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
