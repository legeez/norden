# Norden Trading Plc — Website with Admin Panel & Chapa Checkout

A bilingual (English/Amharic) website for Norden Trading Plc with:
- A public site: company profile, services, process, why-us, project gallery, contact.
- A password-protected **admin panel** at `/admin` to edit every piece of text, service, price, and photo — no code required.
- **Checkout with Chapa**: each service has a "Buy Now" button that takes the customer through Chapa's secure hosted payment page.
- **Supabase** for the database, photo storage, *and* login sessions, so everything survives redeploys and works correctly no matter how many server instances are running at once.
- Deployed on **Cloudflare Pages** — free, commercial use allowed, and (unlike Render/Netlify's free tiers) actually built for production traffic.

---

## 1. Set up your Supabase project (database + photo storage)

1. Go to **https://supabase.com**, sign up, and create a new project.
2. **SQL Editor → New query**, paste in the entire contents of `schema.sql`, and click **Run**. This creates all the tables (content, services, page sections, gallery, orders, and sessions) and seeds them with the site's starting content.
3. **Storage → New bucket**. Name it `media`, toggle **Public bucket** on, click **Create bucket**.
4. **Settings → API** — you'll need:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (not the `anon` key) → `SUPABASE_SERVICE_ROLE_KEY`

**Important:** the service_role key bypasses all security rules. It only ever belongs in server-side environment variables — never in a browser, never in a public repo.

---

## 2. Run it on your own computer first

You'll need [Node.js](https://nodejs.org) 18+.

```bash
cd norden-trading-website
npm install
cp .env.example .env
```

Fill in `.env`:
- `ADMIN_PASSWORD` — your `/admin` login password
- `SESSION_SECRET` — any long random string
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from step 1
- `CHAPA_SECRET_KEY` — see step 3 below; you can leave the placeholder for now

Then:

```bash
npm start
```

This runs `build:templates` automatically (bundles every `.ejs` file into `worker/templates.generated.js`, so the exact same rendering code path runs locally and on Cloudflare) and starts the server. Visit **http://localhost:3000**, and **http://localhost:3000/admin** for the admin panel.

---

## 3. Get your Chapa account & API key

1. Sign up at **https://dashboard.chapa.co** and complete merchant verification (start this early — it can take a bit).
2. **Settings → API Keys** → copy the **Test Secret Key** (`CHASECK_TEST-...`). The easiest way is to paste it in **Admin → Payments** (use *Save and test*); a key saved there is used first. Alternatively set it as `CHAPA_SECRET_KEY` in `.env` or as a Cloudflare secret. Switch to the **Live** key once you're ready to accept real payments.
3. Docs: https://developer.chapa.co

---

## 4. Deploy to Cloudflare Pages

### One-time setup

```bash
npx wrangler login
```

This opens a browser to connect Wrangler (Cloudflare's CLI, already listed in this project's `devDependencies`) to your Cloudflare account.

### Configure secrets

Cloudflare needs the same values as your `.env` file, set as **Pages secrets** (never committed, never visible in the dashboard after saving):

```bash
npx wrangler pages secret put SESSION_SECRET
npx wrangler pages secret put ADMIN_PASSWORD
npx wrangler pages secret put SUPABASE_URL
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler pages secret put SUPABASE_BUCKET
npx wrangler pages secret put CHAPA_SECRET_KEY
npx wrangler pages secret put APP_BASE_URL
```

Each command will prompt you to paste the value and asks which Pages project — the first time, Wrangler will offer to create one; call it `norden-trading-website` to match `wrangler.toml`. For `APP_BASE_URL`, use your Cloudflare Pages URL (e.g. `https://norden-trading-website.pages.dev`) — you'll get the exact address after your first deploy, so you can set this one after step 5 and redeploy once.

### Deploy

```bash
npm run cf:deploy
```

This bundles the templates and runs `wrangler pages deploy public`, which uploads your `/public` folder as static assets (served directly from Cloudflare's edge — your CSS never touches the app code) and bundles `functions/[[path]].js` — a catch-all that runs your actual Express app for every other request.

### Try it locally against the real Workers runtime first (recommended)

Before deploying, you can run the exact Cloudflare environment (not just plain Node) on your own machine:

```bash
npm run cf:dev
```

This is worth doing once — it catches anything that behaves differently on Workers before it's live.

---

## 5. Using the admin panel

Go to `yourdomain.pages.dev/admin`, log in with your `ADMIN_PASSWORD`.

- **Site Content** — hero text, about section, contact details, footer.
- **Services & Prices** — add, edit, delete, hide services; this is what customers see and pay for.
- **Page Sections** — the "Company Profile" list, "Why Us" cards, and "Process" steps.
- **Project Gallery** — upload project photos shown on the homepage.
- **Orders** — every checkout attempt and whether Chapa confirmed payment.

Everything is bilingual — most fields have separate English and Amharic boxes.

---

## 6. How the checkout actually works

1. A customer clicks **Buy Now** on a service → fills in name, email, phone.
2. The server creates an order (status `pending`) in Supabase and asks Chapa to start a transaction.
3. The customer is redirected to Chapa's own secure payment page — you never handle card details directly.
4. After paying, Chapa redirects them back to your site, **and** separately calls `/chapa/webhook` — the app re-verifies the payment with Chapa both times before marking an order `paid`, so a customer can't fake a successful payment by just visiting the "success" URL.
5. You see the result in **Admin → Orders**.

---

## 7. A note on how rendering works (worth understanding if you ever edit the code)

Cloudflare Workers can't read files off a real disk, and won't run `eval()`/`new Function()` while handling a request — both of which a normal Express + EJS setup relies on. To make this actually work on Cloudflare rather than hoping it does, the app is built a little differently from a typical Node app:

- `scripts/build-templates.js` bundles every `.ejs` file's source text into one file (`worker/templates.generated.js`) at build time.
- `lib/render.js` compiles all of them **once**, when the app starts — which Cloudflare explicitly allows (the `allow_eval_during_startup` flag in `wrangler.toml` exists for exactly this pattern). After that, rendering a page is just calling an ordinary function — no further compilation, no filesystem.
- Every route calls `render(name, data)` and sends the result with `res.send(...)`, instead of Express's built-in `res.render(...)`.

This is genuinely newer territory for Cloudflare — Express support on Workers only became viable in the last year. I've tested every route and every read/write path against a simulated backend and everything renders and saves correctly, but I can't run the actual Cloudflare network from where I built this. **If your first real deploy throws an error, send it to me and I'll fix it** — that's the one part of this project I'd genuinely flag as "should work, first deploy is the real test."

---

## 8. What's still worth doing before you go fully live

- Replace placeholder contact info, logo, and project photos via the admin panel.
- Have a native Amharic speaker proofread the Amharic text.
- Decide whether you want email notifications when an order comes in — currently orders only show in the admin Orders page.
- Switch `CHAPA_SECRET_KEY` from test to live once Chapa verification is done.

---

## Project structure

```
schema.sql                     Run once in Supabase's SQL Editor — creates tables + seed content
server.js                       Express app (exported — used by both Node and Cloudflare)
wrangler.toml                    Cloudflare Pages configuration
functions/[[path]].js             Cloudflare Pages Function — runs the Express app on Workers
scripts/build-templates.js         Bundles views/*.ejs into worker/templates.generated.js
lib/render.js                       Precompiles + renders the bundled templates (no fs, no per-request eval)
lib/supabaseClient.js                Supabase connection (service role key)
lib/store.js                          All database reads/writes (content, services, blocks, gallery, orders, sessions)
lib/sessionStore.js                    express-session store backed by Supabase
lib/upload.js                           Uploads photos to Supabase Storage, returns their public URL
lib/chapa.js                             Chapa API wrapper (initialize + verify)
lib/auth.js                               Admin login check
routes/public.js                     Homepage
routes/checkout.js                    Checkout + Chapa webhook
routes/admin.js                        All /admin pages
views/                                    EJS templates (source of truth — bundled at build time)
public/css/style.css                      Public site styling (served as a static asset on Cloudflare)
public/css/admin.css                      Admin panel styling (same)
```


## Products, mobile layout and SEO (October 2026 upgrade)

See **docs/UPGRADE-GUIDE.md** for the step-by-step setup (run `migrations/002_products_and_seo.sql`, set `SITE_URL`, upload products, submit the sitemap to Google).

* Public pages are served per language: `/` (English) and `/am` (Amharic). `lib/render.js` removes the other language from the HTML on the server.
* SEO helpers (titles, canonical links, hreflang, schema.org data) live in `lib/seo.js`; `/sitemap.xml` and `/robots.txt` are generated in `routes/public.js`.
* Product files are stored in a **private** Supabase bucket (`products`) and served through short-lived signed links after payment is confirmed (`routes/checkout.js`, `lib/files.js`).
* New templates must be registered in `scripts/build-templates.js` (`LOCALS_KEYS`).

## Call service (live + scheduled calls)

Customers open **Book a Call** (`/call`, `/am/call`), choose a **live call** or a **scheduled call**, pay with Chapa, and:

- **Live:** after paying, call buttons (phone / WhatsApp) appear. Your numbers are never shown before payment. Turn live calls on/off with the switch at the top of **Admin → Calls**.
- **Scheduled:** the customer picks a day and a free time slot; double booking is impossible. You call them back at that time.

**Call types:** before choosing live or scheduled, the customer picks what they need help with (for example process and licensing, technical questions, material/labor/machinery costs). You add, edit, reorder, hide and delete these in **Admin → Call Types**, in English and Amharic. Each type can have its own live price, scheduled price and live-call length; an empty price uses the default from Call Settings. Three starter types are created by the SQL file.

Everything else is edited in the admin panel: **Admin → Call Settings** (prices, slot length, working days and hours, your numbers, notifications) and **Admin → Calls** (bookings, status, notes).

Setup (all free):
1. Run `migrations/003_call_service.sql` once in the Supabase SQL Editor.
2. In **Call Settings** enter your phone and WhatsApp numbers, prices and working hours.
3. Optional notifications (each has an on/off switch in Call Settings):
   - **Telegram:** create a bot with @BotFather, send it a message, set the secret `TELEGRAM_BOT_TOKEN`, and put your chat id in Call Settings.
   - **Email (Resend free tier):** set the secret `RESEND_API_KEY` and your address in Call Settings. Until you verify your own domain in Resend, mail can only be sent to the address you used to sign up there.
   - Set secrets with `npx wrangler secret put TELEGRAM_BOT_TOKEN` (and `RESEND_API_KEY`).

All times are Addis Ababa time on the standard clock.

## Look and feel

The public site uses the **Light and clean** palette: white header and pages, light peach hero banners, a dark footer, and the orange accent (`#FF5A1F`). All colors are variables at the top of `public/css/style.css` (`--ink`, `--paper`, `--paper-2`, `--peach`, `--orange`...), so the palette can be changed in one place. The admin panel keeps its own styles in `public/css/admin.css`.

## SEO (Google)

Every public page already has a unique title and description, a canonical address, English and Amharic (`hreflang`) alternates, social-sharing tags, structured data (`schema.org`) and an entry in `/sitemap.xml`.

What each admin area controls:

- **Services & Prices, Products & Files, Call Types:** each form has a **Google search text (SEO)** box (optional). Type a Google title (about 60 characters) and description (about 155) in English and Amharic; if left empty, the website writes one automatically. Services and products keep their own pages (`/services/...`, `/products/...`).
- **Call Types:** each call type has its own page, `/call/<call-type>` (and `/am/call/...`), with the **Page text** you write, prices, how it works and links to the other call types. It is listed in the sitemap and linked from the home page.
- **Page Sections:** the "how we work" steps are published to Google as a step-by-step guide on the home page and on every service page.

Setup: run `migrations/004_seo.sql` once in the Supabase SQL Editor (the site keeps working without it, but the SEO boxes only save after it). After deploying, add your site in Google Search Console and submit `https://YOUR-SITE/sitemap.xml`. Set `SITE_URL` to your real domain once you have one.

**Image descriptions (alt text):** Project Gallery photos and product cover images have a **description for Google** (English and Amharic). Google cannot see pictures, so it reads this text to understand the photo and to show it in Google Images. Describe what the photo shows and where. Photos and product images are also listed in `/sitemap.xml`. These fields are part of `migrations/004_seo.sql`: run it again if you ran it earlier (it is safe to repeat).

## Menus and page builder

Run `migrations/005_page_builder.sql` once in the Supabase SQL Editor. Until you do, the website keeps its current menu and page order and nothing breaks.

- **Admin → Menus:** edit the top menu, the orange menu button and the footer links. Add, rename (English and Amharic), hide, remove, choose where each link goes (a section of the home page, a page, a service, a call type, a page you built, or any address) and drag rows (or use the arrows) to change the order. The order saves by itself.
- **Admin → Pages → Home page:** the sections of the home page as a list. Drag to reorder, **Hide** to take a section off the page without losing it, **Remove** to delete it (you can add it back), and **Add a section** to bring back a built-in section or create a new one: *Text block*, *Image and text*, *Cards*, *Call to action banner* or *Questions and answers*, all in English and Amharic.
- **Admin → Pages → Create a new page:** make your own pages (address `/p/your-page`) from the same sections. They get their own Google title and description, appear in `sitemap.xml`, and can be linked from the Menus page.
- The text of the built-in sections (hero, about, services, templates, projects, contact...) is still edited where it always was (Site Content, Services & Prices, Products & Files, Page Sections, Project Gallery). The builder only decides whether they show and in which order.

**Menu order and home page order:** the order of the main menu also sets the order of the home page sections its links point to. If you move *Contact* above *Services* in **Admin → Menus**, the Contact section moves above Services on the home page. Only the sections the menu links to (for example `/#services`) move, among the places they already occupy; the hero, the strip and sections that are not in the menu stay where they are. Moving sections in **Admin → Pages** does not change the menu. Use **Match home page to this menu now** on the Menus page to apply the menu order at any time.
