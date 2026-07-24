// Data access layer backed by Supabase (Postgres + Storage).
// Every function here talks to Supabase and returns plain JS objects/arrays
// shaped the way the EJS views expect (see the old lib/db.js for the original
// JSON-file shape this mirrors).
const { getClient } = require('./supabaseClient');

function mapOrder(row) {
  if (!row) return row;
  const { order_num, ...rest } = row;
  return { ...rest, order: order_num };
}

// ---------- Site content (key/value, bilingual) ----------

async function getContent() {
  const sb = getClient();
  const { data, error } = await sb.from('content').select('*');
  if (error) throw error;
  const content = {};
  data.forEach(row => { content[row.key] = { en: row.value_en || '', am: row.value_am || '' }; });
  return content;
}

async function updateContent(updates) {
  // updates: { key: { en, am } }
  const sb = getClient();
  const rows = Object.entries(updates).map(([key, val]) => ({ key, value_en: val.en, value_am: val.am }));
  const { error } = await sb.from('content').upsert(rows, { onConflict: 'key' });
  if (error) throw error;
}

// ---------- Services ----------

async function listServices({ activeOnly = false } = {}) {
  const sb = getClient();
  let query = sb.from('services').select('*').order('order_num', { ascending: true });
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(mapOrder);
}

async function getService(id) {
  const sb = getClient();
  const { data, error } = await sb.from('services').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return mapOrder(data);
}

async function createService(fields) {
  const sb = getClient();
  const { data: existing } = await sb.from('services').select('id');
  const nextOrder = (existing || []).length + 1;
  const { error } = await sb.from('services').insert([{
    title_en: fields.title_en, title_am: fields.title_am,
    desc_en: fields.desc_en, desc_am: fields.desc_am,
    price: fields.price, currency: fields.currency || 'ETB',
    image: fields.image || '', active: true, order_num: nextOrder
  }]);
  if (error) throw error;
}

async function updateService(id, fields) {
  const sb = getClient();
  const payload = {
    title_en: fields.title_en, title_am: fields.title_am,
    desc_en: fields.desc_en, desc_am: fields.desc_am,
    price: fields.price, currency: fields.currency,
    active: fields.active
  };
  if (fields.order !== undefined) payload.order_num = fields.order;
  if (fields.image) payload.image = fields.image;
  const { error } = await sb.from('services').update(payload).eq('id', id);
  if (error) throw error;
}

async function deleteService(id) {
  const sb = getClient();
  const { error } = await sb.from('services').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Repeatable content blocks (about_features / why_us / process) ----------

async function listBlocks(section) {
  const sb = getClient();
  const { data, error } = await sb.from('blocks').select('*').eq('section', section).order('order_num', { ascending: true });
  if (error) throw error;
  return data.map(mapOrder);
}

async function createBlock(section, fields) {
  const sb = getClient();
  const { data: existing } = await sb.from('blocks').select('id').eq('section', section);
  const nextOrder = (existing || []).length + 1;
  const { error } = await sb.from('blocks').insert([{
    section, order_num: nextOrder,
    title_en: fields.title_en, title_am: fields.title_am,
    body_en: fields.body_en, body_am: fields.body_am
  }]);
  if (error) throw error;
}

async function updateBlock(section, id, fields) {
  const sb = getClient();
  const payload = { title_en: fields.title_en, title_am: fields.title_am, body_en: fields.body_en, body_am: fields.body_am };
  if (fields.order !== undefined) payload.order_num = fields.order;
  const { error } = await sb.from('blocks').update(payload).eq('id', id).eq('section', section);
  if (error) throw error;
}

async function deleteBlock(section, id) {
  const sb = getClient();
  const { error } = await sb.from('blocks').delete().eq('id', id).eq('section', section);
  if (error) throw error;
}

// ---------- Project gallery ----------

async function listGallery() {
  const sb = getClient();
  const { data, error } = await sb.from('gallery').select('*').order('order_num', { ascending: true });
  if (error) throw error;
  return data.map(mapOrder);
}

async function addGalleryItem(fields) {
  const sb = getClient();
  const { data: existing } = await sb.from('gallery').select('id');
  const nextOrder = (existing || []).length + 1;
  const { error } = await sb.from('gallery').insert([{
    image: fields.image, caption_en: fields.caption_en || '', caption_am: fields.caption_am || '', order_num: nextOrder
  }]);
  if (error) throw error;
}

async function deleteGalleryItem(id) {
  const sb = getClient();
  const { error } = await sb.from('gallery').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Orders ----------

async function createOrder(fields) {
  const sb = getClient();
  const { error } = await sb.from('orders').insert([{
    service_id: fields.service_id, service_title: fields.service_title,
    customer_name: fields.customer_name, customer_email: fields.customer_email, customer_phone: fields.customer_phone,
    amount: fields.amount, currency: fields.currency, tx_ref: fields.tx_ref, status: fields.status || 'pending'
  }]);
  if (error) throw error;
}

async function getOrderByTxRef(txRef) {
  const sb = getClient();
  const { data, error } = await sb.from('orders').select('*').eq('tx_ref', txRef).maybeSingle();
  if (error) throw error;
  return data;
}

async function updateOrderStatus(txRef, status) {
  const sb = getClient();
  const { error } = await sb.from('orders').update({ status }).eq('tx_ref', txRef);
  if (error) throw error;
}

async function listOrders() {
  const sb = getClient();
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function getStats() {
  const sb = getClient();
  const [{ count: serviceCount }, orders] = await Promise.all([
    sb.from('services').select('id', { count: 'exact', head: true }).eq('active', true),
    sb.from('orders').select('*')
  ]);
  const allOrders = orders.data || [];
  const paid = allOrders.filter(o => o.status === 'paid');
  const revenue = paid.reduce((sum, o) => sum + Number(o.amount), 0);
  return {
    serviceCount: serviceCount || 0,
    orderCount: allOrders.length,
    paidCount: paid.length,
    revenue,
    recentOrders: allOrders
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
  };
}

// ---------- Sessions (used by lib/sessionStore.js, not called directly) ----------

async function getSession(sid) {
  const sb = getClient();
  const { data, error } = await sb.from('sessions').select('*').eq('sid', sid).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expire) < new Date()) return null; // expired
  return data.sess;
}

async function setSession(sid, sess, expire) {
  const sb = getClient();
  const { error } = await sb.from('sessions').upsert([{ sid, sess, expire }], { onConflict: 'sid' });
  if (error) throw error;
}

async function destroySession(sid) {
  const sb = getClient();
  const { error } = await sb.from('sessions').delete().eq('sid', sid);
  if (error) throw error;
}

module.exports = {
  getContent, updateContent,
  listServices, getService, createService, updateService, deleteService,
  listBlocks, createBlock, updateBlock, deleteBlock,
  listGallery, addGalleryItem, deleteGalleryItem,
  createOrder, getOrderByTxRef, updateOrderStatus, listOrders, getStats,
  getSession, setSession, destroySession
};
