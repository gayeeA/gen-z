import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return null; }
    try { const u = await api.get('/api/me'); setUser(u); return u; } catch { setUser(null); return null; } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const login = (token, u) => { setToken(token); setUser(u); };
  const logout = () => { setToken(null); setUser(null); window.location.href = '/login'; };
  return <Ctx.Provider value={{ user, setUser, loading, refresh, login, logout }}>{children}</Ctx.Provider>;
}
