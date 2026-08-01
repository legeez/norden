require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const SupabaseSessionStore = require('./lib/sessionStore');
const bodyParser = require('./lib/bodyParser');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const checkoutRoutes = require('./routes/checkout');

const app = express();

// No `app.set('view engine', ...)` here on purpose — every route renders
// through lib/render.js (bundled, precompiled templates) instead of Express's
// default fs-based view lookup, so the exact same code path runs locally and
// on Cloudflare Pages, which has no filesystem to read .ejs files from.

app.use(bodyParser.urlencoded());
  app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const SESSION_MAX_AGE = 1000 * 60 * 60 * 8; // 8 hours

app.use(session({
  store: new SupabaseSessionStore({ ttlMs: SESSION_MAX_AGE }),
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-.env',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: SESSION_MAX_AGE }
}));

app.use('/', publicRoutes);
app.use('/', checkoutRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).send('Page not found.');
});

// Friendly fallback for unhandled errors — most commonly a missing/incorrect
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or CHAPA_SECRET_KEY in .env.
app.use((err, req, res, next) => {
  console.error(err);
  const hint = /SUPABASE/.test(err.message)
    ? 'The database is not configured yet — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your .env file (see README).'
    : 'Something went wrong loading this page. Check the server logs for details.';
  res.status(500).send(`<div style="font-family:sans-serif; max-width:520px; margin:80px auto; padding:24px; border:1px solid #eee; border-radius:8px;"><h2 style="margin-top:0;">Configuration needed</h2><p>${hint}</p></div>`);
});

// Only start a listening server when run directly with Node (local dev, or any
// traditional host). On Cloudflare, functions/[[path]].js imports `app`
// itself and wraps it — Workers don't use app.listen() at all.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Norden Trading website running at http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin/login`);
  });
}

module.exports = app;
