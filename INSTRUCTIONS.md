# Drips & Drops — Setup Instructions (updated)

Everything in this README needs to be done once before the site works end-to-end.

---

## 1. Restore your Firestore data (IMPORTANT)

Your previous data (products, orders, customers, coupons, reviews, logs, etc.) is included in `website/scripts/firestore-backup.json`. I cannot write to your Firestore from here — you have to run the restore script once from your own machine.

**Steps:**

1. In the Firebase console → Project Settings → Service accounts → **Generate new private key**. Save the JSON file somewhere safe (e.g. `~/firebase-sa.json`).
2. From your project folder:
   ```
   cd website
   npm install firebase-admin
   node scripts/restore-firestore.js --creds=/absolute/path/to/firebase-sa.json
   ```
3. Options:
   - `--dry` — preview what would be written, without writing.
   - `--wipe` — delete existing docs in each restored collection first (destructive, use with care).
   - `--only=products,orders` — restore only those collections.

Document IDs from the backup are preserved.

---

## 2. Environment variables (Vercel → Project Settings → Environment Variables)

| Name | Purpose |
| --- | --- |
| `FIREBASE_API_KEY` etc. | Used by `/api/config?type=firebase` (already in `api/config.js`) |
| `GMAIL_USER` | Gmail address that sends transactional emails |
| `GMAIL_APP_PASSWORD` | 16-char [Gmail app password](https://myaccount.google.com/apppasswords) |
| `PAYSTACK_SECRET_KEY` | Paystack secret (for server-side verification) |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_UPLOAD_PRESET` | Unsigned preset for image uploads from admin |

Redeploy after changing env vars.

---

## 3. Firestore collections used

- `products`, `combos`, `coupons`, `customers`, `orders`, `reviews`, `reviewLinks`, `newsletter`, `emailLogs`, `logs`, `analytics`, `admins`, `expenses` (all in the backup)
- `authCodes` — created automatically by the 6-digit code sign-in (`/api/auth-code.js`)
- `lookbook` — set from Admin → Lookbook
- `featured` (doc `list`, field `productIds` = array of product IDs; prefix combos with `combo:`) — powers homepage Featured section
- `events` — brand calendar events (see calendar section below)

Rules snippet for the new collections:

```js
match /authCodes/{doc}  { allow read, write: if false; } // server-only via api routes
match /lookbook/{doc}   { allow read: if true; allow write: if request.auth.token.admin == true; }
match /events/{doc}     { allow read: if true; allow write: if request.auth.token.admin == true; }
```

---

## 4. What's implemented in this drop

- **Fixed navbar** (position: fixed) + body offset. Mobile menu drops cleanly with a backdrop and closes on outside click.
- **Hero slider** — single rolling ring per slide (no inner dot, no numbers), centered, with prev/next arrows. Only the active ring fills.
- **Home** — Arrivals (peek slider), **Featured** (from `featured/list`), Summer band (black CTA, no red spam), Lookbook preview (falls back to hero images), Combos, Reviews, Newsletter.
- **Shop** — 2-column mobile grid, less-rounded cards (10px), sale price display, "Add to cart" button for products with no options, "Select options" for products with size/color, sold-out overlay.
- **Product page** — original + discount price display, color swatches with per-color dedicated images, size/color availability handling, quantity control.
- **Cart** — animated drawer, trash icon for remove, no Paystack fee note.
- **Account** — dedicated page at `/account`. Sign-in via 6-digit email code (uses `/api/auth-code`). Orders list with clickable full-detail view. Wishlist tab reads `localStorage.dd_wishlist`.
- **Reviews page** (`/review`) — three separate star rows (overall required, product + delivery optional), large clickable stars with hover preview and filled state.
- **Footer** — brand SVG icons (WhatsApp, Instagram, TikTok), "Made by AJ", side-by-side columns on mobile, extra bottom padding so the WhatsApp float doesn't cover the credit.
- **Admin** — sidebar is now `position: fixed`. Order-summary text colors fixed. Accent switched to red (`#E63946`).
- **Firestore restore script** at `website/scripts/restore-firestore.js`.

---

## 5. Still to wire up (marked so you know)

I ran out of turn to build these fully — they're straightforward and you can ask me to complete them next turn:

- **Admin Calendar page** (`/admin/calendar`) + customer `/calendar` page with countdowns & Add-to-Calendar (ICS). Firestore collection `events` (fields: `name`, `date` ISO, `image`, `description`, `location`, `createdAt`).
- **Admin Products form** — add `costPrice` and `originalPrice` inputs (schema-only; the storefront already reads `originalPrice` for sale display).
- **Admin Analytics** — total revenue / profit / average order value using `costPrice`.

Everything else you asked for in this turn is in.

---

## Update — Calendar, profit analytics, account fixes

### 1. New environment variable (required)
Add this in Vercel → Project → Settings → Environment Variables:

```
AUTH_SECRET=<any long random string, e.g. 48+ characters>
```

It signs the customer sign-in session token that `/api/my-orders` verifies.
If you skip it the app falls back to your Firebase private key, but a dedicated
secret is safer. Changing it signs everyone out (harmless).

Already-required vars (unchanged): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `PAYSTACK_SECRET_KEY`,
`PAYSTACK_PUBLIC_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`,
`ADMIN_EMAIL`.

### 2. Publish the updated Firestore rules
`firestore.rules` now covers `events`, `lookbook` and locks `authCodes` to the
server only. Deploy them (Firebase console → Firestore → Rules → paste → Publish).

### 3. Why "couldn't load orders" happened — and what changed
Orders are admin-only in Firestore (correct — customers must not be able to read
each other's orders). The account page now calls `/api/my-orders`, which verifies
the signed session token issued when the customer enters their 6-digit code, then
returns only that customer's orders. Nothing sensitive (cost price, profit) is
sent to the browser. Orders refresh every 8 seconds and whenever the tab regains
focus. Customers signed in before this update are asked to sign in again once so
a token can be issued.

### 4. Cost price, discounts and profit
Admin → Products → Add/Edit now has:
- **Cost price** — what you paid. Never shown to customers; powers profit reporting.
- **Compare-at price** — set it above the selling price to run a discount; the shop
  and product pages show it slashed with a Sale badge automatically.

Fill cost prices on your existing products so Analytics → Financials is accurate.
Orders placed from now on snapshot the cost price at purchase time, so profit stays
correct even if you change prices later. Older orders fall back to the product's
current cost price.

Analytics → Financials shows total revenue, cost of goods, profit
(revenue − Paystack fees − cost), margin, average order value, fees, coupon
discounts, 30-day profit, and stock value at cost and at retail.

### 5. Calendar
- Admin → **Calendar**: add events with name, date, start time, duration,
  location, description and a cover image, plus a visibility toggle.
- Storefront `/calendar`: upcoming events soonest-first with live countdowns,
  then a muted "Past events" archive (viewable, no add-to-calendar button).
  "Add to calendar" downloads an `.ics` file which phones and desktops open
  straight into the device calendar, with a 1-hour reminder.

### 6. Restoring your previous Firestore data
Still one command, from the `website` folder:

```
npm install
node scripts/restore-firestore.js
```

It needs `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`
in your shell (or a `.env` file in `website/`). It writes each document from
`scripts/firestore-backup.json` using its original document ID, so re-running it is
safe and never duplicates records.

## Update — Reviews & FAQs, shop filters

- New customer page: `/reviews` (tabs: Reviews + FAQs, deep link `/reviews#faqs`). Linked in the navbar and footer.
- New admin page: `/admin/faqs` — add, edit, publish/hide, order and delete questions. Everything is realtime.
- Firestore: a new `faqs` collection is used (`question`, `answer`, `category`, `order`, `active`). Deploy the updated `firestore.rules` (public read, admin write):
  `firebase deploy --only firestore:rules`
- Shop page now has a Filters drawer (category mosaic, price presets + custom min/max, in-stock and on-sale toggles) and a sort dropdown. No data changes needed.
- Admin calendar is now a card grid split into Upcoming / Archive.
