# Norden website upgrade — setup guide

This upgrade adds: mobile/tablet layout, downloadable products (Excel/Word files sold through Chapa), and search-engine (SEO) features. Follow these steps **in order**. Nothing breaks if you do them in a different order, but products will not appear until step 2 is done.

## 1. Put the new code on GitHub
Upload the files from this package into your `legeez/norden` repository (GitHub → *Add file → Upload files*, drag the folders in, keep the folder names). Also **delete the file `.env`** from the repository (GitHub → open `.env` → ⋯ → Delete file). It only held placeholders, but real keys must never be stored in GitHub. Your Cloudflare deployment will start automatically.

## 2. Create the products table and private file storage (once)
1. Supabase → **SQL Editor → New query**.
2. Open `migrations/002_products_and_seo.sql`, copy everything, paste, **Run**.
   This creates the products table, the private `products` storage bucket, and the extra order columns.

## 3. Tell the site its real web address (important for Google)
Cloudflare → *Workers & Pages → norden → Settings → Variables and Secrets → Add*:

| Name | Value |
|------|-------|
| `SITE_URL` | your public address with no trailing slash, e.g. `https://www.nordentrading.com` |

Until you have your own domain, use the `workers.dev` address. When you connect a custom domain later, change this value. The sitemap, canonical links and Google data all use it.

## 4. Upload your products
Admin panel → **Products & Files** → *Add a New Product*. The six ready-made files are in the `product-files/` folder; suggested titles, descriptions (English + Amharic) and prices are in `product-files/CATALOG.md`. Copy them in, choose the file, save. Open the product page on the site and run a test purchase with Chapa's test keys.

## 5. Get found on Google
1. Create a free account at **search.google.com/search-console** → *Add property* → URL prefix → your site address. Verify it (Cloudflare DNS or HTML tag method).
2. In Search Console → **Sitemaps** → enter `sitemap.xml` → Submit.
3. Create a **Google Business Profile** (business.google.com) for Norden Trading Plc in Addis Ababa. This is the single biggest factor for local searches like "BOQ Addis Ababa".
4. In Admin → *Site Content* fill in **Google Search Appearance** (title + description) in English and Amharic.
5. Add real project photos, a logo, and your real phone, email and office address — Google rewards real business details.
6. Ask satisfied clients to leave a Google review.

## What changed (for reference)
* **Pages:** `/` English, `/am` Amharic (separate addresses so Google can index both), `/products`, `/products/<name>`, `/services/<name>`, `/sitemap.xml`, `/robots.txt`.
* **Bug fixed:** the page customers see after paying (`/checkout/return`) was being treated as a service called "return" and showed *Service not found*. Payments were recorded, but customers saw an error.
* **Chapa:** payment descriptions are cleaned (Chapa rejects brackets, & and long dashes).
* **Security:** product files live in a private bucket. A customer gets a link that expires after 2 minutes, only after payment is confirmed, up to 10 downloads per order.
* **Admin:** works on phones; orders show a customer download link (for resending if a customer loses theirs).

## Not included yet (ideas for later)
* Automatic emailing of the download link after payment (needs an email service such as Resend).
* Real project photos, logo and Amharic proofreading by a native speaker.
