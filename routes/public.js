const express = require('express');
const store = require('../lib/store');
const seo = require('../lib/seo');
const { CATEGORIES, category } = require('../lib/catalog');
const { render } = require('../lib/render');

// Helpers ---------------------------------------------------------------

function pick(obj, lang) { return lang === 'am' && obj.am ? obj.am : obj.en; }
function titleOf(row, lang) { return (lang === 'am' && row.title_am) ? row.title_am : row.title_en; }
function descOf(row, lang) { return (lang === 'am' && row.desc_am) ? row.desc_am : row.desc_en; }

// Adds the readable category names the product cards print.
function decorate(products) {
  return products.map(p => { const c = category(p.category); return { ...p, cat_en: c.en, cat_am: c.am }; });
}

function withSlugs(services) {
  return services.map(s => ({ ...s, slug: seo.slugify(s.title_en) || String(s.id) }));
}

// Variables every public page needs (language, links, both language URLs).
function pageContext(req, lang, path) {
  return {
    lang,
    prefix: lang === 'am' ? '/am' : '',
    home: lang === 'am' ? '/am' : '/',
    enUrl: path,
    amUrl: '/am' + (path === '/' ? '' : path),
    base: seo.baseUrl(req)
  };
}

async function notFound(req, res, lang, content) {
  const ctx = pageContext(req, lang, '/');
  let services = [];
  try { services = withSlugs(await store.listServices({ activeOnly: true })); } catch (e) { services = []; }
  res.status(404).send(render('notfound', {
    ...ctx, content, services,
    seo: seo.seoFor({ req, lang, path: '/', title: 'Page not found', description: 'This page does not exist.', noindex: true })
  }));
}

// One router per language: '/' (English) and '/am' (Amharic) share the same code.
function languageRouter(lang) {
  const router = express.Router();
  const isAm = lang === 'am';

  // ---------- Home ----------
  router.get('/', async (req, res, next) => {
    try {
      const [content, services, aboutFeatures, whyUs, process, gallery, products] = await Promise.all([
        store.getContent(),
        store.listServices({ activeOnly: true }),
        store.listBlocks('about_features'),
        store.listBlocks('why_us'),
        store.listBlocks('process'),
        store.listGallery(),
        store.listProductsSafe({ activeOnly: true })
      ]);
      const ctx = pageContext(req, lang, '/');
      const name = pick(content.company_name, lang);
      const title = pick(content.seo_title, lang) ||
        (isAm ? `${name} — የመጠን ዝርዝር (BOQ)፣ የወጪ ግምት እና የጨረታ ዝግጅት | አዲስ አበባ`
              : `BOQ & Cost Estimation in Addis Ababa | ${name}`);
      const description = pick(content.seo_description, lang) ||
        (isAm ? `${name} በአዲስ አበባ — የመጠን ዝርዝር (BOQ) ዝግጅት፣ መጠን ማውጣት፣ የወጪ ግምት፣ የጨረታ ዝግጅት እና የተቋራጭ ክፍያ ሂደት። የBOQ እና የወጪ ትንተና ቅጾችን ያውርዱ።`
              : `Construction company in Addis Ababa: BOQ preparation, quantity take-off, cost estimation and bid preparation. Download BOQ and cost breakdown templates.`);
      const page = seo.seoFor({
        req, lang, path: '/', title, description,
        image: content.about_image && content.about_image.en,
        ld: [seo.organizationLd(ctx.base, content, lang, services), seo.websiteLd(ctx.base, content)]
      });
      res.set('Cache-Control', 'public, max-age=120');
      res.send(render('index', {
        ...ctx, content, services: withSlugs(services), aboutFeatures, whyUs, process, gallery,
        products: decorate(products.slice(0, 6)), categories: CATEGORIES, seo: page
      }));
    } catch (err) { next(err); }
  });

  // ---------- Products list ----------
  router.get('/products', async (req, res, next) => {
    try {
      const [content, products, services] = await Promise.all([
        store.getContent(), store.listProductsSafe({ activeOnly: true }), store.listServices({ activeOnly: true })
      ]);
      const ctx = pageContext(req, lang, '/products');
      const name = pick(content.company_name, lang);
      const title = isAm ? `የBOQ፣ የወጪ ትንተና እና ስምምነት ቅጾች ያውርዱ | ${name}`
                         : `Download BOQ, Cost Breakdown & Agreement Templates | ${name}`;
      const description = isAm
        ? 'ለኢትዮጵያ ግንባታ የተዘጋጁ የExcel የመጠን ዝርዝር (BOQ)፣ የወጪ ትንተና ሉሆች እና የWord የግንባታ ስምምነቶች። ከከፈሉ በኋላ ወዲያውኑ ያውርዱ።'
        : 'Excel BOQ templates, cost breakdown and unit rate sheets, and editable Word construction agreements made for Ethiopian projects. Pay securely with Chapa and download instantly.';
      const groups = CATEGORIES
        .map(c => ({ ...c, items: decorate(products.filter(p => category(p.category).key === c.key)) }))
        .filter(g => g.items.length);
      const crumbs = [
        { name, url: seo.localizedUrl(ctx.base, lang, '/') },
        { name: isAm ? 'የሰነድ ቅጾች' : 'Templates', url: seo.localizedUrl(ctx.base, lang, '/products') }
      ];
      const page = seo.seoFor({
        req, lang, path: '/products', title, description,
        ld: [
          seo.breadcrumbLd(crumbs),
          {
            '@type': 'ItemList',
            itemListElement: products.map((p, i) => ({
              '@type': 'ListItem', position: i + 1,
              url: seo.localizedUrl(ctx.base, lang, '/products/' + p.slug), name: titleOf(p, lang)
            }))
          }
        ]
      });
      res.set('Cache-Control', 'public, max-age=120');
      res.send(render('products', { ...ctx, content, services: withSlugs(services), groups, hasProducts: products.length > 0, categories: CATEGORIES, seo: page }));
    } catch (err) { next(err); }
  });

  // ---------- Single product ----------
  router.get('/products/:slug', async (req, res, next) => {
    try {
      const [content, services] = await Promise.all([store.getContent(), store.listServices({ activeOnly: true })]);
      let product = null;
      try { product = await store.getProductBySlug(req.params.slug); } catch (e) { product = null; }
      if (!product || !product.active) return notFound(req, res, lang, content);

      const ctx = pageContext(req, lang, '/products/' + product.slug);
      const name = pick(content.company_name, lang);
      const ptitle = titleOf(product, lang);
      const pdesc = descOf(product, lang);
      const cat = category(product.category);
      const related = decorate((await store.listProductsSafe({ activeOnly: true })).filter(p => p.id !== product.id).slice(0, 3));
      const crumbs = [
        { name, url: seo.localizedUrl(ctx.base, lang, '/') },
        { name: isAm ? 'የሰነድ ቅጾች' : 'Templates', url: seo.localizedUrl(ctx.base, lang, '/products') },
        { name: ptitle, url: seo.localizedUrl(ctx.base, lang, '/products/' + product.slug) }
      ];
      const page = seo.seoFor({
        req, lang, path: '/products/' + product.slug,
        title: `${ptitle} — ${isAm ? 'ያውርዱ' : 'Download'} | ${name}`,
        description: pdesc || (isAm ? cat.blurb_am : cat.blurb_en),
        image: product.image, type: 'product',
        ld: [seo.productLd(ctx.base, lang, product, ptitle, pdesc), seo.breadcrumbLd(crumbs)]
      });
      res.set('Cache-Control', 'public, max-age=120');
      res.send(render('product', { ...ctx, content, services: withSlugs(services), product, cat, related, seo: page }));
    } catch (err) { next(err); }
  });

  // ---------- Single service (own landing page) ----------
  router.get('/services/:slug', async (req, res, next) => {
    try {
      const [content, services, process, whyUs, products] = await Promise.all([
        store.getContent(),
        store.listServices({ activeOnly: true }),
        store.listBlocks('process'),
        store.listBlocks('why_us'),
        store.listProductsSafe({ activeOnly: true })
      ]);
      const list = withSlugs(services);
      let service = list.find(s => s.slug === req.params.slug);
      // /services/3 -> redirect to the readable address
      if (!service && /^\d+$/.test(req.params.slug)) {
        const byId = list.find(s => String(s.id) === req.params.slug);
        if (byId) return res.redirect(301, (isAm ? '/am' : '') + '/services/' + byId.slug);
      }
      if (!service) return notFound(req, res, lang, content);

      const ctx = pageContext(req, lang, '/services/' + service.slug);
      const name = pick(content.company_name, lang);
      const stitle = titleOf(service, lang);
      const sdesc = descOf(service, lang);
      const crumbs = [
        { name, url: seo.localizedUrl(ctx.base, lang, '/') },
        { name: isAm ? 'አገልግሎቶች' : 'Services', url: seo.localizedUrl(ctx.base, lang, '/') + (lang === 'am' ? '#services' : '#services') },
        { name: stitle, url: seo.localizedUrl(ctx.base, lang, '/services/' + service.slug) }
      ];
      const page = seo.seoFor({
        req, lang, path: '/services/' + service.slug,
        title: isAm ? `${stitle} በአዲስ አበባ | ${name}` : `${stitle} in Addis Ababa | ${name}`,
        description: sdesc,
        ld: [seo.serviceLd(ctx.base, lang, service, stitle, sdesc), seo.breadcrumbLd(crumbs)]
      });
      res.set('Cache-Control', 'public, max-age=120');
      res.send(render('service', { ...ctx, content, services: list, service, process, whyUs, products: decorate(products.slice(0, 3)), seo: page }));
    } catch (err) { next(err); }
  });

  return router;
}

// ---------- Robots + sitemap (shared, not per language) ----------

const root = express.Router();

root.get('/robots.txt', (req, res) => {
  const base = seo.baseUrl(req);
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /checkout',
    'Disallow: /download',
    'Disallow: /chapa',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    ''
  ].join('\n'));
});

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

root.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = seo.baseUrl(req);
    const [services, products] = await Promise.all([
      store.listServices({ activeOnly: true }),
      store.listProductsSafe({ activeOnly: true })
    ]);
    const pages = [
      { path: '/', priority: '1.0', freq: 'weekly' },
      { path: '/products', priority: '0.9', freq: 'weekly' },
      ...withSlugs(services).map(s => ({ path: '/services/' + s.slug, priority: '0.8', freq: 'monthly' })),
      ...products.map(p => ({ path: '/products/' + p.slug, priority: '0.8', freq: 'monthly', lastmod: p.created_at }))
    ];
    const urlEntry = (lang, p) => {
      const alts = seo.alternates(base, p.path)
        .map(a => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${xmlEscape(a.href)}"/>`).join('\n');
      const lastmod = p.lastmod ? `\n    <lastmod>${new Date(p.lastmod).toISOString().slice(0, 10)}</lastmod>` : '';
      return `  <url>\n    <loc>${xmlEscape(seo.localizedUrl(base, lang, p.path))}</loc>${lastmod}\n    <changefreq>${p.freq}</changefreq>\n    <priority>${p.priority}</priority>\n${alts}\n  </url>`;
    };
    const body = pages.flatMap(p => [urlEntry('en', p), urlEntry('am', p)]).join('\n');
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`
    );
  } catch (err) { next(err); }
});

root.use('/am', languageRouter('am'));
root.use('/', languageRouter('en'));

module.exports = root;
module.exports.notFound = notFound;
