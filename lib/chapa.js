// Thin wrapper around Chapa's Payment API.
// Docs: https://developer.chapa.co
// The secret key NEVER leaves the server. It comes from Admin -> Payments (saved in the
// payment_settings table) or, if nothing is saved there, from the CHAPA_SECRET_KEY secret.
const axios = require('axios');
const { getClient } = require('./supabaseClient');

const BASE_URL = process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1';

let cache = { key: '', at: 0 };
function clearKeyCache() { cache = { key: '', at: 0 }; }

async function savedKey() {
  if (cache.at && Date.now() - cache.at < 30000) return cache.key;
  let key = '';
  try {
    const { data } = await getClient().from('payment_settings').select('value').eq('key', 'chapa_secret_key').maybeSingle();
    key = (data && data.value) || '';
  } catch (e) { /* table not created yet: fall back to the environment secret */ }
  cache = { key, at: Date.now() };
  return key;
}

// -> { key, source: 'admin' | 'environment' | 'none' }
async function getSecretKey() {
  const saved = await savedKey();
  if (saved) return { key: saved, source: 'admin' };
  if (process.env.CHAPA_SECRET_KEY) return { key: process.env.CHAPA_SECRET_KEY, source: 'environment' };
  return { key: '', source: 'none' };
}

async function saveSecretKey(value) {
  const { error } = await getClient().from('payment_settings').upsert([{ key: 'chapa_secret_key', value }], { onConflict: 'key' });
  if (error) throw error;
  clearKeyCache();
}
async function removeSecretKey() {
  const { error } = await getClient().from('payment_settings').delete().eq('key', 'chapa_secret_key');
  if (error) throw error;
  clearKeyCache();
}

// Safe-to-show summary: never returns the full key.
function describeKey(key) {
  if (!key) return { set: false, masked: '', mode: '' };
  const dash = key.indexOf('-');
  const masked = key.length > 18 && dash > 0 && dash < 16 ? key.slice(0, dash + 1) + '••••••••' + key.slice(-4) : '••••••••';
  const mode = /^CHASECK_TEST/i.test(key) ? 'test' : /^CHASECK/i.test(key) ? 'live' : 'unknown';
  return { set: true, masked, mode };
}

// Asks Chapa for its bank list, which needs a valid secret key. Returns { ok, message }.
async function testConnection() {
  const { key } = await getSecretKey();
  if (!key) return { ok: false, message: 'No Chapa secret key is saved yet.' };
  try {
    await axios.get(BASE_URL + '/banks', { headers: { Authorization: `Bearer ${key}` }, timeout: 15000 });
    return { ok: true, message: 'Connected to Chapa. The key is valid.' };
  } catch (err) {
    const status = err.response && err.response.status;
    const detail = err.response && err.response.data && (err.response.data.message || err.response.data.error);
    if (status === 401 || status === 403) return { ok: false, message: 'Chapa rejected this key. Copy the Secret Key again from your Chapa dashboard (Settings, API Keys).' };
    return { ok: false, message: 'Could not reach Chapa' + (detail ? ': ' + String(detail).slice(0, 120) : '. Please try again.') };
  }
}

async function client() {
  const { key: secretKey } = await getSecretKey();
  if (!secretKey) {
    throw new Error('CHAPA_SECRET_KEY is not set. Add your Chapa secret key in Admin > Payments.');
  }
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${secretKey}` },
    timeout: 15000
  });
}

// Chapa only accepts letters, numbers, spaces, dots, hyphens and underscores in
// the description — anything else (brackets, &, dashes like —) makes the
// payment fail to start. Titles are cleaned here so any product name is safe.
function cleanDescription(text) {
  const cleaned = String(text || '').replace(/[^A-Za-z0-9 _.\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return cleaned || 'Norden Trading payment';
}

/**
 * Initialize a Chapa transaction. Returns the hosted checkout_url to redirect the customer to.
 */
async function initialize({ amount, currency, email, firstName, lastName, txRef, callbackUrl, returnUrl, title, description }) {
  const api = await client();
  const payload = {
    amount: String(amount),
    currency: currency || 'ETB',
    email,
    first_name: firstName,
    last_name: lastName,
    tx_ref: txRef,
    callback_url: callbackUrl,
    return_url: returnUrl,
    customization: {
      title: (title || 'Norden Trading').slice(0, 16), // Chapa limits this field's length
      description: cleanDescription(description)
    }
  };
  const res = await api.post('/transaction/initialize', payload);
  return res.data; // { status, message, data: { checkout_url } }
}

/**
 * Verify a transaction by tx_ref. Use this both in the webhook and the return page —
 * never trust the redirect alone, always verify server-side against Chapa.
 */
async function verify(txRef) {
  const api = await client();
  const res = await api.get(`/transaction/verify/${encodeURIComponent(txRef)}`);
  return res.data; // { status, message, data: { status: 'success' | ..., amount, currency, ... } }
}

module.exports = { initialize, verify, getSecretKey, saveSecretKey, removeSecretKey, describeKey, testConnection };
