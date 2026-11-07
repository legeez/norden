-- Norden Trading — SEO fields (Google title + description) and call type pages
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- It is safe to run more than once. Nothing is required to fill in: when a
-- field is empty the website writes a good title/description automatically.

-- Services & Prices
alter table services add column if not exists seo_title_en text not null default '';
alter table services add column if not exists seo_title_am text not null default '';
alter table services add column if not exists seo_desc_en  text not null default '';
alter table services add column if not exists seo_desc_am  text not null default '';

-- Products & Files
alter table products add column if not exists seo_title_en text not null default '';
alter table products add column if not exists seo_title_am text not null default '';
alter table products add column if not exists seo_desc_en  text not null default '';
alter table products add column if not exists seo_desc_am  text not null default '';

-- Call Types: each one gets its own Google-searchable page (/call/your-call-type)
alter table call_categories add column if not exists seo_title_en text not null default '';
alter table call_categories add column if not exists seo_title_am text not null default '';
alter table call_categories add column if not exists seo_desc_en  text not null default '';
alter table call_categories add column if not exists seo_desc_am  text not null default '';
alter table call_categories add column if not exists body_en      text not null default '';
alter table call_categories add column if not exists body_am      text not null default '';

-- Image descriptions (alt text) so photos can appear in Google Images
alter table gallery  add column if not exists alt_en text not null default '';
alter table gallery  add column if not exists alt_am text not null default '';
alter table products add column if not exists image_alt_en text not null default '';
alter table products add column if not exists image_alt_am text not null default '';
