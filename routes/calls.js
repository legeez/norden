const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const store = require('../lib/store');
const calls = require('../lib/calls');
const chapa = require('../lib/chapa');
const notify = require('../lib/notify');
const seo = require('../lib/seo');
const { render } = require('../lib/render');

const flag = calls.flag;

function pick(obj, lang) { return lang === 'am' && obj.am ? obj.am : obj.en; }
function withSlugs(services) { return services.map(s => ({ ...s, slug: seo.slugify(s.title_en) || String(s.id) })); }

function pageContext(req, lang, path) {
  return {
    lang,
    prefix: lang === 'am' ? '/am' : '',
    home: lang === 'am' ? '/am' : '/',
    enUrl: path,
    amUrl: '/am' + path,
    base: seo.baseUrl(req)
  };
}

function baseUrl(req) {
  const env = process.env.APP_BASE_URL;
  if (env && !/localhost|127\.0\.0\.1/i.test(env)) return env.replace(/\/+$/, '');
  const host = req.get('host');
  const local = /^(localhost|127\.0\.0\.1)/i.test(host || '');
  return `${local ? req.protocol : 'https'}://${host}`;
}

// Payment, slot and result URLs are private; the booking page itself is public.
router.use(['/call/book', '/call/slots', '/call/return', '/chapa/call-webhook'], (req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  next();
});

const ERRORS = {
  missing: { en: 'Please fill in your name, email and phone number.', am: 'እባክዎ ስምዎን፣ ኢሜይልዎን እና ስልክ ቁጥርዎን ይሙሉ።' },
  email: { en: 'Please enter a valid email address.', am: 'እባክዎ ትክክለኛ ኢሜይል ያስገቡ።' },
  type: { en: 'Please choose a call type.', am: 'እባክዎ የጥሪ አይነት ይምረጡ።' },
  closed: { en: 'Live calls are offline right now. Please book a scheduled call instead.', am: 'ቀጥታ ጥሪ አሁን አይገኝም። እባክዎ ቀጠሮ ያለው ጥሪ ይያዙ።' },
  channel: { en: 'Please choose phone or WhatsApp.', am: 'እባክዎ ስልክ ወይም ዋትስአፕ ይምረጡ።' },
  category: { en: 'Please choose what you need help with.', am: 'እባክዎ ምን እርዳታ እንደሚፈልጉ ይምረጡ።' },
  slot: { en: 'Please pick a day and a time.', am: 'እባክዎ ቀን እና ሰዓት ይምረጡ።' },
  taken: { en: 'Sorry, that time was just taken. Please pick another one.', am: 'ይቅርታ፣ ያ ሰዓት አሁን ተይዟል። እባክዎ ሌላ ይምረጡ።' },
  pay: { en: 'We could not start the payment. Please try again shortly.', am: 'ክፍያውን መጀመር አልተቻለም። እባክዎ ትንሽ ቆይተው ይሞክሩ።' },
  setup: { en: 'Calls are not available yet. Please contact us by phone or email.', am: 'ጥሪ ማስያዝ ገና አልተጀመረም። እባክዎ በስልክ ወይም በኢሜይል ያግኙን።' }
};

// What the public page is allowed to know. Phone numbers are NOT included:
// they are only shown after a live call has been paid for.
function publicConfig(s, ready) {
  const phoneOn = flag(s.channel_phone), waOn = flag(s.channel_whatsapp);
  const liveChannels = [];
  if (phoneOn && calls.telHref(s.call_phone)) liveChannels.push('phone');
  if (waOn && calls.waHref(s.call_whatsapp)) liveChannels.push('whatsapp');
  const schedChannels = [];
  if (phoneOn) schedChannels.push('phone');
  if (waOn) schedChannels.push('whatsapp');
  return {
    ready,
    currency: s.currency || 'ETB',
    channels: schedChannels,
    live: {
      on: ready && flag(s.live_enabled) && liveChannels.length > 0,
      price: calls.num(s.live_price),
      minutes: calls.clampInt(s.live_minutes, 1, 120, 10),
      channels: liveChannels
    },
    scheduled: {
      on: ready && flag(s.scheduled_enabled) && schedChannels.length > 0,
      price: calls.num(s.scheduled_price),
      minutes: calls.clampInt(s.slot_minutes, 10, 240, 30)
    }
  };
}

// A call type can have its own prices; an empty price falls back to the defaults in Call Settings.
function categoryTerms(cat, cfg) {
  return {
    live: { price: cat.live_price !== null ? cat.live_price : cfg.live.price, minutes: cat.live_minutes !== null ? cat.live_minutes : cfg.live.minutes },
    scheduled: { price: cat.scheduled_price !== null ? cat.scheduled_price : cfg.scheduled.price }
  };
}

async function renderCallPage(req, res, lang, extra) {
  const [content, services, cs, categories] = await Promise.all([
    store.getContent(), store.listServices({ activeOnly: true }), calls.getSettingsSafe(),
    calls.listCategoriesSafe({ activeOnly: true })
  ]);
  const cfg = publicConfig(cs.s, cs.ready);
  const cats = categories.map(c => ({
    id: c.id, title_en: c.title_en, title_am: c.title_am || c.title_en, desc_en: c.desc_en, desc_am: c.desc_am || c.desc_en,
    ...categoryTerms(c, cfg)
  }));
  // Safe to print inside a <script> tag.
  const catsJson = JSON.stringify(cats).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const days = cfg.scheduled.on ? calls.availableDays(cs.s, new Date()) : [];
  if (cfg.scheduled.on && !days.length) cfg.scheduled.on = false; // nothing left to book
  const ctx = pageContext(req, lang, '/call');
  const name = pick(content.company_name, lang);
  const crumbs = [
    { name, url: seo.localizedUrl(ctx.base, lang, '/') },
    { name: lang === 'am' ? 'ጥሪ ያስይዙ' : 'Book a call', url: seo.localizedUrl(ctx.base, lang, '/call') }
  ];
  const page = seo.seoFor({
    req, lang, path: '/call',
    title: lang === 'am' ? `ከባለሙያ ጋር ይደውሉ — BOQ እና የወጪ ግምት ምክር | ${name}` : `Book a Call with a BOQ & Cost Estimation Expert | ${name}`,
    description: lang === 'am'
      ? 'ስለ BOQ፣ የወጪ ግምት፣ ጨረታ እና የተቋራጭ ክፍያ ፈጣን ቀጥታ ጥሪ ወይም ቀጠሮ ያለው ጥሪ በስልክ ወይም በዋትስአፕ ያስይዙ።'
      : 'Get quick advice on BOQ, cost estimation, bids and contractor payments. Book a live call now or schedule a call by phone or WhatsApp.',
    ld: [seo.breadcrumbLd(crumbs)]
  });
  const errCode = extra && extra.error;
  res.status(errCode && errCode !== 'none' ? 400 : 200).send(render('call', {
    ...ctx, content, services: withSlugs(services), cfg, days, cats, catsJson,
    errorMsg: errCode && ERRORS[errCode] ? ERRORS[errCode] : null,
    values: (extra && extra.values) || {},
    seo: page
  }));
}

router.get('/call', (req, res, next) => renderCallPage(req, res, 'en', {}).catch(next));
router.get('/am/call', (req, res, next) => renderCallPage(req, res, 'am', {}).catch(next));

// Open slots for one day (used by the date picker on the page).
router.get('/call/slots', async (req, res, next) => {
  try {
    const cs = await calls.getSettingsSafe();
    if (!cs.ready || !flag(cs.s.scheduled_enabled)) return res.json({ slots: [] });
    const taken = await calls.takenForDay(String(req.query.date || ''));
    const slots = calls.generateSlots(cs.s, String(req.query.date || ''), new Date(), taken)
      .map(x => ({ iso: x.iso, label: x.label }));
    res.json({ slots });
  } catch (err) { next(err); }
});

// ---------- Create a booking and send the customer to Chapa ----------
router.post('/call/book', async (req, res, next) => {
  try {
    const b = req.body || {};
    const lang = b.lang === 'am' ? 'am' : 'en';
    const values = {
      type: b.call_type, name: b.name, email: b.email, phone: b.phone,
      channel: b.channel, topic: b.topic, date: b.date, category: b.category_id
    };
    const fail = (code) => renderCallPage(req, res, lang, { error: code, values });

    if (b.website) return res.redirect(lang === 'am' ? '/am/call' : '/call'); // honeypot: bots fill this in

    const cs = await calls.getSettingsSafe();
    if (!cs.ready) return fail('setup');
    const s = cs.s;
    const cfg = publicConfig(s, true);

    const name = String(b.name || '').trim().slice(0, 120);
    const emailAddr = String(b.email || '').trim().slice(0, 160);
    const phone = String(b.phone || '').trim().slice(0, 40);
    const topic = String(b.topic || '').trim().slice(0, 400);
    if (!name || !emailAddr || !phone) return fail('missing');
    if (!/^\S+@\S+\.\S+$/.test(emailAddr)) return fail('email');

    const callType = b.call_type === 'live' ? 'live' : b.call_type === 'scheduled' ? 'scheduled' : '';
    if (!callType) return fail('type');
    const channel = b.channel === 'whatsapp' ? 'whatsapp' : b.channel === 'phone' ? 'phone' : '';
    if (!channel) return fail('channel');

    // Call type chosen by the customer (only required when you have created call types).
    const categories = await calls.listCategoriesSafe({ activeOnly: true });
    let category = null;
    if (categories.length) {
      category = categories.find(c => String(c.id) === String(b.category_id));
      if (!category) return fail('category');
    }
    const terms = category ? categoryTerms(category, cfg) : { live: cfg.live, scheduled: cfg.scheduled };

    let slotStart = null, amount, minutes;
    if (callType === 'live') {
      if (!cfg.live.on) return fail('closed');
      if (!cfg.live.channels.includes(channel)) return fail('channel');
      amount = terms.live.price; minutes = terms.live.minutes;
    } else {
      if (!cfg.scheduled.on) return fail('type');
      if (!cfg.channels.includes(channel)) return fail('channel');
      const ms = Date.parse(String(b.slot || ''));
      if (!Number.isFinite(ms)) return fail('slot');
      // Re-derive the day on the server and make sure the chosen slot really is open.
      const dateStr = calls.dateKey(calls.toLocal(new Date(ms)));
      const taken = await calls.takenForDay(dateStr);
      const open = calls.generateSlots(s, dateStr, new Date(), taken).find(x => x.ms === ms);
      if (!open) return fail('taken');
      slotStart = open.iso;
      amount = terms.scheduled.price; minutes = cfg.scheduled.minutes;
    }

    const txRef = `norden-call-${uuidv4()}`;
    let booking;
    try {
      booking = await calls.createBooking({
        call_type: callType, channel, customer_name: name, customer_email: emailAddr, customer_phone: phone,
        topic, category_id: category ? category.id : null, category_title: category ? category.title_en : '',
        slot_start: slotStart, duration_min: minutes, amount, currency: cfg.currency,
        tx_ref: txRef, status: amount > 0 ? 'pending' : 'paid', paid_at: amount > 0 ? null : new Date().toISOString(),
        call_status: 'new', lang
      });
    } catch (err) {
      if (err.code === 'SLOT_TAKEN') return fail('taken');
      throw err;
    }

    const back = `${baseUrl(req)}/call/return?tx_ref=${encodeURIComponent(txRef)}&lang=${lang}`;
    // A price of 0 (a promotion) skips Chapa; the return page then confirms and notifies as usual.
    if (amount <= 0) {
      await notify.notifyAdmin(s, 'New call booked (free)', notify.describeBooking(booking, baseUrl(req))).catch(() => {});
      return res.redirect(back);
    }

    const [firstName, ...rest] = name.split(' ');
    try {
      const result = await chapa.initialize({
        amount, currency: cfg.currency, email: emailAddr, firstName, lastName: rest.join(' ') || firstName,
        txRef, callbackUrl: `${baseUrl(req)}/chapa/call-webhook`, returnUrl: back,
        title: 'Norden Trading',
        description: callType === 'live' ? 'Norden live call' : 'Norden scheduled call'
      });
      if (result.status === 'success' && result.data && result.data.checkout_url) return res.redirect(result.data.checkout_url);
      await calls.markFailed(txRef);
      return fail('pay');
    } catch (err) {
      console.error('Chapa initialize error (call):', err.response ? err.response.data : err.message);
      await calls.markFailed(txRef).catch(() => {});
      return fail('pay');
    }
  } catch (err) { next(err); }
});

// ---------- Confirm a payment (shared by the return page and the webhook) ----------
async function settle(txRef, req) {
  let b = await calls.getByTxRef(txRef);
  if (!b) return { state: 'notfound' };
  if (b.status === 'paid') return { state: 'paid', booking: b };

  let paid = false;
  try {
    const r = await chapa.verify(txRef);
    paid = r.status === 'success' && r.data && r.data.status === 'success';
  } catch (err) {
    console.error('Chapa verify error (call):', err.response ? err.response.data : err.message);
    return { state: 'pending', booking: b, unverified: true };
  }

  const cs = await calls.getSettingsSafe();
  if (!paid) { await calls.markFailed(txRef); return { state: 'failed', booking: b }; }

  const r = await calls.markPaid(txRef);
  if (r.conflict) {
    // Paid for a slot that was meanwhile given to someone else (very rare). Tell the admin.
    await notify.notifyAdmin(cs.s, 'ACTION NEEDED: paid call, slot no longer free',
      notify.describeBooking(b, baseUrl(req)) + '\n\nThis customer paid but the slot was taken. Please reschedule or refund in Chapa.').catch(() => {});
    return { state: 'conflict', booking: b };
  }
  if (r.changed) {
    b = r.booking;
    await notify.notifyAdmin(cs.s, `New paid ${b.call_type} call`, notify.describeBooking(b, baseUrl(req))).catch(() => {});
  } else {
    b = await calls.getByTxRef(txRef);
  }
  return { state: 'paid', booking: b };
}

router.get('/call/return', async (req, res, next) => {
  try {
    const lang = req.query.lang === 'am' ? 'am' : 'en';
    const txRef = String(req.query.tx_ref || '');
    const out = txRef ? await settle(txRef, req) : { state: 'notfound' };
    const b = out.booking;
    let live = null, slotLabel = '';
    if (b && out.state === 'paid') {
      if (b.call_type === 'scheduled') slotLabel = calls.formatSlot(b.slot_start, lang);
      if (b.call_type === 'live') {
        const cs = await calls.getSettingsSafe();
        const s = cs.s;
        const windowMin = calls.clampInt(s.live_window_min, 5, 1440, 60);
        const left = windowMin - (Date.now() - new Date(b.paid_at || b.created_at).getTime()) / 60000;
        const text = `Hello Norden, I paid for a live call. Reference: ${b.tx_ref}`;
        live = {
          active: left > 0, minutesLeft: Math.max(0, Math.ceil(left)), minutes: b.duration_min,
          phone: flag(s.channel_phone) ? calls.telHref(s.call_phone) : '',
          whatsapp: flag(s.channel_whatsapp) ? calls.waHref(s.call_whatsapp, text) : '',
          preferred: b.channel
        };
      }
    }
    res.status(out.state === 'notfound' ? 404 : 200).send(render('checkout/call-result', {
      lang, state: out.state, booking: b || null, live, slotLabel
    }));
  } catch (err) { next(err); }
});

// Chapa calls this server-to-server. Always re-verified against Chapa, never trusted as sent.
router.post('/chapa/call-webhook', async (req, res) => {
  const txRef = (req.body && req.body.tx_ref) || req.query.tx_ref;
  if (!txRef) return res.sendStatus(400);
  try {
    const out = await settle(String(txRef), req);
    res.sendStatus(out.unverified ? 500 : 200);
  } catch (err) {
    console.error('Chapa call webhook error:', err.message);
    res.sendStatus(500);
  }
});

module.exports = router;
