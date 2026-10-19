const express = require('express');
const router = express.Router();
const multer = require('multer');
const store = require('../lib/store');
const { uploadImage } = require('../lib/upload');
const files = require('../lib/files');
const seo = require('../lib/seo');
const { CATEGORIES } = require('../lib/catalog');
const { requireAdmin } = require('../lib/auth');
const { render } = require('../lib/render');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Only image files are allowed.'));
    }
    cb(null, true);
  }
});

// Product forms carry a cover image AND a downloadable file (Excel/Word/PDF).
const productUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'image_file') {
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) return cb(new Error('Cover image must be PNG, JPG, WEBP or GIF.'));
    }
    // product_file is checked in the route handler (see checkProductFile) so the
    // message can say exactly what the server received.
    cb(null, true);
  }
}).fields([{ name: 'image_file', maxCount: 1 }, { name: 'product_file', maxCount: 1 }]);

// ---------- Login ----------
router.get('/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.send(render('admin/login', { error: null }));
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.send(render('admin/login', { error: 'Incorrect password.' }));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.use(requireAdmin); // everything below requires login

// ---------- Dashboard ----------
router.get('/', async (req, res, next) => {
  try {
    const stats = await store.getStats();
    res.send(render('admin/dashboard', stats));
  } catch (err) { next(err); }
});

// ---------- Site content (text + images) ----------
router.get('/content', async (req, res, next) => {
  try {
    const content = await store.getContent();
    res.send(render('admin/content', { content, saved: req.query.saved === '1' }));
  } catch (err) { next(err); }
});

router.post('/content', upload.single('about_image_file'), async (req, res, next) => {
  try {
    const content = await store.getContent();
    const updates = {};
    Object.keys(content).forEach(key => {
      if (key === 'about_image') return; // handled via file upload below
      const en = req.body[`${key}_en`];
      const am = req.body[`${key}_am`];
      updates[key] = { en: en !== undefined ? en : content[key].en, am: am !== undefined ? am : content[key].am };
    });
    ['seo_title', 'seo_description'].forEach(key => {
      updates[key] = { en: (req.body[`${key}_en`] || '').trim(), am: (req.body[`${key}_am`] || '').trim() };
    });
    if (req.file) {
      const url = await uploadImage(req.file, 'content');
      updates.about_image = { en: url, am: url };
    }
    await store.updateContent(updates);
    res.redirect('/admin/content?saved=1');
  } catch (err) { next(err); }
});

// ---------- Services (with prices used at checkout) ----------
router.get('/services', async (req, res, next) => {
  try {
    const services = await store.listServices();
    res.send(render('admin/services', { services }));
  } catch (err) { next(err); }
});

router.post('/services', upload.single('image_file'), async (req, res, next) => {
  try {
    const { title_en, title_am, desc_en, desc_am, price, currency } = req.body;
    const image = req.file ? await uploadImage(req.file, 'services') : '';
    await store.createService({ title_en, title_am, desc_en, desc_am, price: Number(price) || 0, currency, image });
    res.redirect('/admin/services');
  } catch (err) { next(err); }
});

router.post('/services/:id/update', upload.single('image_file'), async (req, res, next) => {
  try {
    const { title_en, title_am, desc_en, desc_am, price, currency, order } = req.body;
    const fields = {
      title_en, title_am, desc_en, desc_am,
      price: Number(price) || 0,
      currency: currency || 'ETB',
      order: Number(order) || undefined,
      active: req.body.active === 'on'
    };
    if (req.file) fields.image = await uploadImage(req.file, 'services');
    await store.updateService(Number(req.params.id), fields);
    res.redirect('/admin/services');
  } catch (err) { next(err); }
});

router.post('/services/:id/delete', async (req, res, next) => {
  try {
    await store.deleteService(Number(req.params.id));
    res.redirect('/admin/services');
  } catch (err) { next(err); }
});

// ---------- Repeatable content blocks (about features / why-us / process) ----------
const ALLOWED_SECTIONS = ['about_features', 'why_us', 'process'];

router.get('/blocks/:section', async (req, res, next) => {
  try {
    const { section } = req.params;
    if (!ALLOWED_SECTIONS.includes(section)) return res.status(404).send('Unknown section');
    const items = await store.listBlocks(section);
    res.send(render('admin/blocks', { section, items }));
  } catch (err) { next(err); }
});

router.post('/blocks/:section', async (req, res, next) => {
  try {
    const { section } = req.params;
    if (!ALLOWED_SECTIONS.includes(section)) return res.status(404).send('Unknown section');
    const { title_en, title_am, body_en, body_am } = req.body;
    await store.createBlock(section, { title_en, title_am, body_en, body_am });
    res.redirect(`/admin/blocks/${section}`);
  } catch (err) { next(err); }
});

router.post('/blocks/:section/:id/update', async (req, res, next) => {
  try {
    const { section, id } = req.params;
    if (!ALLOWED_SECTIONS.includes(section)) return res.status(404).send('Unknown section');
    const { title_en, title_am, body_en, body_am, order } = req.body;
    await store.updateBlock(section, Number(id), { title_en, title_am, body_en, body_am, order: Number(order) || undefined });
    res.redirect(`/admin/blocks/${section}`);
  } catch (err) { next(err); }
});

router.post('/blocks/:section/:id/delete', async (req, res, next) => {
  try {
    const { section, id } = req.params;
    if (!ALLOWED_SECTIONS.includes(section)) return res.status(404).send('Unknown section');
    await store.deleteBlock(section, Number(id));
    res.redirect(`/admin/blocks/${section}`);
  } catch (err) { next(err); }
});

// ---------- Project gallery ----------
router.get('/gallery', async (req, res, next) => {
  try {
    const items = await store.listGallery();
    res.send(render('admin/gallery', { items }));
  } catch (err) { next(err); }
});

router.post('/gallery', upload.single('image_file'), async (req, res, next) => {
  try {
    if (!req.file) return res.redirect('/admin/gallery');
    const image = await uploadImage(req.file, 'gallery');
    await store.addGalleryItem({ image, caption_en: req.body.caption_en, caption_am: req.body.caption_am });
    res.redirect('/admin/gallery');
  } catch (err) { next(err); }
});

router.post('/gallery/:id/delete', async (req, res, next) => {
  try {
    await store.deleteGalleryItem(Number(req.params.id));
    res.redirect('/admin/gallery');
  } catch (err) { next(err); }
});

// ---------- Products (downloadable files sold through Chapa) ----------
function checkProductFile(f) {
  if (!f) return '';
  if (files.isAllowedUpload(f)) return '';
  return `That file type is not allowed. Use Excel, Word, PDF or ZIP. (Received name: "${f.originalname || 'none'}", type: "${f.mimetype || 'none'}")`;
}

function productFields(body) {
  return {
    category: CATEGORIES.some(c => c.key === body.category) ? body.category : 'other',
    title_en: (body.title_en || '').trim(), title_am: (body.title_am || '').trim(),
    desc_en: (body.desc_en || '').trim(), desc_am: (body.desc_am || '').trim(),
    price: Number(body.price) || 0,
    currency: (body.currency || 'ETB').trim() || 'ETB'
  };
}

router.get('/products', async (req, res, next) => {
  try {
    let products = [];
    let setupNeeded = false;
    try { products = await store.listProducts(); } catch (e) { setupNeeded = true; }
    res.send(render('admin/products', { products, categories: CATEGORIES, setupNeeded, error: req.query.error || '', saved: req.query.saved === '1' }));
  } catch (err) { next(err); }
});

router.post('/products', (req, res, next) => {
  productUpload(req, res, async (uploadErr) => {
    try {
      if (uploadErr) return res.redirect('/admin/products?error=' + encodeURIComponent(uploadErr.message));
      const f = productFields(req.body);
      if (!f.title_en) return res.redirect('/admin/products?error=' + encodeURIComponent('Please enter an English title.'));
      const upFile = req.files && req.files.product_file && req.files.product_file[0];
      if (!upFile) return res.redirect('/admin/products?error=' + encodeURIComponent('Please choose the file customers will download.'));
      const badFile = checkProductFile(upFile);
      if (badFile) return res.redirect('/admin/products?error=' + encodeURIComponent(badFile));
      const upImage = req.files && req.files.image_file && req.files.image_file[0];

      // Slug = the readable web address, e.g. /products/building-boq-template
      let slug = seo.slugify(req.body.slug) || seo.slugify(f.title_en) || 'product';
      const existing = await store.listProducts();
      if (existing.some(p => p.slug === slug)) slug = `${slug}-${existing.length + 1}`;

      const stored = await files.uploadProductFile(upFile);
      const image = upImage ? await uploadImage(upImage, 'products') : '';
      await store.createProduct({ ...f, slug, ...stored, image });
      res.redirect('/admin/products?saved=1');
    } catch (err) { next(err); }
  });
});

router.post('/products/:id/update', (req, res, next) => {
  productUpload(req, res, async (uploadErr) => {
    try {
      if (uploadErr) return res.redirect('/admin/products?error=' + encodeURIComponent(uploadErr.message));
      const id = Number(req.params.id);
      const current = await store.getProduct(id);
      if (!current) return res.redirect('/admin/products');
      const fields = {
        ...productFields(req.body),
        slug: seo.slugify(req.body.slug) || current.slug,
        order: Number(req.body.order) || undefined,
        active: req.body.active === 'on'
      };
      const upFile = req.files && req.files.product_file && req.files.product_file[0];
      const upImage = req.files && req.files.image_file && req.files.image_file[0];
      const badFile = checkProductFile(upFile);
      if (badFile) return res.redirect('/admin/products?error=' + encodeURIComponent(badFile));
      if (upFile) {
        Object.assign(fields, await files.uploadProductFile(upFile));
        await files.removeProductFile(current.file_path); // replace, don't pile up old versions
      }
      if (upImage) fields.image = await uploadImage(upImage, 'products');
      await store.updateProduct(id, fields);
      res.redirect('/admin/products?saved=1');
    } catch (err) { next(err); }
  });
});

router.post('/products/:id/delete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = await store.getProduct(id);
    await store.deleteProduct(id);
    if (current) await files.removeProductFile(current.file_path);
    res.redirect('/admin/products');
  } catch (err) { next(err); }
});

// ---------- Orders (from Chapa checkout) ----------
router.get('/orders', async (req, res, next) => {
  try {
    const orders = await store.listOrders();
    res.send(render('admin/orders', { orders }));
  } catch (err) { next(err); }
});

module.exports = router;
