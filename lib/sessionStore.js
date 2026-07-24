// A minimal express-session Store backed by Supabase, instead of the default
// in-memory store. This matters on both hosts we've discussed: on Cloudflare
// (many short-lived Worker instances) and on any host running more than one
// instance, an in-memory store would make a logged-in admin randomly appear
// logged out depending on which instance handled the request. Supabase makes
// login state consistent no matter how many instances are running.
const session = require('express-session');
const store = require('./store');

class SupabaseSessionStore extends session.Store {
  constructor(options = {}) {
    super(options);
    this.ttlMs = options.ttlMs || 1000 * 60 * 60 * 8; // 8 hours, matches cookie.maxAge in server.js
  }

  get(sid, callback) {
    store.getSession(sid)
      .then(sess => callback(null, sess || null))
      .catch(err => callback(err));
  }

  set(sid, sess, callback) {
    const expire = new Date(Date.now() + this.ttlMs).toISOString();
    store.setSession(sid, sess, expire)
      .then(() => callback && callback(null))
      .catch(err => callback && callback(err));
  }

  destroy(sid, callback) {
    store.destroySession(sid)
      .then(() => callback && callback(null))
      .catch(err => callback && callback(err));
  }

  touch(sid, sess, callback) {
    // Refresh the expiry without changing the session data.
    this.set(sid, sess, callback);
  }
}

module.exports = SupabaseSessionStore;
