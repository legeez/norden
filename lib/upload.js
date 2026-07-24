// Uploads an in-memory file (from multer's memoryStorage) to a Supabase Storage
// bucket and returns its public URL.
const path = require('path');
const { getClient } = require('./supabaseClient');

const BUCKET = process.env.SUPABASE_BUCKET || 'media';

async function uploadImage(file, folder = 'uploads') {
  if (!file) return '';
  const sb = getClient();
  const ext = path.extname(file.originalname) || '.jpg';
  const key = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  const { error } = await sb.storage.from(BUCKET).upload(key, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw error;

  const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
  return data.publicUrl;
}

module.exports = { uploadImage };
