/**
 * api.js — REST API client
 * Wraps fetch calls with auth headers and error handling.
 */

const BASE = '/api';

/** Get stored JWT token */
function getToken() {
  return localStorage.getItem('ah_token');
}

/** Generic fetch wrapper */
async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data   = data;
    throw err;
  }
  return data;
}

// ─── Auth ────────────────────────────────────────────────────

export async function apiRegister(username, password) {
  return request('POST', '/auth/register', { username, password });
}

export async function apiLogin(username, password) {
  const data = await request('POST', '/auth/login', { username, password });
  if (data.token) localStorage.setItem('ah_token', data.token);
  return data;
}

export function apiLogout() {
  localStorage.removeItem('ah_token');
  localStorage.removeItem('ah_user');
}

// ─── User ────────────────────────────────────────────────────

export async function apiGetProfile() {
  return request('GET', '/user/profile');
}

// ─── Leaderboard ─────────────────────────────────────────────

export async function apiGetLeaderboard() {
  return request('GET', '/leaderboard');
}

// ─── Helpers ─────────────────────────────────────────────────

export function isLoggedIn() {
  return !!getToken();
}

export function saveUser(user) {
  localStorage.setItem('ah_user', JSON.stringify(user));
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('ah_user'));
  } catch {
    return null;
  }
}
