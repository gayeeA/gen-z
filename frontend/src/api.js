const BASE = import.meta.env.VITE_API_URL || '';
export const getToken = () => localStorage.getItem('genz_token');
export const setToken = (t) => (t ? localStorage.setItem('genz_token', t) : localStorage.removeItem('genz_token'));

async function req(method, path, body, raw) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401 && getToken()) { setToken(null); window.location.href = '/login'; }
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error((data && data.error) || r.statusText || 'Request failed');
  return raw ? text : data;
}
export const api = {
  get: (p) => req('GET', p),
  post: (p, b = {}) => req('POST', p, b),
  put: (p, b = {}) => req('PUT', p, b),
  del: (p) => req('DELETE', p),
  text: (p) => req('GET', p, undefined, true),
};
export const qs = (o) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false).map(([k, v]) => [k, String(v)])).toString();

export const wsUrl = () => {
  const base = BASE ? BASE.replace(/^http/, 'ws') : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  return `${base}/ws/live?token=${getToken()}`;
};
