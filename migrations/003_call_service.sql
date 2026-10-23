-- Norden Trading — call service (live + scheduled calls)
-- Run this ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- It is safe to run more than once.

-- 1. Settings editable from Admin -> Call Settings (simple key/value rows)
create table if not exists call_settings (
  key    text primary key,
  value  text not null default ''
);
alter table call_settings enable row level security;

-- 2. Call bookings (one row per live request or scheduled slot)
create table if not exists call_bookings (
  id             bigint generated always as identity primary key,
  call_type      text not null check (call_type in ('live', 'scheduled')),
  channel        text not null default 'phone',        -- phone | whatsapp
  customer_name  text not null,
  customer_email text not null,
  customer_phone text not null,
  topic          text not null default '',
  slot_start     timestamptz,                          -- null for live calls
  duration_min   integer not null default 0,
  amount         numeric(12,2) not null default 0,
  currency       text not null default 'ETB',
  tx_ref         text not null unique,
  status         text not null default 'pending',      -- payment: pending | paid | failed
  call_status    text not null default 'new',          -- new | confirmed | done | cancelled
  admin_note     text not null default '',
  lang           text not null default 'en',
  paid_at        timestamptz,
  created_at     timestamptz not null default now()
);
alter table call_bookings enable row level security;

-- Two customers can never hold the same scheduled slot. Failed payments and
-- cancelled calls release the slot automatically.
create unique index if not exists call_bookings_slot_idx
  on call_bookings (slot_start)
  where call_type = 'scheduled' and status in ('pending', 'paid') and call_status <> 'cancelled';

create index if not exists call_bookings_created_idx on call_bookings (created_at desc);

-- 3. Call types ("what do you need help with?"), managed in Admin -> Call Types
create table if not exists call_categories (
  id            bigint generated always as identity primary key,
  title_en      text not null,
  title_am      text not null default '',
  desc_en       text not null default '',
  desc_am       text not null default '',
  live_price      numeric(12,2),            -- empty = use the default price from Call Settings
  scheduled_price numeric(12,2),
  live_minutes    integer,                  -- empty = use the default length from Call Settings
  active        boolean not null default true,
  order_num     integer not null default 1,
  created_at    timestamptz not null default now()
);
alter table call_categories enable row level security;

alter table call_bookings add column if not exists category_id    bigint;
alter table call_bookings add column if not exists category_title text not null default '';

-- Starter call types (only when the table is empty). Edit or delete them in the admin panel.
insert into call_categories (title_en, title_am, desc_en, desc_am, order_num)
select * from (values
  ('Process, steps and licensing', 'የአሰራር ሂደት፣ ደረጃዎች እና ፈቃድ',
   'How to process something, the steps to follow, and where to get your professional license.',
   'አንድን ጉዳይ እንዴት ማስኬድ እንደሚቻል፣ መከተል ያለብዎት ደረጃዎች እና የሙያ ፈቃድ ከየት እንደሚገኝ።', 1),
  ('Technical construction questions', 'የግንባታ ቴክኒካዊ ጥያቄዎች',
   'Ask a construction expert about methods, design, quality, specifications and site problems.',
   'ስለ የግንባታ ዘዴ፣ ዲዛይን፣ ጥራት፣ ስፔስፊኬሽን እና የሳይት ችግሮች ባለሙያ ይጠይቁ።', 2),
  ('Material, labor and machinery costs', 'የዕቃ፣ የሰው ጉልበት እና የማሽን ወጪ',
   'Current rates and cost advice for materials, labor and machinery for your project.',
   'ለፕሮጀክትዎ የዕቃ፣ የሰው ጉልበት እና የማሽን ወቅታዊ ዋጋ እና የወጪ ምክር።', 3)
) as v(title_en, title_am, desc_en, desc_am, order_num)
where not exists (select 1 from call_categories);
