// Renders our bundled EJS templates without ever touching the filesystem, and
// without compiling anything mid-request — both are required for this to work
// on Cloudflare Workers/Pages, which forbid eval()/new Function() once a
// request is being handled (EJS's compiler uses new Function() internally).
//
// The trick: compile every template exactly once, at module load time (which
// Workers treats as "startup", where eval is still allowed with the
// `allow_eval_during_startup` compatibility flag — see wrangler.toml). After
// that, calling a compiled template is just a normal function call.
const ejs = require('ejs');
const raw = require('../worker/templates.generated.js');

function dirOf(name) {
  const idx = name.lastIndexOf('/');
  return idx === -1 ? '' : name.slice(0, idx);
}

// Resolves `<%- include('_sidebar', {...}) %>` (relative to the including
// template's own folder) against our flat name -> source map, instead of
// letting EJS resolve it against a real path on disk.
function makeIncluder(currentName) {
  const dir = dirOf(currentName);
  return function includer(originalPath) {
    let key = originalPath.replace(/^\.\//, '');
    key = dir ? `${dir}/${key}` : key;
    if (!(key in raw)) {
      throw new Error(`render: template "${currentName}" includes unknown template "${originalPath}" (resolved to "${key}")`);
    }
    return { template: raw[key] };
  };
}

const compiled = {};
Object.keys(raw).forEach(name => {
  compiled[name] = ejs.compile(raw[name], { includer: makeIncluder(name) });
});

function render(name, data) {
  const fn = compiled[name];
  if (!fn) throw new Error(`render: unknown template "${name}"`);
  return fn(data || {});
}

module.exports = { render };
