// Downloadable product files (Excel / Word / PDF) live in a PRIVATE Supabase
// Storage bucket. Nobody can open them by URL — the site hands out a link that
// expires after two minutes, and only to customers whose payment is confirmed.
const path = require('path');
const { getClient } = require('./supabaseClient');

// Read at call time (not load time) so it also works on Cloudflare, where
// environment values are attached per request.
function bucket() { return process.env.SUPABASE_PRODUCTS_BUCKET || 'products'; }
const ALLOWED_EXT = ['.xlsx', '.xls', '.xlsm', '.docx', '.doc', '.pdf', '.zip'];

function extOf(name) {
  const m = /\.([A-Za-z0-9]+)\s*$/.exec(String(name || ''));
  return m ? '.' + m[1].toLowerCase() : '';
}
function isAllowedFile(name) { return ALLOWED_EXT.includes(extOf(name)); }

// Some hosts (including Cloudflare) can hand over a missing or odd filename, so
// fall back to the file's content type when the name does not tell us.
const MIME_EXT = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.ms-excel.sheet.macroenabled.12': '.xlsm',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip'
};
function resolveExt(file) {
  const byName = extOf(file && file.originalname);
  if (ALLOWED_EXT.includes(byName)) return byName;
  const byMime = MIME_EXT[String((file && file.mimetype) || '').toLowerCase()];
  return byMime || byName;
}
function isAllowedUpload(file) { return ALLOWED_EXT.includes(resolveExt(file)); }

async function uploadProductFile(file) {
  const sb = getClient();
  const ext = resolveExt(file);
  const key = `files/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const { error } = await sb.storage.from(bucket()).upload(key, file.buffer, {
    contentType: file.mimetype || 'application/octet-stream',
    upsert: false
  });
  if (error) throw error;
  return {
    file_path: key,
    file_name: file.originalname || ('download' + ext),
    file_size: file.size,
    file_type: ext.replace('.', '').toUpperCase()
  };
}

async function removeProductFile(filePath) {
  if (!filePath) return;
  const sb = getClient();
  await sb.storage.from(bucket()).remove([filePath]);
}

async function signedDownloadUrl(filePath, downloadName, seconds = 120) {
  const sb = getClient();
  const { data, error } = await sb.storage
    .from(bucket())
    .createSignedUrl(filePath, seconds, { download: downloadName || true });
  if (error) throw error;
  return data.signedUrl;
}

// Used by the admin Products page to say plainly whether uploads can work.
async function checkBucket() {
  try {
    const sb = getClient();
    const { data, error } = await sb.storage.getBucket(bucket());
    if (error || !data) {
      return { ok: false, message: `The storage bucket "${bucket()}" was not found. Run migrations/002_products_and_seo.sql in the Supabase SQL Editor (it creates it), or create a PRIVATE bucket named "${bucket()}" in Supabase → Storage.` };
    }
    return { ok: true, isPublic: !!data.public };
  } catch (e) {
    return { ok: false, message: 'Could not reach Supabase storage: ' + (e.message || e) };
  }
}

module.exports = { checkBucket, ALLOWED_EXT, isAllowedFile, isAllowedUpload, resolveExt, uploadProductFile, removeProductFile, signedDownloadUrl };
