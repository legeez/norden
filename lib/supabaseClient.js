const { createClient } = require('@supabase/supabase-js');

let client = null;

function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Add them to your .env file (see README).');
  }
  // The SERVICE ROLE key is used here deliberately — this file only ever runs on the
  // server, never in a browser, so it's safe. It bypasses Row Level Security, which is
  // what lets the admin panel write data even though the tables are locked down from
  // public API access (see schema.sql).
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

module.exports = { getClient };
