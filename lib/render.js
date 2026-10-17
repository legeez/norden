// Calls our precompiled templates (see scripts/build-templates.js). Nothing
// in this file compiles anything — every template is already a plain JS
// function by the time it gets here, which is what makes this safe to load
// on Cloudflare Workers: there's no eval()/new Function() call anywhere in
// this codebase anymore, at startup or per-request.
const compiled = require('../worker/templates.generated.js');

function escapeHTML(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

function rethrow(err) {
  throw err;
}

function dirOf(name) {
  const idx = name.lastIndexOf('/');
  return idx === -1 ? '' : name.slice(0, idx);
}

// Resolves `<%- include('_sidebar', {...}) %>` (relative to the including
// template's own folder) against our flat name -> function map.
function makeInclude(currentName) {
  const dir = dirOf(currentName);
  return function include(originalPath, data) {
    let key = originalPath.replace(/^\.\//, '');
    key = dir ? `${dir}/${key}` : key;
    const fn = compiled[key];
    if (!fn) {
      throw new Error(`render: template "${currentName}" includes unknown template "${originalPath}" (resolved to "${key}")`);
    }
    return fn(data || {}, escapeHTML, makeInclude(key), rethrow);
  };
}

// Public pages contain both languages side by side (data-en / data-am). Each
// page is served in ONE language at its own address (/ for English, /am for
// Amharic), so the other language is removed here, on the server. Search
// engines then see a clean single-language page, and visitors download less.
// Every element marked data-en / data-am holds plain text only (admin-entered
// text is HTML-escaped), so matching up to its own closing tag is safe.
function stripLanguage(html, dropLang) {
  const re = new RegExp('<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*\\sdata-' + dropLang + '(?=[\\s>=/])[^>]*>[\\s\\S]*?</\\1>', 'g');
  return html.replace(re, '');
}

function render(name, data) {
  const fn = compiled[name];
  if (!fn) throw new Error(`render: unknown template "${name}"`);
  const html = fn(data || {}, escapeHTML, makeInclude(name), rethrow);
  if (data && (data.lang === 'en' || data.lang === 'am')) {
    return stripLanguage(html, data.lang === 'am' ? 'en' : 'am');
  }
  return html;
}

module.exports = { render };
