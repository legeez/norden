-- Norden Trading — editable menus and page builder
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- It is safe to run more than once. Until you run it the website keeps its
-- current menu and page order, so nothing breaks.

-- 1. Menus (Admin -> Menus): header links, the header button and the footer "Explore" links
create table if not exists nav_items (
  id         bigint generated always as identity primary key,
  location   text not null check (location in ('header', 'footer', 'cta')),
  label_en   text not null,
  label_am   text not null default '',
  url        text not null default '/',
  new_tab    boolean not null default false,
  visible    boolean not null default true,
  order_num  integer not null default 1
);
alter table nav_items enable row level security;

-- 2. Pages you create yourself (Admin -> Pages). The home page always exists.
create table if not exists pages (
  id            bigint generated always as identity primary key,
  slug          text not null unique,
  title_en      text not null,
  title_am      text not null default '',
  seo_title_en  text not null default '',
  seo_title_am  text not null default '',
  seo_desc_en   text not null default '',
  seo_desc_am   text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table pages enable row level security;

-- 3. The sections on each page, in order (page_slug 'home' is the home page)
create table if not exists page_sections (
  id         bigint generated always as identity primary key,
  page_slug  text not null,
  kind       text not null,
  config     jsonb not null default '{}'::jsonb,
  visible    boolean not null default true,
  order_num  integer not null default 1
);
alter table page_sections enable row level security;
create index if not exists page_sections_page_idx on page_sections (page_slug, order_num);
