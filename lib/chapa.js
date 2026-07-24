// Thin wrapper around Chapa's Payment API.
// Docs: https://developer.chapa.co
// The secret key NEVER leaves the server — it is only read from process.env here.
const axios = require('axios');

const BASE_URL = process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1';

function client() {
  const secretKey = process.env.CHAPA_SECRET_KEY;
  if (!secretKey) {
    throw new Error('CHAPA_SECRET_KEY is not set. Add it to your .env file (see README).');
  }
  return axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${secretKey}` },
    timeout: 15000
  });
}

/**
 * Initialize a Chapa transaction. Returns the hosted checkout_url to redirect the customer to.
 */
async function initialize({ amount, currency, email, firstName, lastName, txRef, callbackUrl, returnUrl, title, description }) {
  const api = client();
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
      description: description || 'Service payment'
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
  const api = client();
  const res = await api.get(`/transaction/verify/${encodeURIComponent(txRef)}`);
  return res.data; // { status, message, data: { status: 'success' | ..., amount, currency, ... } }
}

module.exports = { initialize, verify };
