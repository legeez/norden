// Page builder: which sections each page has, in which order (Admin -> Pages).
// "home" is the home page and always exists. Pages you create get their own address
// (/p/<slug>). Until the home page is customised it shows the built-in order, so the site
// never depends on the database being set up.
const { getClient } = require('./supabaseClient');
const { slugify } = require('./seo');
const { cleanUrl } = require('./menu');

// Sections that already exist on the home page. Their content is edited in the admin
// area named in `edit`; here you only choose whether they appear and in which order.
const BUILTIN = {
  hero: { name: 'Hero banner', anchor: '', edit: '/admin/content', editLabel: 'Site Content', homeOnly: true, about: 'The big headline at the top, with the sample BOQ card.' },
  strip: { name: 'Scrolling services strip', anchor: '', edit: '', editLabel: '', homeOnly: true, about: 'The moving line of services under the hero banner.' },
  about: { name: 'About the company', anchor: 'about', edit: '/admin/content', editLabel: 'Site Content', about: 'Company profile, photo and key facts.' },
  services: { name: 'Services & prices', anchor: 'services', edit: '/admin/services', editLabel: 'Services & Prices', about: 'Your service cards with prices and Buy buttons.' },
  call: { name: 'Book a call', anchor: 'call', edit: '/admin/call-types', editLabel: 'Call Types', about: 'Call types with prices and the Book a call button.' },
  products: { name: 'Templates & downloads', anchor: 'templates', edit: '/admin/products', editLabel: 'Products & Files', about: 'Your downloadable Excel, Word and PDF files.' },
  process: { name: 'How we work', anchor: 'process', edit: '/admin/blocks/process', editLabel: 'Page Sections', about: 'The step-by-step process.' },
  why: { name: 'Why choose us', anchor: 'why', edit: '/admin/blocks/why_us', editLabel: 'Page Sections', about: 'Your strengths and numbers.' },
  projects: { name: 'Recent projects', anchor: 'projects', edit: '/admin/gallery', editLabel: 'Project Gallery', about: 'Photos of your projects.' },
  contact: { name: 'Contact', anchor: 'contact', edit: '/admin/content', editLabel: 'Site Content', about: 'Phone, email, office and the contact buttons.' }
};
const HOME_ORDER = ['hero', 'strip', 'about', 'services', 'call', 'products', 'process', 'why', 'projects', 'contact'];

// Sections you write yourself. `fields` drives both the admin form and the saving rules.
const L = (k, label, type, max) => ({ k, label, type: type || 'text', lang: true, max: max || 160 });
function cardFields(n, count) {
  const out = [];
  for (let i = 1; i <= count; i++) out.push(L(`${n}${i}_title`, `Card ${i} title`), L(`${n}${i}_body`, `Card ${i} text`, 'textarea', 400), { k: `${n}${i}_url`, label: `Card ${i} link (optional)`, type: 'url' });
  return out;
}
function faqFields(count) {
  const out = [];
  for (let i = 1; i <= count; i++) out.push(L(`q${i}`, `Question ${i}`), L(`a${i}`, `Answer ${i}`, 'textarea', 1200));
  return out;
}
const KINDS = {
  text: {
    name: 'Text block', about: 'A heading and paragraphs of text.',
    fields: [L('title', 'Heading'), L('body', 'Text (separate paragraphs with an empty line)', 'textarea', 6000), { k: 'align', label: 'Alignment', type: 'select', options: ['left', 'center'], def: 'left' }],
    sample: { title_en: 'Your heading', title_am: '', body_en: 'Write your text here.', body_am: '', align: 'left' }
  },
  image_text: {
    name: 'Image and text', about: 'A photo next to a heading, text and an optional button.',
    fields: [L('title', 'Heading'), L('body', 'Text', 'textarea', 4000), { k: 'image', label: 'Image', type: 'image' }, L('image_alt', 'Image description for Google'),
      { k: 'side', label: 'Image position', type: 'select', options: ['left', 'right'], def: 'right' }, L('btn_label', 'Button text'), { k: 'btn_url', label: 'Button link', type: 'url' }],
    sample: { title_en: 'Your heading', title_am: '', body_en: 'Write your text here.', body_am: '', image: '', side: 'right' }
  },
  cards: {
    name: 'Cards', about: 'A row of up to 6 cards, each with a title, text and optional link.',
    fields: [L('title', 'Heading'), L('intro', 'Short intro', 'textarea', 400)].concat(cardFields('c', 6)),
    sample: { title_en: 'What we offer', title_am: '', c1_title_en: 'First card', c1_body_en: 'Short text.', c2_title_en: 'Second card', c2_body_en: 'Short text.', c3_title_en: 'Third card', c3_body_en: 'Short text.' }
  },
  cta: {
    name: 'Call to action banner', about: 'A coloured banner with a message and one button.',
    fields: [L('title', 'Heading'), L('body', 'Text', 'textarea', 400), L('btn_label', 'Button text'), { k: 'btn_url', label: 'Button link', type: 'url' },
      { k: 'style', label: 'Colour', type: 'select', options: ['peach', 'dark', 'orange'], def: 'peach' }],
    sample: { title_en: 'Ready to start?', title_am: '', body_en: 'Tell us about your project.', body_am: '', btn_label_en: 'Contact us', btn_label_am: '', btn_url: '/#contact', style: 'peach' }
  },
  faq: {
    name: 'Questions and answers', about: 'A list of up to 8 common questions with answers.',
    fields: [L('title', 'Heading')].concat(faqFields(8)),
    sample: { title_en: 'Frequently asked questions', title_am: '', q1_en: 'Your first question?', a1_en: 'Your answer.', q2_en: 'Your second question?', a2_en: 'Your answer.' }
  }
};

function allFieldNames(kind) {
  const names = [];
  (KINDS[kind] ? KINDS[kind].fields : []).forEach(f => { if (f.lang) names.push(f.k + '_en', f.k + '_am'); else names.push(f.k); });
  return names;
}

// Turns the admin form into a safe config object.
function cleanConfig(kind, body, previous) {
  const def = KINDS[kind];
  const out = {};
  if (!def) return out;
  def.fields.forEach(f => {
    const names = f.lang ? [f.k + '_en', f.k + '_am'] : [f.k];
    names.forEach(n => {
      const raw = body[n];
      if (f.type === 'image') { out[n] = (previous && previous[n]) || ''; return; } // set by upload only
      if (raw === undefined) { out[n] = (previous && previous[n]) || ''; return; }
      let v = String(raw).trim();
      if (f.type === 'url') v = v ? cleanUrl(v) : '';
      else if (f.type === 'select') v = (f.options || []).includes(v) ? v : (f.def || f.options[0]);
      else v = v.slice(0, f.max || 160);
      out[n] = v;
    });
  });
  return out;
}

// ---------- links (same rules as the menu) ----------
function resolveHref(u, lang) {
  const v = String(u || '');
  const prefix = lang === 'am' ? '/am' : '';
  if (!v) return '';
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  if (v === '/') return lang === 'am' ? '/am' : '/';
  if (v.indexOf('/#') === 0) return (lang === 'am' ? '/am' : '/') + v.slice(1);
  return prefix + v;
}
// Adds `<key>_href` next to every link field so the templates print ready-made addresses.
function decorate(sections, lang) {
  return sections.map(s => {
    const config = { ...(s.config || {}) };
    Object.keys(config).forEach(k => { if (/(^|_)url$/.test(k)) config[k + '_href'] = resolveHref(config[k], lang); });
    return { ...s, config, anchor: s.kind in BUILTIN ? BUILTIN[s.kind].anchor : 's-' + s.id };
  });
}

// ---------- sections ----------
async function listSections(slug) {
  const { data, error } = await getClient().from('page_sections').select('*').eq('page_slug', slug).order('order_num', { ascending: true });
  if (error) throw error;
  return (data || []).map(r => ({ ...r, config: r.config || {} }));
}

function defaultHome() {
  return HOME_ORDER.map((kind, i) => ({ id: 'b-' + kind, page_slug: 'home', kind, config: {}, visible: true, order_num: i + 1 }));
}

// What visitors see. The home page falls back to the built-in order.
async function publicSections(slug) {
  try {
    const rows = await listSections(slug);
    if (!rows.length) return slug === 'home' ? defaultHome() : [];
    return rows.filter(r => r.visible && (BUILTIN[r.kind] || KINDS[r.kind]));
  } catch (e) {
    return slug === 'home' ? defaultHome() : [];
  }
}

// First time the admin opens the home page builder: store the built-in order.
async function ensureHome() {
  const rows = await listSections('home');
  if (rows.length) return rows;
  const { error } = await getClient().from('page_sections').insert(defaultHome().map(({ id, ...r }) => r));
  if (error) throw error;
  return listSections('home');
}

// The address a menu link needs to point to in order to mean this section.
function anchorOf(row) {
  if (BUILTIN[row.kind]) return BUILTIN[row.kind].anchor || '';
  return 's-' + row.id;
}

// Menu order -> home page order. Only the sections that the main menu links to (for example
// "/#services") are rearranged, and they are rearranged among the places they already
// occupy: the hero, the strip and any section the menu does not mention stay where they are.
async function syncHomeFromMenu(links) {
  const rows = await ensureHome();
  const byAnchor = {};
  rows.forEach(r => { const a = anchorOf(r); if (a && !byAnchor[a]) byAnchor[a] = r; });
  const linked = [], seen = new Set();
  links.forEach(l => {
    const m = /^\/#([A-Za-z0-9_-]+)$/.exec(String(l.url || ''));
    const row = m && byAnchor[m[1]];
    if (row && !seen.has(row.id)) { seen.add(row.id); linked.push(row); }
  });
  if (linked.length < 2) return { changed: 0, linked: linked.length };
  const slots = [];
  rows.forEach((r, i) => { if (seen.has(r.id)) slots.push(i); });
  const next = rows.slice();
  slots.forEach((pos, k) => { next[pos] = linked[k]; });
  let changed = 0;
  await Promise.all(next.map((r, i) => {
    if (r.order_num === i + 1) return null;
    changed++;
    return getClient().from('page_sections').update({ order_num: i + 1 }).eq('id', r.id);
  }));
  return { changed, linked: linked.length };
}

async function addSection(slug, kind, config) {
  if (!BUILTIN[kind] && !KINDS[kind]) throw new Error('unknown section type');
  const existing = await listSections(slug);
  const { data, error } = await getClient().from('page_sections').insert([{
    page_slug: slug, kind, config: config || (KINDS[kind] ? KINDS[kind].sample : {}), visible: true, order_num: existing.length + 1
  }]).select().single();
  if (error) throw error;
  return data.id;
}
async function getSection(id) {
  const { data, error } = await getClient().from('page_sections').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, config: data.config || {} } : null;
}
async function updateSection(id, patch) {
  const { error } = await getClient().from('page_sections').update(patch).eq('id', id);
  if (error) throw error;
}
async function deleteSection(id) {
  const { error } = await getClient().from('page_sections').delete().eq('id', id);
  if (error) throw error;
}
async function reorderSections(ids) {
  await Promise.all(ids.map((id, i) => getClient().from('page_sections').update({ order_num: i + 1 }).eq('id', id)));
}

// ---------- pages you create ----------
async function listPages() {
  const { data, error } = await getClient().from('pages').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
async function listPagesSafe() { try { return await listPages(); } catch (e) { return []; } }
async function getPage(slug) {
  const { data, error } = await getClient().from('pages').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}
function pageRow(f) {
  const cut = (k, n) => String(f[k] || '').trim().slice(0, n);
  return { title_en: cut('title_en', 120) || 'New page', title_am: cut('title_am', 120), seo_title_en: cut('seo_title_en', 120), seo_title_am: cut('seo_title_am', 120), seo_desc_en: cut('seo_desc_en', 320), seo_desc_am: cut('seo_desc_am', 320) };
}
const RESERVED = ['home', 'products', 'services', 'call', 'am', 'admin', 'checkout', 'download', 'chapa', 'p', 'sitemap', 'robots'];
async function createPage(f) {
  const row = pageRow(f);
  let slug = slugify(f.slug) || slugify(row.title_en) || 'page';
  if (RESERVED.includes(slug)) slug += '-page';
  const existing = await listPages();
  if (existing.some(p => p.slug === slug)) slug = `${slug}-${existing.length + 1}`;
  const { error } = await getClient().from('pages').insert([{ ...row, slug, active: true }]);
  if (error) throw error;
  return slug;
}
async function updatePage(slug, f) {
  const { error } = await getClient().from('pages').update({ ...pageRow(f), active: !!f.active }).eq('slug', slug);
  if (error) throw error;
}
async function deletePage(slug) {
  await getClient().from('page_sections').delete().eq('page_slug', slug);
  const { error } = await getClient().from('pages').delete().eq('slug', slug);
  if (error) throw error;
}

module.exports = {
  BUILTIN, KINDS, HOME_ORDER, RESERVED, allFieldNames, cleanConfig, resolveHref, decorate,
  listSections, publicSections, ensureHome, syncHomeFromMenu, anchorOf, addSection, getSection, updateSection, deleteSection, reorderSections,
  listPages, listPagesSafe, getPage, createPage, updatePage, deletePage
};
