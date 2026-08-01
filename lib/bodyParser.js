// Minimal replacements for express.json() / express.urlencoded().
//
// Those built-ins pull in body-parser -> raw-body -> iconv-lite, which
// exists mainly to support request bodies sent in character sets other than
// UTF-8. iconv-lite's code isn't compatible with Cloudflare Workers' Node
// compatibility layer — it crashes the moment the Worker's code loads
// ("Uncaught TypeError: require_streams(...) is not a function"), before any
// request is even handled.
//
// This app only ever sends and receives UTF-8 (true of essentially every
// modern web form and JSON API), so we don't need iconv-lite's actual
// functionality — just plain body reading. Both parsers below read the
// request body directly and skip that entire dependency chain.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function urlencoded() {
  return async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) return next();
    try {
      const body = await readRawBody(req);
      req.body = Object.fromEntries(new URLSearchParams(body));
      next();
    } catch (err) {
      next(err);
    }
  };
}

function json() {
  return async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) return next();
    try {
      const body = await readRawBody(req);
      req.body = body ? JSON.parse(body) : {};
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { json, urlencoded };
