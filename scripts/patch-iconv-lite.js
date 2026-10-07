// Runs automatically after every `npm install` (see the "postinstall" script
// in package.json). Overwrites iconv-lite's entry file with a minimal,
// Workers-safe stub.
//
// Why: Express itself unconditionally requires body-parser at its own
// top-level module code (node_modules/express/lib/express.js), regardless
// of whether our own code calls express.json()/express.urlencoded(). That
// pulls in raw-body, which pulls in iconv-lite for non-UTF-8 character-set
// support. iconv-lite's own code isn't compatible with Cloudflare Workers'
// Node compatibility layer and crashes the moment it's loaded ("Uncaught
// TypeError: require_streams(...) is not a function") — before any request
// is even handled, which means the Worker fails deployment validation
// entirely.
//
// This app only ever sends and receives UTF-8 (true of essentially every
// modern web form and JSON API), so we never need iconv-lite's actual
// functionality. Rather than fight npm's "overrides" field (its file:
// protocol resolves relative paths inconsistently depending on how deep the
// dependency is nested, which produced a broken symlink when tried here),
// this just patches the real installed package directly after install —
// simple, and works the same way regardless of npm version or nesting depth.
const fs = require('fs');
const path = require('path');

const PKG_DIR = path.join(__dirname, '..', 'node_modules', 'iconv-lite');
const PKG_JSON = path.join(PKG_DIR, 'package.json');

const STUB = `// Patched at install time by scripts/patch-iconv-lite.js — see that file
// for why. This app only ever sends/receives UTF-8, so this stub only
// implements enough of the real API surface for body-parser/raw-body to
// load without crashing on Cloudflare Workers.
function encode(str) {
  return Buffer.from(String(str), 'utf8');
}

function decode(buf) {
  return Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
}

function encodingExists(enc) {
  return /^utf-?8$/i.test(String(enc));
}

module.exports = { encode, decode, encodingExists };
`;

function patch() {
  if (!fs.existsSync(PKG_JSON)) {
    console.log('patch-iconv-lite: iconv-lite is not installed — nothing to patch.');
    return;
  }

  const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf-8'));
  const mainRelative = pkg.main || 'index.js';
  const mainAbsolute = path.join(PKG_DIR, mainRelative);

  fs.writeFileSync(mainAbsolute, STUB);
  console.log(`patch-iconv-lite: replaced ${mainRelative} with a UTF-8-only stub (Cloudflare Workers compatibility).`);
}

patch();
