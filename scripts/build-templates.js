// Runs at BUILD time (not on Cloudflare) — walks views/, compiles every .ejs
// file to a plain JavaScript function using EJS's "client" compile mode, and
// writes one bundled module containing real function declarations.
//
// Why this exists (v2): the first version of this build step bundled raw
// .ejs *source text* and compiled it with new Function() when the Worker
// started up. That worked, but compiling 12 templates during startup turned
// out to be too much CPU for Cloudflare's startup-time budget ("Worker
// failed validation because it exceeded startup limits"). Compiling to real
// JS *here*, on a normal machine with no such limit, means the Worker never
// calls eval()/new Function() at all.
//
// v3 fix: EJS's compiled output wraps the template body in `with (locals ||
// {}) { ... }` so templates can reference `content`, `services`, etc. as
// bare names. `with` is forbidden in strict-mode JS, and Wrangler's bundler
// (esbuild) treats the whole Worker bundle as strict/ESM once our entry
// point uses `import`/`export` — so a `with` statement anywhere in the
// bundle, even inside an untouched third-party-style generated file, fails
// the build. Rather than rewrite every `<%= x %>` in every template (risky —
// several names like `active`/`error`/`order` also appear as object-literal
// keys elsewhere, and a blind rename could corrupt those), this script
// replaces just the `with (locals || {}) {` line with an equivalent plain
// destructuring statement — same effect, no `with` keyword, and the
// template body text itself is never touched.
//
// Run with: npm run build:templates
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const VIEWS_DIR = path.join(__dirname, '..', 'views');
const OUT_FILE = path.join(__dirname, '..', 'worker', 'templates.generated.js');

// The exact top-level keys each template is rendered with — see the
// render('name', { ... }) calls in routes/*.js and the include(...) calls in
// views/**/*.ejs. Keeping this list explicit (rather than trying to infer it)
// means the destructuring below can never accidentally miss or mis-scope a
// name.
const LOCALS_KEYS = {
  'index': ['lang', 'prefix', 'home', 'enUrl', 'amUrl', 'content', 'services', 'aboutFeatures', 'whyUs', 'process', 'gallery', 'products', 'categories', 'seo'],
  'products': ['lang', 'prefix', 'home', 'enUrl', 'amUrl', 'content', 'services', 'groups', 'hasProducts', 'categories', 'seo'],
  'product': ['lang', 'prefix', 'home', 'enUrl', 'amUrl', 'content', 'services', 'product', 'cat', 'related', 'seo'],
  'service': ['lang', 'prefix', 'home', 'enUrl', 'amUrl', 'content', 'services', 'service', 'process', 'whyUs', 'products', 'seo'],
  'notfound': ['lang', 'prefix', 'home', 'enUrl', 'amUrl', 'content', 'services', 'seo'],
  'partials/_head': ['seo', 'lang'],
  'partials/_header': ['lang', 'prefix', 'home', 'enUrl', 'amUrl', 'content'],
  'partials/_footer': ['lang', 'prefix', 'home', 'content', 'services'],
  'partials/_productcard': ['lang', 'prefix', 'p'],
  'admin/_sidebar': ['active'],
  'admin/login': ['error'],
  'admin/dashboard': ['serviceCount', 'orderCount', 'paidCount', 'revenue', 'recentOrders'],
  'admin/content': ['content', 'saved'],
  'admin/services': ['services'],
  'admin/products': ['products', 'categories', 'setupNeeded', 'error', 'saved', 'storage'],
  'admin/_dropzone': ['name', 'kind', 'maxmb', 'hint', 'required'],
  'admin/blocks': ['section', 'items'],
  'admin/gallery': ['items'],
  'admin/orders': ['orders'],
  'checkout/form': ['service', 'error'],
  'checkout/success': ['order', 'downloadUrl'],
  'checkout/failed': ['message', 'order']
};

const WITH_PATTERN = /with\s*\(\s*locals\s*\|\|\s*\{\}\s*\)\s*\{/;

function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files = files.concat(walk(full, rel));
    } else if (entry.name.endsWith('.ejs')) {
      files.push(rel.replace(/\.ejs$/, ''));
    }
  }
  return files;
}

// Turns "admin/_sidebar" into a safe, unique JS identifier like "tpl_admin__sidebar".
function toIdentifier(name) {
  return 'tpl_' + name.replace(/[^a-zA-Z0-9]/g, '_');
}

// Replaces `with (locals || {}) {` with `{ var {a, b, c} = locals || {};` —
// same brace, same position, so the block's existing closing `}` still lines
// up correctly. The template body after it is untouched.
function stripWith(source, name) {
  const keys = LOCALS_KEYS[name];
  if (!keys) {
    throw new Error(`build-templates: no LOCALS_KEYS entry for "${name}" — add one so its "with" block can be safely rewritten.`);
  }
  if (!WITH_PATTERN.test(source)) {
    throw new Error(`build-templates: expected a "with (locals || {})" block in compiled output for "${name}" but didn't find one — EJS's output format may have changed.`);
  }
  const destructure = keys.length ? `var {${keys.join(', ')}} = locals || {};` : '';
  return source.replace(WITH_PATTERN, `{ ${destructure}`);
}

function build() {
  const names = walk(VIEWS_DIR);
  const declarations = [];
  const entries = [];

  names.forEach(name => {
    const filePath = path.join(VIEWS_DIR, `${name}.ejs`);
    const source = fs.readFileSync(filePath, 'utf-8');

    const compiled = ejs.compile(source, {
      client: true,
      compileDebug: false,
      filename: filePath
    });

    const withFreeSource = stripWith(compiled.toString(), name);

    const id = toIdentifier(name);
    declarations.push(`const ${id} = ${withFreeSource};`);
    entries.push(`  ${JSON.stringify(name)}: ${id}`);
  });

  const banner = [
    '// AUTO-GENERATED by scripts/build-templates.js — do not edit by hand.',
    '// Regenerate with: npm run build:templates',
    '//',
    '// Every template below was compiled to plain JS at build time (EJS',
    '// "client" mode, with the `with` block replaced by explicit',
    '// destructuring) — there is no eval(), new Function(), or `with`',
    '// statement left anywhere in this file.'
  ].join('\n');

  const body = `${banner}\n\n${declarations.join('\n\n')}\n\nmodule.exports = {\n${entries.join(',\n')}\n};\n`;

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, body);
  console.log(`Compiled ${names.length} templates -> ${path.relative(process.cwd(), OUT_FILE)}`);
}

build();
