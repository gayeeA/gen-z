import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { wsUrl, getToken } from './api';
import { useAuth } from './auth';

const LiveCtx = createContext({ connected: false, subscribe: () => () => {} });
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export const useLive = () => useContext(LiveCtx);

export function useLiveEvent(type, fn) {
  const { subscribe } = useLive();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe(type, (d) => ref.current(d)), [type, subscribe]);
}

export function LiveProvider({ children }) {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const subs = useRef({});
  const toast = useCallback((msg, kind = 'ok', title) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind, title }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const subscribe = useCallback((type, fn) => {
    (subs.current[type] ||= new Set()).add(fn);
    return () => subs.current[type].delete(fn);
  }, []);

  useEffect(() => {
    if (!user || !getToken()) return;
    let ws, timer, closed = false, ping;
    const open = () => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => { setConnected(true); ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000); };
      ws.onmessage = (e) => {
        try {
          const { type, data } = JSON.parse(e.data);
          (subs.current[type] || []).forEach((fn) => fn(data));
          if (type === 'NOTIFICATION') { toast(data.body, 'ok', data.title); refresh(); }
          if (type === 'FAILSAFE_ALERT') nav('/failsafe');
        } catch {}
      };
      ws.onclose = () => { setConnected(false); clearInterval(ping); if (!closed) timer = setTimeout(open, 3000); };
    };
    open();
    return () => { closed = true; clearTimeout(timer); clearInterval(ping); ws && ws.close(); };
  }, [user?.id]);

  return (
    <LiveCtx.Provider value={{ connected, subscribe }}>
      <ToastCtx.Provider value={toast}>
        {children}
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>{t.title && <b>{t.title}</b>}{t.title && <br />}{t.msg}</div>
          ))}
        </div>
      </ToastCtx.Provider>
    </LiveCtx.Provider>
  );
}
