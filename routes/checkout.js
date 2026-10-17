const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const store = require('../lib/store');
const chapa = require('../lib/chapa');
const files = require('../lib/files');
const { render } = require('../lib/render');

const MAX_DOWNLOADS = 10; // per paid order — stops a shared link being used forever

function baseUrl(req) {
  const env = process.env.APP_BASE_URL;
  if (env && !/localhost|127\.0\.0\.1/i.test(env)) return env.replace(/\/+$/, '');
  const host = req.get('host');
  const local = /^(localhost|127\.0\.0\.1)/i.test(host || '');
  return `${local ? req.protocol : 'https'}://${host}`;
}

// Checkout pages must never appear in search results.
router.use(['/checkout', '/download', '/chapa'], (req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  next();
});

function failed(res, message, order, status) {
  return res.status(status || 200).send(render('checkout/failed', { message, order }));
}

// Shape a service or a product so the same checkout form works for both.
function asItem(kind, row) {
  return {
    id: row.id, kind,
    title_en: row.title_en, desc_en: row.desc_en,
    price: row.price, currency: row.currency || 'ETB',
    file_type: kind === 'product' ? row.file_type : '',
    action: kind === 'product' ? `/checkout/product/${row.id}` : `/checkout/${row.id}`,
    back: kind === 'product' ? `/products/${row.slug}` : '/#services'
  };
}

async function showForm(res, kind, row, error) {
  return res.send(render('checkout/form', { service: asItem(kind, row), error }));
}

async function startPayment(req, res, kind, row) {
  const { name, email, phone } = req.body;
  if (!name || !email || !phone) return showForm(res, kind, row, 'Please fill in all fields.');
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return showForm(res, kind, row, 'Please enter a valid email address.');

  const txRef = `norden-${kind === 'product' ? 'p' : ''}${row.id}-${uuidv4()}`;
  const downloadToken = kind === 'product' ? uuidv4() : undefined;
  const [firstName, ...rest] = name.trim().split(' ');
  const lastName = rest.join(' ') || firstName;

  await store.createOrder({
    service_id: kind === 'service' ? row.id : null,
    item_type: kind,
    product_id: kind === 'product' ? row.id : undefined,
    download_token: downloadToken,
    service_title: row.title_en,
    customer_name: name,
    customer_email: email.trim(),
    customer_phone: phone,
    amount: row.price,
    currency: row.currency || 'ETB',
    tx_ref: txRef,
    status: 'pending'
  });

  try {
    const result = await chapa.initialize({
      amount: row.price,
      currency: row.currency || 'ETB',
      email: email.trim(),
      firstName,
      lastName,
      txRef,
      callbackUrl: `${baseUrl(req)}/chapa/webhook`,
      returnUrl: `${baseUrl(req)}/checkout/return?tx_ref=${txRef}`,
      title: 'Norden Trading',
      description: row.title_en
    });
    if (result.status === 'success' && result.data && result.data.checkout_url) {
      return res.redirect(result.data.checkout_url);
    }
    return failed(res, result.message || 'Could not start payment. Please try again.');
  } catch (err) {
    console.error('Chapa initialize error:', err.response ? err.response.data : err.message);
    const hint = /CHAPA_SECRET_KEY/.test(err.message)
      ? 'Payments are not configured yet — add your Chapa secret key in .env.'
      : 'We could not reach the payment provider. Please try again shortly.';
    return failed(res, hint);
  }
}

// IMPORTANT: this must be registered BEFORE '/checkout/:serviceId' — otherwise
// Express treats the word "return" as a service id and the page customers land
// on after paying shows "Service not found".
router.get('/checkout/return', async (req, res, next) => {
  try {
    const txRef = req.query.tx_ref;
    const order = txRef ? await store.getOrderByTxRef(txRef) : null;
    if (!order) return failed(res, 'Order not found.', null, 404);

    try {
      const result = await chapa.verify(txRef);
      const paid = result.status === 'success' && result.data && result.data.status === 'success';
      await store.updateOrderStatus(txRef, paid ? 'paid' : 'failed');
      order.status = paid ? 'paid' : 'failed';
      if (paid) {
        const isProduct = order.item_type === 'product' && order.download_token;
        return res.send(render('checkout/success', {
          order,
          downloadUrl: isProduct ? `/download/${order.download_token}` : ''
        }));
      }
      return failed(res, 'Payment was not completed.', order);
    } catch (err) {
      console.error('Chapa verify error:', err.response ? err.response.data : err.message);
      return failed(res, 'We could not confirm your payment yet. If you were charged, contact us with your reference: ' + txRef, order);
    }
  } catch (err) { next(err); }
});

// ---------- Services ----------
router.get('/checkout/:serviceId(\\d+)', async (req, res, next) => {
  try {
    const service = await store.getService(Number(req.params.serviceId));
    if (!service || !service.active) return failed(res, 'Service not found.', null, 404);
    return showForm(res, 'service', service, null);
  } catch (err) { next(err); }
});

router.post('/checkout/:serviceId(\\d+)', async (req, res, next) => {
  try {
    const service = await store.getService(Number(req.params.serviceId));
    if (!service || !service.active) return failed(res, 'Service not found.', null, 404);
    return startPayment(req, res, 'service', service);
  } catch (err) { next(err); }
});

// ---------- Downloadable products ----------
router.get('/checkout/product/:productId(\\d+)', async (req, res, next) => {
  try {
    const product = await store.getProduct(Number(req.params.productId));
    if (!product || !product.active) return failed(res, 'Product not found.', null, 404);
    return showForm(res, 'product', product, null);
  } catch (err) { next(err); }
});

router.post('/checkout/product/:productId(\\d+)', async (req, res, next) => {
  try {
    const product = await store.getProduct(Number(req.params.productId));
    if (!product || !product.active) return failed(res, 'Product not found.', null, 404);
    if (!product.file_path) return failed(res, 'This product is not available for download yet. Please contact us.');
    return startPayment(req, res, 'product', product);
  } catch (err) { next(err); }
});

// Hands the file to a customer whose payment is confirmed. The link in the
// address bar is the customer's private receipt; the actual file link it
// redirects to expires after two minutes.
router.get('/download/:token', async (req, res, next) => {
  try {
    const order = await store.getOrderByDownloadToken(req.params.token);
    if (!order) return failed(res, 'This download link is not valid.', null, 404);

    if (order.status !== 'paid') {
      try {
        const result = await chapa.verify(order.tx_ref);
        const paid = result.status === 'success' && result.data && result.data.status === 'success';
        if (paid) { await store.updateOrderStatus(order.tx_ref, 'paid'); order.status = 'paid'; }
      } catch (err) {
        console.error('Chapa verify error (download):', err.response ? err.response.data : err.message);
      }
    }
    if (order.status !== 'paid') return failed(res, 'Your payment has not been confirmed yet. Please wait a moment and refresh this page, or contact us with reference ' + order.tx_ref, order);

    const used = Number(order.download_count || 0);
    if (used >= MAX_DOWNLOADS) return failed(res, 'This link has reached its download limit. Contact us with reference ' + order.tx_ref + ' and we will help.', order);

    const product = await store.getProduct(Number(order.product_id));
    if (!product || !product.file_path) return failed(res, 'The file is not available right now. Contact us with reference ' + order.tx_ref + '.', order);

    const url = await files.signedDownloadUrl(product.file_path, product.file_name);
    await store.setDownloadCount(order.tx_ref, used + 1);
    return res.redirect(url);
  } catch (err) { next(err); }
});

// Chapa calls this server-to-server when a payment completes — the authoritative source of truth.
// Always re-verify here rather than trusting the payload alone.
router.post('/chapa/webhook', async (req, res) => {
  const txRef = (req.body && req.body.tx_ref) || req.query.tx_ref;
  if (!txRef) return res.sendStatus(400);
  try {
    const result = await chapa.verify(txRef);
    const paid = result.status === 'success' && result.data && result.data.status === 'success';
    await store.updateOrderStatus(txRef, paid ? 'paid' : 'failed');
    res.sendStatus(200);
  } catch (err) {
    console.error('Chapa webhook error:', err.response ? err.response.data : err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
