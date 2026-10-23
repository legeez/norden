// Admin notifications for the call service. Both channels are free:
//   - Telegram Bot API (needs TELEGRAM_BOT_TOKEN secret + a chat id set in Admin -> Call Settings)
//   - Resend email API, free tier (needs RESEND_API_KEY secret + an address set in Admin -> Call Settings)
// Each one can be switched on/off in the admin panel. Failures never break a booking.
const axios = require('axios');

const calls = require('./calls');

async function telegram(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return 'TELEGRAM_BOT_TOKEN secret is not set';
  if (!chatId) return 'Telegram chat id is empty';
  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`,
    { chat_id: chatId, text, disable_web_page_preview: true }, { timeout: 8000 });
  return 'sent';
}

async function email(to, subject, text) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return 'RESEND_API_KEY secret is not set';
  if (!to) return 'Notification email address is empty';
  // onboarding@resend.dev works immediately but can only email the address you signed up to
  // Resend with. Verify your own domain in Resend to use another sender.
  const from = process.env.EMAIL_FROM || 'Norden Trading <onboarding@resend.dev>';
  await axios.post('https://api.resend.com/emails', { from, to: [to], subject, text },
    { headers: { Authorization: `Bearer ${key}` }, timeout: 8000 });
  return 'sent';
}

function errText(err) {
  if (err && err.response && err.response.data) {
    const d = err.response.data;
    return String(d.description || d.message || JSON.stringify(d)).slice(0, 160);
  }
  return String((err && err.message) || err).slice(0, 160);
}

// Sends to every channel that is switched on. Returns { telegram, email } status strings.
async function notifyAdmin(s, subject, text) {
  const result = { telegram: 'off', email: 'off' };
  const jobs = [];
  if (calls.flag(s.notify_telegram)) {
    jobs.push(telegram(s.telegram_chat_id, `${subject}\n\n${text}`).then(r => { result.telegram = r; }, e => { result.telegram = 'failed: ' + errText(e); }));
  }
  if (calls.flag(s.notify_email)) {
    jobs.push(email(s.notify_email_to, subject, text).then(r => { result.email = r; }, e => { result.email = 'failed: ' + errText(e); }));
  }
  await Promise.all(jobs);
  return result;
}

function describeBooking(b, baseUrl) {
  const when = b.call_type === 'scheduled' ? calls.formatSlot(b.slot_start, 'en') + ' (Addis Ababa)' : 'LIVE - customer will call you now';
  const how = b.call_type === 'scheduled'
    ? `${b.channel === 'whatsapp' ? 'WhatsApp' : 'Phone'} - you call the customer`
    : `${b.channel === 'whatsapp' ? 'WhatsApp' : 'Phone'} - the customer calls you`;
  return [
    b.category_title ? `Call type: ${b.category_title}` : '',
    `Mode: ${b.call_type === 'live' ? 'Live call' : 'Scheduled call'}`,
    `When: ${when}`,
    `How: ${how}`,
    `Name: ${b.customer_name}`,
    `Phone: ${b.customer_phone}`,
    `Email: ${b.customer_email}`,
    b.topic ? `Topic: ${b.topic}` : '',
    `Paid: ${Number(b.amount).toLocaleString('en-US')} ${b.currency}`,
    `Reference: ${b.tx_ref}`,
    baseUrl ? `Admin: ${baseUrl}/admin/calls` : ''
  ].filter(Boolean).join('\n');
}

module.exports = { notifyAdmin, describeBooking };
