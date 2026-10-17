-- Norden Trading — downloadable products + SEO fields
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- It is safe to run more than once.

-- 1. Products (Excel / Word / PDF files customers buy and download)
create table if not exists products (
  id          bigint generated always as identity primary key,
  slug        text not null unique,               -- readable web address: /products/<slug>
  category    text not null default 'other',      -- boq | cost_breakdown | agreement | other
  title_en    text not null,
  title_am    text not null default '',
  desc_en     text not null default '',
  desc_am     text not null default '',
  price       numeric(12,2) not null default 0,
  currency    text not null default 'ETB',
  file_path   text not null default '',           -- location inside the private "products" bucket
  file_name   text not null default '',
  file_type   text not null default '',           -- XLSX, DOCX, PDF ...
  file_size   bigint not null default 0,
  image       text not null default '',
  active      boolean not null default true,
  order_num   integer not null default 1,
  created_at  timestamptz not null default now()
);
-- Same lock-down as the other tables: no public API access; the server uses the service role key.
alter table products enable row level security;

-- 2. Orders can now be for a product, and carry a private download link
alter table orders add column if not exists item_type      text    not null default 'service';
alter table orders add column if not exists product_id     bigint;
alter table orders add column if not exists download_token text;
alter table orders add column if not exists download_count integer not null default 0;
alter table orders alter column service_id drop not null;   -- product orders have no service
create unique index if not exists orders_download_token_idx on orders (download_token) where download_token is not null;

-- 3. Private storage bucket for the files themselves (NOT public)
insert into storage.buckets (id, name, public)
values ('products', 'products', false)
on conflict (id) do nothing;

-- 4. Homepage "Google search appearance" fields (editable in Admin -> Site Content)
insert into content (key, value_en, value_am) values
  ('seo_title', '', ''),
  ('seo_description', '', '')
on conflict (key) do nothing;
