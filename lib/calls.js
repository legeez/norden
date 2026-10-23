// Call service: settings, available time slots, and bookings (Supabase).
// Everything about "when can someone call" lives here so the public page,
// the checkout and the admin panel all use the same rules.
const { getClient } = require('./supabaseClient');

// Africa/Addis_Ababa is UTC+3 all year (no daylight saving), so a fixed offset is exact.
const TZ_OFFSET_MIN = 180;
// An unpaid booking holds its slot for this long, then the slot opens up again.
const PENDING_HOLD_MS = 20 * 60 * 1000;

const DAYS = [
  { key: 'mon', dow: 1, en: 'Monday', am: 'ሰኞ', s_en: 'Mon' },
  { key: 'tue', dow: 2, en: 'Tuesday', am: 'ማክሰኞ', s_en: 'Tue' },
  { key: 'wed', dow: 3, en: 'Wednesday', am: 'ረቡዕ', s_en: 'Wed' },
  { key: 'thu', dow: 4, en: 'Thursday', am: 'ሐሙስ', s_en: 'Thu' },
  { key: 'fri', dow: 5, en: 'Friday', am: 'አርብ', s_en: 'Fri' },
  { key: 'sat', dow: 6, en: 'Saturday', am: 'ቅዳሜ', s_en: 'Sat' },
  { key: 'sun', dow: 0, en: 'Sunday', am: 'እሑድ', s_en: 'Sun' }
];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Every value is stored as text ('on' / 'off' for switches). Admin -> Call Settings edits these.
const DEFAULTS = {
  live_enabled: 'off',          // the "Available now / Offline" switch
  scheduled_enabled: 'on',
  channel_phone: 'on',
  channel_whatsapp: 'on',
  call_phone: '',               // number customers call after paying for a live call
  call_whatsapp: '',
  currency: 'ETB',
  live_price: '200',
  live_minutes: '10',
  live_window_min: '60',        // how long after paying the call buttons keep working
  scheduled_price: '500',
  slot_minutes: '30',
  min_notice_hours: '2',
  max_days_ahead: '14',
  mon_on: 'on', mon_start: '09:00', mon_end: '17:00',
  tue_on: 'on', tue_start: '09:00', tue_end: '17:00',
  wed_on: 'on', wed_start: '09:00', wed_end: '17:00',
  thu_on: 'on', thu_start: '09:00', thu_end: '17:00',
  fri_on: 'on', fri_start: '09:00', fri_end: '17:00',
  sat_on: 'off', sat_start: '09:00', sat_end: '13:00',
  sun_on: 'off', sun_start: '09:00', sun_end: '13:00',
  notify_admin: 'on',           // show new calls on the admin dashboard
  notify_telegram: 'off',
  telegram_chat_id: '',
  notify_email: 'off',
  notify_email_to: ''
};

function flag(v) { return v === 'on'; }
function num(v, fallback) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : (fallback || 0); }
function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ---------- Settings ----------

async function getSettings() {
  const { data, error } = await getClient().from('call_settings').select('*');
  if (error) throw error;
  const s = { ...DEFAULTS };
  (data || []).forEach(r => { s[r.key] = r.value; });
  return s;
}

// Public pages must keep working before the SQL migration has been run.
async function getSettingsSafe() {
  try { return { ready: true, s: await getSettings() }; }
  catch (e) { console.warn('call settings unavailable:', (e && e.message) || e); return { ready: false, s: { ...DEFAULTS } }; }
}

async function saveSettings(map) {
  const rows = Object.entries(map).map(([key, value]) => ({ key, value: String(value) }));
  const { error } = await getClient().from('call_settings').upsert(rows, { onConflict: 'key' });
  if (error) throw error;
}

// ---------- Phone numbers ----------

// "+251 91 234 5678", "0912345678" and "912345678" all become 251912345678.
function intlDigits(n) {
  let d = String(n || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '251' + d.slice(1);
  else if (d.length === 9 && /^[79]/.test(d)) d = '251' + d;
  return d.length >= 9 ? d : '';
}
function telHref(n) { const d = intlDigits(n); return d ? 'tel:+' + d : ''; }
function waHref(n, text) {
  const d = intlDigits(n);
  return d ? 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '') : '';
}

// ---------- Time helpers (Addis Ababa clock) ----------

function pad(n) { return String(n).padStart(2, '0'); }

function toLocal(date) {
  const t = new Date(date.getTime() + TZ_OFFSET_MIN * 60000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}
function dateKey(p) { return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
function parseDateKey(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, m: mo, d, dow: t.getUTCDay() };
}
function localToUtcMs(p, minutes) { return Date.UTC(p.y, p.m - 1, p.d, 0, minutes) - TZ_OFFSET_MIN * 60000; }
function parseHM(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}
function clock12(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

function dayRule(s, dow) {
  const day = DAYS.find(d => d.dow === dow);
  if (!day || !flag(s[day.key + '_on'])) return null;
  const start = parseHM(s[day.key + '_start']);
  const end = parseHM(s[day.key + '_end']);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function maxAhead(s) { return clampInt(s.max_days_ahead, 1, 60, 14); }

// Every bookable slot on one day, minus slots already taken.
function generateSlots(s, dateStr, now, taken) {
  const p = parseDateKey(dateStr);
  if (!p) return [];
  const rule = dayRule(s, p.dow);
  if (!rule) return [];
  const todayKey = dateKey(toLocal(now));
  const lastKey = dateKey(toLocal(new Date(now.getTime() + maxAhead(s) * 86400000)));
  if (dateStr < todayKey || dateStr > lastKey) return [];
  const step = clampInt(s.slot_minutes, 10, 240, 30);
  const earliest = now.getTime() + clampInt(s.min_notice_hours, 0, 168, 2) * 3600000;
  const out = [];
  for (let t = rule.start; t + step <= rule.end; t += step) {
    const ms = localToUtcMs(p, t);
    if (ms < earliest || (taken && taken.has(ms))) continue;
    out.push({ ms, iso: new Date(ms).toISOString(), label: clock12(t) });
  }
  return out;
}

// Days that still have at least one open slot (ignoring who has booked).
function availableDays(s, now) {
  const today = toLocal(now);
  const out = [];
  for (let i = 0; i <= maxAhead(s); i++) {
    const b = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const p = { y: b.getUTCFullYear(), m: b.getUTCMonth() + 1, d: b.getUTCDate(), dow: b.getUTCDay() };
    const key = dateKey(p);
    if (!generateSlots(s, key, now, null).length) continue;
    const day = DAYS.find(x => x.dow === p.dow);
    out.push({
      date: key,
      en: `${day.s_en} ${p.d} ${MONTHS_EN[p.m - 1]}`,
      am: `${day.am} ${p.d}/${p.m}`
    });
  }
  return out;
}

function formatSlot(iso, lang) {
  const d = new Date(iso);
  const p = toLocal(d);
  const day = DAYS.find(x => x.dow === p.dow);
  const time = clock12(p.minutes);
  return lang === 'am'
    ? `${day.am} ${p.d}/${p.m}/${p.y} · ${time}`
    : `${day.s_en} ${p.d} ${MONTHS_EN[p.m - 1]} ${p.y}, ${time}`;
}

// ---------- Call types (categories) ----------

function mapCategory(r) {
  const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  return { ...r, order: r.order_num, live_price: n(r.live_price), scheduled_price: n(r.scheduled_price), live_minutes: n(r.live_minutes) };
}

async function listCategories({ activeOnly = false } = {}) {
  let q = getClient().from('call_categories').select('*').order('order_num', { ascending: true });
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(mapCategory);
}
async function listCategoriesSafe(opts) {
  try { return await listCategories(opts); } catch (e) { console.warn('call types unavailable:', (e && e.message) || e); return []; }
}
async function getCategory(id) {
  const { data, error } = await getClient().from('call_categories').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapCategory(data) : null;
}
function categoryRow(f) {
  const opt = (v) => (v === '' || v === undefined || v === null || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));
  return {
    title_en: String(f.title_en || '').trim().slice(0, 120), title_am: String(f.title_am || '').trim().slice(0, 120),
    desc_en: String(f.desc_en || '').trim().slice(0, 400), desc_am: String(f.desc_am || '').trim().slice(0, 400),
    live_price: opt(f.live_price), scheduled_price: opt(f.scheduled_price),
    live_minutes: opt(f.live_minutes) === null ? null : clampInt(f.live_minutes, 1, 120, 10)
  };
}
async function createCategory(f) {
  const sb = getClient();
  const { data: existing } = await sb.from('call_categories').select('id');
  const { error } = await sb.from('call_categories').insert([{ ...categoryRow(f), active: true, order_num: (existing || []).length + 1 }]);
  if (error) throw error;
}
async function updateCategory(id, f) {
  const payload = { ...categoryRow(f), active: !!f.active };
  if (f.order !== undefined) payload.order_num = f.order;
  const { error } = await getClient().from('call_categories').update(payload).eq('id', id);
  if (error) throw error;
}
async function deleteCategory(id) {
  const { error } = await getClient().from('call_categories').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Bookings ----------

function slotError() { return Object.assign(new Error('SLOT_TAKEN'), { code: 'SLOT_TAKEN' }); }

async function takenSlotSet(fromMs, toMs) {
  const { data, error } = await getClient().from('call_bookings')
    .select('slot_start,status,created_at')
    .eq('call_type', 'scheduled')
    .in('status', ['pending', 'paid'])
    .neq('call_status', 'cancelled')
    .gte('slot_start', new Date(fromMs).toISOString())
    .lte('slot_start', new Date(toMs).toISOString());
  if (error) throw error;
  const set = new Set();
  (data || []).forEach(r => {
    const stale = r.status === 'pending' && Date.now() - new Date(r.created_at).getTime() > PENDING_HOLD_MS;
    if (!stale) set.add(new Date(r.slot_start).getTime());
  });
  return set;
}

async function takenForDay(dateStr) {
  const p = parseDateKey(dateStr);
  if (!p) return new Set();
  return takenSlotSet(localToUtcMs(p, 0), localToUtcMs(p, 24 * 60));
}

async function createBooking(b) {
  const sb = getClient();
  if (b.call_type === 'scheduled') {
    // Open up this exact slot if an earlier unpaid attempt has expired.
    await sb.from('call_bookings').update({ status: 'failed' })
      .eq('call_type', 'scheduled').eq('slot_start', b.slot_start).eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - PENDING_HOLD_MS).toISOString());
  }
  const { data, error } = await sb.from('call_bookings').insert([b]).select().single();
  if (error) {
    if (error.code === '23505' && /call_bookings_slot_idx/.test(error.message || '')) throw slotError();
    throw error;
  }
  return data;
}

async function getByTxRef(txRef) {
  const { data, error } = await getClient().from('call_bookings').select('*').eq('tx_ref', txRef).maybeSingle();
  if (error) throw error;
  return data;
}

// Flips pending/failed -> paid exactly once. `changed` is true only for the caller
// that actually made the change, so the return page and the webhook never both notify.
async function markPaid(txRef) {
  const { data, error } = await getClient().from('call_bookings')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('tx_ref', txRef).neq('status', 'paid').select();
  if (error) {
    if (error.code === '23505') return { changed: false, conflict: true };
    throw error;
  }
  const rows = data || [];
  return { changed: rows.length > 0, booking: rows[0] || null };
}

async function markFailed(txRef) {
  const { error } = await getClient().from('call_bookings').update({ status: 'failed' }).eq('tx_ref', txRef).eq('status', 'pending');
  if (error) throw error;
}

async function listBookings({ paidOnly = true } = {}) {
  let q = getClient().from('call_bookings').select('*').order('created_at', { ascending: false }).limit(200);
  if (paidOnly) q = q.eq('status', 'paid');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function updateCallStatus(id, callStatus, note) {
  const payload = { call_status: callStatus };
  if (note !== undefined) payload.admin_note = note;
  const { error } = await getClient().from('call_bookings').update(payload).eq('id', id);
  if (error) throw error;
}

async function countNewSafe() {
  try {
    const { count, error } = await getClient().from('call_bookings')
      .select('id', { count: 'exact', head: true }).eq('status', 'paid').eq('call_status', 'new');
    if (error) throw error;
    return count || 0;
  } catch (e) { return 0; }
}

module.exports = {
  DAYS, DEFAULTS, flag, num, clampInt,
  getSettings, getSettingsSafe, saveSettings,
  intlDigits, telHref, waHref,
  parseHM, parseDateKey, dateKey, toLocal, generateSlots, availableDays, formatSlot, maxAhead,
  takenSlotSet, takenForDay,
  listCategories, listCategoriesSafe, getCategory, createCategory, updateCategory, deleteCategory,
  createBooking, getByTxRef, markPaid, markFailed, listBookings, updateCallStatus, countNewSafe
};
