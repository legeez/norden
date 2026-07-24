-- Norden Trading Plc — Supabase schema
-- Run this ONCE in Supabase: Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Re-running it is safe for the `content` table (it skips existing keys), but the
-- services/blocks inserts below will create duplicates if run twice — if you need to
-- re-seed, delete the rows from those tables first, or just edit content from /admin instead.

create table if not exists content (
  key text primary key,
  value_en text,
  value_am text
);

create table if not exists services (
  id serial primary key,
  order_num integer not null default 0,
  title_en text not null,
  title_am text,
  desc_en text,
  desc_am text,
  price numeric not null default 0,
  currency text not null default 'ETB',
  image text,
  active boolean not null default true
);

create table if not exists blocks (
  id serial primary key,
  section text not null,            -- 'about_features' | 'why_us' | 'process'
  order_num integer not null default 0,
  title_en text,
  title_am text,
  body_en text,
  body_am text
);

create table if not exists gallery (
  id serial primary key,
  order_num integer not null default 0,
  image text not null,
  caption_en text,
  caption_am text
);

create table if not exists orders (
  id serial primary key,
  service_id integer,
  service_title text,
  customer_name text,
  customer_email text,
  customer_phone text,
  amount numeric,
  currency text,
  tx_ref text unique not null,
  status text not null default 'pending',   -- 'pending' | 'paid' | 'failed'
  created_at timestamptz not null default now()
);

-- Lock the tables down from the public API (anon/authenticated roles).
-- The app talks to Supabase using the SERVICE ROLE key, which always bypasses
-- Row Level Security, so the site keeps working — this just stops anyone else
-- from reading or writing your data directly through Supabase's REST API.
alter table content  enable row level security;
alter table services enable row level security;
alter table blocks   enable row level security;
alter table gallery  enable row level security;
alter table orders   enable row level security;

-- ---------- Seed data (safe to re-run: skips rows that already exist) ----------

insert into content (key, value_en, value_am) values
  ('company_name', 'Norden Trading Plc', 'ኖርደን ትሬዲንግ አ.ማ'),
  ('hero_eyebrow', 'Construction & Quantity Surveying · Addis Ababa', 'ግንባታ እና የመጠን ዳሰሳ · አዲስ አበባ'),
  ('hero_title', 'From Drawing To Bill, From Site To Structure', 'ከንድፍ ወደ ዝርዝር፣ ከቦታ ወደ ህንፃ'),
  ('hero_subtitle', 'Norden Trading Plc builds and manages construction projects in Addis Ababa, and gives contractors, developers and owners the technical paperwork that keeps a project honest: bills of quantities, cost estimates, tender documents and contractor payment certificates.', 'ኖርደን ትሬዲንግ አ.ማ በአዲስ አበባ የግንባታ ፕሮጀክቶችን ይገነባል እንዲሁም ያስተዳድራል፤ ለተቋራጮች፣ ለገንቢዎች እና ለባለቤቶች ፕሮጀክቱን ግልጽ የሚያደርግ የቴክኒክ ሰነድ ያዘጋጃል፦ የመጠን ዝርዝር (BOQ)፣ የወጪ ግምት፣ የጨረታ ሰነዶች እና የተቋራጭ ክፍያ ማረጋገጫዎች።'),
  ('about_title', 'Norden Trading Plc', 'ኖርደን ትሬዲንግ አ.ማ'),
  ('about_body', 'A construction and building company based in Addis Ababa, Ethiopia. We take on building works directly, and support other contractors, developers, and property owners with the technical and financial documentation their projects need.', 'በአዲስ አበባ፣ ኢትዮጵያ የተመሰረተ የግንባታ ኩባንያ ነው። የግንባታ ስራዎችን በቀጥታ እናከናውናለን፤ እንዲሁም ለሌሎች ተቋራጮች፣ ገንቢዎች እና የንብረት ባለቤቶች የሚያስፈልጋቸውን የቴክኒክ እና የገንዘብ ሰነድ እናዘጋጃለን።'),
  ('about_image', '', ''),
  ('contact_office', 'Add street address, sub-city — Addis Ababa, Ethiopia', 'የመንገድ አድራሻ፣ ክፍለ ከተማ — አዲስ አበባ፣ ኢትዮጵያ ይጨምሩ'),
  ('contact_phone', '+251 XX XXX XXXX', '+251 XX XXX XXXX'),
  ('contact_email', 'info@nordentrading.et', 'info@nordentrading.et'),
  ('contact_hours', 'Monday – Saturday, 8:30 – 17:30', 'ሰኞ – ቅዳሜ፣ 8:30 – 17:30'),
  ('footer_tagline', 'Construction and quantity surveying services based in Addis Ababa, Ethiopia.', 'በአዲስ አበባ፣ ኢትዮጵያ የተመሰረተ የግንባታ እና የመጠን ዳሰሳ አገልግሎት።')
on conflict (key) do nothing;

insert into services (order_num, title_en, title_am, desc_en, desc_am, price, currency, active) values
  (1, 'Quantity Take-Off', 'መጠን ማውጣት (Take-Off)', 'Measuring architectural, structural and MEP drawings into precise, itemized quantities.', 'የስነ-ህንፃ፣ የመዋቅር እና የMEP ንድፎችን በትክክለኛ እና በዝርዝር ወደ መጠን እንለውጣለን።', 3500, 'ETB', true),
  (2, 'Bill of Quantities (BOQ)', 'የመጠን ዝርዝር (BOQ)', 'Full BOQ preparation in standard formats accepted by banks, government offices and private clients.', 'በባንኮች፣ በመንግስት መስሪያ ቤቶች እና በግል ደንበኞች ተቀባይነት ባለው መደበኛ ቅርጸት BOQ እናዘጋጃለን።', 6500, 'ETB', true),
  (3, 'Cost Estimation', 'የወጪ ግምት', 'Preliminary and detailed cost estimates benchmarked against current Addis Ababa material and labor rates.', 'በአዲስ አበባ ወቅታዊ የቁሳቁስ እና የሰራተኛ ዋጋ ላይ የተመሰረተ ቅድመ እና ዝርዝር የወጪ ግምት እናዘጋጃለን።', 4000, 'ETB', true),
  (4, 'Bid & Tender Preparation', 'የጨረታ ዝግጅት', 'Complete tender packages — pricing, technical proposal support and compliance documents.', 'የተሟላ የጨረታ ሰነድ — ዋጋ አሰጣጥ፣ የቴክኒክ ሃሳብ ድጋፍ እና የተገዥነት ሰነዶች እናዘጋጃለን።', 5500, 'ETB', true),
  (5, 'Contractor Payment Processing', 'የተቋራጭ ክፍያ ሂደት', 'Interim payment certificates, work valuation, and processing of contractor claims.', 'የመካከለኛ ጊዜ ክፍያ ማረጋገጫ፣ የስራ ግምገማ እና የተቋራጭ ጥያቄ ሂደት እናከናውናለን።', 3000, 'ETB', true)
on conflict do nothing;

insert into blocks (section, order_num, title_en, title_am, body_en, body_am) values
  ('about_features', 1, 'Building Construction', 'የህንፃ ግንባታ', 'Direct execution of residential, commercial and institutional building projects in Addis Ababa and surrounding areas.', 'በአዲስ አበባ እና በአካባቢዋ የመኖሪያ፣ የንግድ እና የተቋም ህንፃ ፕሮጀክቶችን በቀጥታ እናስፈጽማለን።'),
  ('about_features', 2, 'Construction Consultancy', 'የግንባታ አማካሪነት', 'Independent quantity surveying and cost consultancy for owners, developers and contracting firms.', 'ለባለቤቶች፣ ገንቢዎች እና ተቋራጭ ድርጅቶች ገለልተኛ የመጠን ዳሰሳ እና የወጪ አማካሪነት አገልግሎት እንሰጣለን።'),
  ('about_features', 3, 'Documentation You Can Defend', 'ማስረጃ ማቅረብ የሚችል ሰነድ', 'Every BOQ, estimate and payment certificate we issue is built to hold up under audit, bank review, or dispute.', 'የምናዘጋጀው እያንዳንዱ ሰነድ በኦዲት፣ በባንክ ግምገማ ወይም በክርክር ወቅት የሚጸና ሆኖ ነው የተዘጋጀው።'),
  ('why_us', 1, 'Addis Ababa Market Rates', 'የአዲስ አበባ የገበያ ዋጋ', 'Estimates benchmarked against current local material and labor costs, not generic templates.', 'ግምቶች በአሁኑ አካባቢያዊ የቁሳቁስ እና የሰራተኛ ወጪ ላይ የተመሰረቱ ናቸው።'),
  ('why_us', 2, 'Bilingual Documentation', 'ባለሁለት ቋንቋ ሰነድ', 'Documents prepared in English and Amharic so every stakeholder can read them.', 'ሰነዶች በእንግሊዝኛ እና በአማርኛ ይዘጋጃሉ።'),
  ('why_us', 3, 'Transparent Process', 'ግልጽ ሂደት', 'Every rate and quantity is traceable back to a drawing or a site measurement.', 'እያንዳንዱ ዋጋ እና መጠን ወደ ንድፍ ወይም የቦታ ልኬት ተመልሶ የሚገኝ ነው።'),
  ('why_us', 4, 'One Team, Full Cycle', 'አንድ ቡድን፣ ሙሉ ዑደት', 'The same team that takes off your quantities can carry the project through bidding and payment.', 'መጠንዎን የሚያወጣው ቡድን ፕሮጀክቱን በጨረታ እና በክፍያ ውስጥ ይመራል።'),
  ('process', 1, 'Consultation', 'ምክክር', 'We review your drawings, scope and timeline, and agree which deliverables you need.', 'ንድፎችዎን እና ወሰንዎን እንገመግማለን፤ የሚያስፈልጉዎትን ውጤቶች እንስማማለን።'),
  ('process', 2, 'Take-Off & Measurement', 'መጠን ማውጣት', 'Our team measures every element from the drawings and site data into structured quantities.', 'ቡድናችን ከንድፎች እያንዳንዱን ክፍል ወደ ተዋቀረ መጠን ይለውጣል።'),
  ('process', 3, 'Pricing & Documentation', 'ዋጋ አሰጣጥ እና ሰነድ', 'Quantities are priced against current market rates and compiled into BOQ, estimate or tender documents.', 'መጠኖች በወቅታዊ የገበያ ዋጋ ላይ ተመስርተው ወደ ሰነድ ይቀናጃሉ።'),
  ('process', 4, 'Delivery & Follow-Up', 'ርክክብ እና ክትትል', 'You receive the final documents, and we stay available for revisions or payment certificates.', 'የመጨረሻ ሰነዶችን ይቀበላሉ፤ ለክለሳ ወይም ለክፍያ ማረጋገጫ ዝግጁ ሆነን እንቆያለን።')
on conflict do nothing;

-- Session storage for the admin login (so sessions survive across multiple
-- Cloud Run instances, instead of living only in one instance's memory).
create table if not exists sessions (
  sid text primary key,
  sess jsonb not null,
  expire timestamptz not null
);
alter table sessions enable row level security;
