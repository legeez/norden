// Everything search-engine related lives here: canonical URLs, hreflang
// alternates, Open Graph data and schema.org JSON-LD. Templates only print
// what this file builds, so SEO rules are in one place.
const ASSET_VERSION = '2026-10-15';

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

// The public address of the site. Set SITE_URL (e.g. https://www.nordentrading.com)
// once you have your real domain; until then the address the visitor used is
// reused, always as https unless it is localhost.
function baseUrl(req) {
  const env = process.env.SITE_URL || process.env.APP_BASE_URL;
  if (env && !/localhost|127\.0\.0\.1/i.test(env)) return env.replace(/\/+$/, '');
  const host = req.get('host') || 'localhost';
  const local = /^(localhost|127\.0\.0\.1)/i.test(host);
  return `${local ? req.protocol : 'https'}://${host}`;
}

// path is always the English path ('/', '/products', '/products/some-slug').
function localizedUrl(base, lang, path) {
  if (lang === 'am') return base + '/am' + (path === '/' ? '' : path);
  return base + path;
}

function alternates(base, path) {
  return [
    { hreflang: 'en', href: localizedUrl(base, 'en', path) },
    { hreflang: 'am', href: localizedUrl(base, 'am', path) },
    { hreflang: 'x-default', href: localizedUrl(base, 'en', path) }
  ];
}

function clip(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 25)).replace(/[,;:.\-–—\s]+$/, '') + '…';
}

// Titles are cut at a word boundary with no trailing ellipsis.
function clipTitle(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[|,;:.\-–—\s]+$/, '');
}

// Keeps JSON-LD safe inside a <script> tag.
function ldString(objects) {
  const list = objects.filter(Boolean);
  if (!list.length) return '';
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': list })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function seoFor({ req, lang, path, title, description, image, type, noindex, ld }) {
  const base = baseUrl(req);
  const img = image
    ? (/^https?:/i.test(image) ? image : base + image)
    : base + '/images/og-default.png';
  return {
    title: clipTitle(title, 70),
    description: clip(description, 160),
    canonical: localizedUrl(base, lang, path),
    alternates: noindex ? [] : alternates(base, path),
    image: img,
    ogType: type || 'website',
    locale: lang === 'am' ? 'am_ET' : 'en_US',
    noindex: !!noindex,
    assetVersion: ASSET_VERSION,
    jsonld: ldString(ld || [])
  };
}

// ---------- schema.org builders ----------

function organizationLd(base, content, lang, services) {
  const name = content.company_name ? content.company_name.en : 'Norden Trading Plc';
  const phone = (content.contact_phone && content.contact_phone.en) || '';
  const email = (content.contact_email && content.contact_email.en) || '';
  const office = (content.contact_office && content.contact_office.en) || '';
  const ld = {
    '@type': ['GeneralContractor', 'ProfessionalService'],
    '@id': base + '/#business',
    name,
    url: base + '/',
    image: base + '/images/og-default.png',
    description: 'Construction company in Addis Ababa offering BOQ preparation, quantity take-off, cost estimation, bid preparation and contractor payment processing.',
    address: {
      '@type': 'PostalAddress',
      streetAddress: office,
      addressLocality: 'Addis Ababa',
      addressCountry: 'ET'
    },
    areaServed: [{ '@type': 'City', name: 'Addis Ababa' }, { '@type': 'Country', name: 'Ethiopia' }],
    knowsAbout: ['Bill of Quantities', 'Quantity take-off', 'Construction cost estimation', 'Tender preparation', 'Contractor payment certificates'],
    availableLanguage: ['English', 'Amharic']
  };
  if (/\d{6,}/.test(phone.replace(/\D/g, '')) && phone.replace(/\D/g, '').length >= 6) ld.telephone = phone;
  if (/@/.test(email)) ld.email = email;
  if (services && services.length) {
    ld.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Professional services',
      itemListElement: services.map(s => ({
        '@type': 'Offer',
        url: localizedUrl(base, 'en', '/services/' + slugify(s.title_en)),
        priceCurrency: s.currency || 'ETB',
        price: String(s.price),
        itemOffered: { '@type': 'Service', name: s.title_en, description: clip(s.desc_en, 200) }
      }))
    };
  }
  return ld;
}

function websiteLd(base, content) {
  return {
    '@type': 'WebSite',
    '@id': base + '/#website',
    url: base + '/',
    name: content.company_name ? content.company_name.en : 'Norden Trading Plc',
    inLanguage: ['en', 'am'],
    publisher: { '@id': base + '/#business' }
  };
}

function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: it.url
    }))
  };
}

function productLd(base, lang, p, name, description) {
  return {
    '@type': 'Product',
    name,
    description: clip(description, 300),
    sku: 'NT-' + p.id,
    category: p.category,
    image: p.image || base + '/images/og-default.png',
    brand: { '@type': 'Brand', name: 'Norden Trading Plc' },
    offers: {
      '@type': 'Offer',
      url: localizedUrl(base, lang, '/products/' + p.slug),
      priceCurrency: p.currency || 'ETB',
      price: String(p.price),
      availability: 'https://schema.org/InStock',
      seller: { '@id': base + '/#business' }
    }
  };
}

function serviceLd(base, lang, s, name, description) {
  return {
    '@type': 'Service',
    name,
    description: clip(description, 300),
    provider: { '@id': base + '/#business' },
    areaServed: { '@type': 'City', name: 'Addis Ababa' },
    offers: {
      '@type': 'Offer',
      priceCurrency: s.currency || 'ETB',
      price: String(s.price),
      url: localizedUrl(base, lang, '/services/' + slugify(s.title_en))
    }
  };
}

module.exports = {
  slugify, baseUrl, localizedUrl, alternates, clip, seoFor,
  organizationLd, websiteLd, breadcrumbLd, productLd, serviceLd
};
