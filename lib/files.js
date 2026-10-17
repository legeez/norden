// Downloadable product files (Excel / Word / PDF) live in a PRIVATE Supabase
// Storage bucket. Nobody can open them by URL — the site hands out a link that
// expires after two minutes, and only to customers whose payment is confirmed.
const path = require('path');
const { getClient } = require('./supabaseClient');

// Read at call time (not load time) so it also works on Cloudflare, where
// environment values are attached per request.
function bucket() { return process.env.SUPABASE_PRODUCTS_BUCKET || 'products'; }
const ALLOWED_EXT = ['.xlsx', '.xls', '.xlsm', '.docx', '.doc', '.pdf', '.zip'];

function extOf(name) { return path.extname(name || '').toLowerCase(); }
function isAllowedFile(name) { return ALLOWED_EXT.includes(extOf(name)); }

async function uploadProductFile(file) {
  const sb = getClient();
  const ext = extOf(file.originalname);
  const key = `files/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const { error } = await sb.storage.from(bucket()).upload(key, file.buffer, {
    contentType: file.mimetype || 'application/octet-stream',
    upsert: false
  });
  if (error) throw error;
  return {
    file_path: key,
    file_name: file.originalname,
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

module.exports = { ALLOWED_EXT, isAllowedFile, uploadProductFile, removeProductFile, signedDownloadUrl };
