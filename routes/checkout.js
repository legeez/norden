const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const store = require('../lib/store');
const chapa = require('../lib/chapa');
const { render } = require('../lib/render');

function baseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// Checkout form for one service
router.get('/checkout/:serviceId', async (req, res, next) => {
  try {
    const service = await store.getService(Number(req.params.serviceId));
    if (!service || !service.active) return res.status(404).send(render('checkout/failed', { message: 'Service not found.' }));
    res.send(render('checkout/form', { service, error: null }));
  } catch (err) { next(err); }
});

// Create the order, initialize payment with Chapa, redirect to Chapa's hosted checkout
router.post('/checkout/:serviceId', async (req, res, next) => {
  try {
    const service = await store.getService(Number(req.params.serviceId));
    if (!service || !service.active) return res.status(404).send(render('checkout/failed', { message: 'Service not found.' }));

    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
      return res.send(render('checkout/form', { service, error: 'Please fill in all fields.' }));
    }

    const txRef = `norden-${service.id}-${uuidv4()}`;
    const [firstName, ...rest] = name.trim().split(' ');
    const lastName = rest.join(' ') || firstName;

    await store.createOrder({
      service_id: service.id,
      service_title: service.title_en,
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      amount: service.price,
      currency: service.currency || 'ETB',
      tx_ref: txRef,
      status: 'pending'
    });

    try {
      const result = await chapa.initialize({
        amount: service.price,
        currency: service.currency || 'ETB',
        email,
        firstName,
        lastName,
        txRef,
        callbackUrl: `${baseUrl(req)}/chapa/webhook`,
        returnUrl: `${baseUrl(req)}/checkout/return?tx_ref=${txRef}`,
        title: 'Norden Trading',
        description: service.title_en
      });

      if (result.status === 'success' && result.data && result.data.checkout_url) {
        return res.redirect(result.data.checkout_url);
      }
      return res.send(render('checkout/failed', { message: result.message || 'Could not start payment. Please try again.' }));
    } catch (err) {
      console.error('Chapa initialize error:', err.response ? err.response.data : err.message);
      const hint = /CHAPA_SECRET_KEY/.test(err.message)
        ? 'Payments are not configured yet — add your Chapa secret key in .env.'
        : 'We could not reach the payment provider. Please try again shortly.';
      return res.send(render('checkout/failed', { message: hint }));
    }
  } catch (err) { next(err); }
});

// Customer lands here after paying (or cancelling) on Chapa's hosted page
router.get('/checkout/return', async (req, res, next) => {
  try {
    const txRef = req.query.tx_ref;
    const order = await store.getOrderByTxRef(txRef);
    if (!order) return res.status(404).send(render('checkout/failed', { message: 'Order not found.' }));

    try {
      const result = await chapa.verify(txRef);
      const paid = result.status === 'success' && result.data && result.data.status === 'success';
      await store.updateOrderStatus(txRef, paid ? 'paid' : 'failed');
      order.status = paid ? 'paid' : 'failed';
      if (paid) return res.send(render('checkout/success', { order }));
      return res.send(render('checkout/failed', { message: 'Payment was not completed.', order }));
    } catch (err) {
      console.error('Chapa verify error:', err.response ? err.response.data : err.message);
      return res.send(render('checkout/failed', { message: 'We could not confirm your payment yet. If you were charged, contact us with your reference: ' + txRef, order }));
    }
  } catch (err) { next(err); }
});

// Chapa calls this server-to-server when a payment completes — the authoritative source of truth.
// Always re-verify here rather than trusting the payload alone.
router.post('/chapa/webhook', async (req, res) => {
  const txRef = req.body.tx_ref || req.query.tx_ref;
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
