import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';

export function useFetch(fn, deps = [], opts = {}) {
  const [s, set] = useState({ data: null, error: null, loading: true });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = useCallback(async (silent) => {
    if (!silent) set((x) => ({ ...x, loading: true }));
    try { const data = await fn(); alive.current && set({ data, error: null, loading: false }); }
    catch (e) { alive.current && set((x) => ({ ...x, error: e.message, loading: false })); }
  }, deps);
  useEffect(() => {
    run();
    if (opts.interval) { const t = setInterval(() => run(true), opts.interval); return () => clearInterval(t); }
  }, [run]);
  return { ...s, reload: () => run(true), setData: (d) => set((x) => ({ ...x, data: d })) };
}

/** Browser location, honouring the permission the user chose in Profile (WHILE_USING / NAVIGATION_ONLY / DENY). */
export function useGeo() {
  const { user } = useAuth();
  const [pos, setPos] = useState(user ? { lat: user.lat, lng: user.lng, live: false } : null);
  const perm = user?.settings?.location;
  useEffect(() => {
    if (!user || perm === 'DENY' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude, live: true };
        setPos(c); api.put('/api/me/location', { lat: c.lat, lng: c.lng }).catch(() => {});
      }, () => {}, { timeout: 8000, maximumAge: 120000 });
  }, [user?.id, perm]);
  return pos;
}

export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

export function useDebounced(v, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
