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

function render(name, data) {
  const fn = compiled[name];
  if (!fn) throw new Error(`render: unknown template "${name}"`);
  return fn(data || {}, escapeHTML, makeInclude(name), rethrow);
}

module.exports = { render };
