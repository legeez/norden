// Header menu, header button and footer links (Admin -> Menus).
// Until the menu is customised the website uses the built-in defaults below, so the
// site never depends on the database being set up.
const { getClient } = require('./supabaseClient');

// url: "/" is the home page, "/#about" a section on it, "/products" another page,
// anything starting with http(s):// mailto: tel: is used exactly as written.
const DEFAULTS = {
  header: [
    { label_en: 'Company', label_am: 'ኩባንያ', url: '/#about' },
    { label_en: 'Services', label_am: 'አገልግሎቶች', url: '/#services' },
    { label_en: 'Book a Call', label_am: 'ጥሪ ያስይዙ', url: '/call' },
    { label_en: 'Templates', label_am: 'የሰነድ ቅጾች', url: '/products' },
    { label_en: 'Process', label_am: 'የስራ ሂደት', url: '/#process' },
    { label_en: 'Projects', label_am: 'ፕሮጀክቶች', url: '/#projects' },
    { label_en: 'Contact', label_am: 'ያግኙን', url: '/#contact' }
  ],
  cta: [{ label_en: 'Request a Quote', label_am: 'ዋጋ ይጠይቁ', url: '/#services' }],
  footer: [
    { label_en: 'About us', label_am: 'ስለ እኛ', url: '/#about' },
    { label_en: 'BOQ & contract templates', label_am: 'የBOQ እና የውል ቅጾች', url: '/products' },
    { label_en: 'Book a call', label_am: 'ጥሪ ያስይዙ', url: '/call' },
    { label_en: 'Projects', label_am: 'ፕሮጀክቶች', url: '/#projects' },
    { label_en: 'Contact', label_am: 'ያግኙን', url: '/#contact' }
  ]
};
const LOCATIONS = ['header', 'cta', 'footer'];

function withDefaults(list) {
  return list.map((d, i) => ({ id: 'd' + i, new_tab: false, visible: true, order_num: i + 1, ...d }));
}

// Keeps the address safe: a site path, or an explicit http(s)/mailto/tel link.
function cleanUrl(u) {
  const v = String(u || '').trim().slice(0, 300);
  if (!v) return '/';
  if (/^(https?:\/\/|mailto:|tel:)/i.test(v)) return v;
  if (/^(javascript|data|vbscript):/i.test(v)) return '/';
  return v.startsWith('/') ? v : '/' + v;
}

// ---------- Reading ----------
let cache = { at: 0, value: null };
const TTL_MS = 30000;
function invalidate() { cache = { at: 0, value: null }; }

async function readRows() {
  const { data, error } = await getClient().from('nav_items').select('*').order('order_num', { ascending: true });
  if (error) throw error;
  return data || [];
}

// What the public header and footer print: { header: [...], cta: [...], footer: [...] }
async function loadMenu() {
  if (cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  let rows = [];
  try { rows = await readRows(); } catch (e) { rows = []; }
  const out = {};
  LOCATIONS.forEach(loc => {
    const mine = rows.filter(r => r.location === loc);
    out[loc] = mine.length ? mine.filter(r => r.visible).map(r => ({ ...r })) : withDefaults(DEFAULTS[loc]);
  });
  cache = { at: Date.now(), value: out };
  return out;
}

// What the admin page edits (all rows, including hidden ones). Falls back to the defaults,
// and reports whether the table exists so the page can explain what to do.
async function loadForAdmin() {
  try {
    const rows = await readRows();
    const out = { ready: true };
    LOCATIONS.forEach(loc => {
      const mine = rows.filter(r => r.location === loc);
      out[loc] = mine.length ? mine : null; // null = never customised
    });
    return out;
  } catch (e) {
    return { ready: false, header: null, cta: null, footer: null };
  }
}

// Copies the built-in menu into the database (first time the admin opens Menus).
async function seedDefaults(location) {
  const rows = DEFAULTS[location].map((d, i) => ({ location, label_en: d.label_en, label_am: d.label_am, url: d.url, new_tab: false, visible: true, order_num: i + 1 }));
  const { error } = await getClient().from('nav_items').insert(rows);
  if (error) throw error;
  invalidate();
}

// ---------- Writing ----------
function rowFrom(f) {
  return {
    label_en: String(f.label_en || '').trim().slice(0, 60) || 'Link',
    label_am: String(f.label_am || '').trim().slice(0, 60),
    url: cleanUrl(f.url),
    new_tab: !!f.new_tab,
    visible: f.visible !== false
  };
}

async function addItem(location, f) {
  if (!LOCATIONS.includes(location)) throw new Error('bad location');
  const { data } = await getClient().from('nav_items').select('id').eq('location', location);
  const { error } = await getClient().from('nav_items').insert([{ ...rowFrom(f), location, order_num: (data || []).length + 1 }]);
  if (error) throw error;
  invalidate();
}
async function updateItem(id, f) {
  const { error } = await getClient().from('nav_items').update(rowFrom(f)).eq('id', id);
  if (error) throw error;
  invalidate();
}
async function deleteItem(id) {
  const { error } = await getClient().from('nav_items').delete().eq('id', id);
  if (error) throw error;
  invalidate();
}
async function reorder(ids) {
  await Promise.all(ids.map((id, i) => getClient().from('nav_items').update({ order_num: i + 1 }).eq('id', id)));
  invalidate();
}

// The visible main-menu links in their current order (empty if the menu was never customised).
async function headerLinks() {
  try { return (await readRows()).filter(r => r.location === 'header' && r.visible); } catch (e) { return []; }
}
async function locationOf(id) {
  const { data } = await getClient().from('nav_items').select('location').eq('id', id).maybeSingle();
  return data ? data.location : null;
}

module.exports = { headerLinks, locationOf, DEFAULTS, LOCATIONS, cleanUrl, loadMenu, loadForAdmin, seedDefaults, addItem, updateItem, deleteItem, reorder, invalidate };
