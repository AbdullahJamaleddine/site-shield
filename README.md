# Drips & Drops — rebuilt (full-feature edition)

Vanilla HTML/CSS/JS storefront on the **same Firebase project** as before, so
every existing collection (`products`, `orders`, `combos`, `coupons`,
`reviews`, `reviewTokens`, `customers`, `carts`, `newsletter`, `logs`) is
preserved and now surfaced in the admin panel.

## What's new in this build
- Clean URLs (no `.html`) — `/`, `/shop`, `/product`, `/checkout`, `/contact`, `/admin/*`
- No dedicated cart page — cart is an **icon** in the navbar that opens a **sidebar drawer**
- **Contact page** with WhatsApp, Instagram, Snapchat, TikTok
- **Floating WhatsApp button** on every page (0707 582 6790)
- Checkout adds **Paystack fee (1.5% + ₦120)** to the total
- Full **order detail** view in admin (customer, delivery, items with images, payment refs, timeline, quick actions)
- Admin brings back **total revenue**, **analytics**, **email logs**, plus dedicated pages for **customers**, **newsletter**, **reviews**, **coupons**, **combos**, **activity logs**
- Every `send-email` call is written to a new `emailLogs` collection

## Stack
- HTML/CSS/vanilla JS (no bundler)
- Firebase (Firestore + Auth) — **same project as before**
- Cloudinary (unsigned upload preset, admin only)
- Paystack inline + server-verified
- Nodemailer via Gmail SMTP
- Vercel (static + serverless functions in `api/`)

## Environment variables
```
ADMIN_EMAIL
EMAIL_USER
EMAIL_PASS
PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY
CLOUDINARY_UPLOAD_PRESET
CLOUDINARY_CLOUD_NAME
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

## Deploy
1. Copy your existing env vars into the Vercel project (same values as before).
2. Paste `firestore.rules` into Firebase Console → Firestore → Rules.
3. `vercel --prod`
