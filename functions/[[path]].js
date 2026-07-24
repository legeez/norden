// Cloudflare Pages Function — catch-all route (`[[path]]` matches every URL
// that isn't served directly as a static asset from /public, e.g. the CSS
// files, which Cloudflare serves at the edge without ever running this code).
//
// This is what actually runs our Express app on Cloudflare: it wraps the same
// `app` from server.js in a plain Node http.Server, then bridges that into
// the Workers fetch-event model using the `cloudflare:node` compatibility
// layer. Requires the `nodejs_compat` and `allow_eval_during_startup`
// compatibility flags (see wrangler.toml) — the latter is what lets
// lib/render.js precompile all templates once when this Worker starts up.
const { createServer } = require('node:http');
const { httpServerHandler } = require('cloudflare:node');
const app = require('../server.js');

const server = createServer(app);
const handler = httpServerHandler(server);

module.exports.onRequest = async (context) => {
  // Cloudflare provides your configured environment variables/secrets on
  // context.env rather than a real process.env. Copying them across means
  // every existing `process.env.X` read in this codebase (store.js, chapa.js,
  // auth checks, etc.) keeps working unchanged, on Cloudflare or anywhere else.
  Object.assign(process.env, context.env);
  return handler.fetch(context.request, context.env, context.ctx);
};
