# Oleaf Cleaning

Static front end plus a small Node backend for v1 reservation and staff workflows.

## Run locally

```powershell
npm install
npm start
```

Open `http://127.0.0.1:8080`.

## Demo staff accounts

```text
Admin: manager@oleafcleaning.com / cleaningv1
Cleaner: cleaner@oleafcleaning.com / cleaningv1
```

## Email behavior

When a reservation is submitted, the backend creates two notifications:

- customer confirmation email
- admin reservation email

Without SMTP settings, emails are written to `data/outbox/` as `.eml` files for local testing.

To send real email, set these environment variables before `npm start`:

```text
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=reservations@oleafcleaning.com
ADMIN_EMAIL=manager@oleafcleaning.com
```

GitHub Pages can host the static site, but it cannot run this backend. Deploy the backend to a Node host such as Render, Railway, Fly.io, or a VPS, then set `window.OLEAF_API_BASE` in the front end to that backend URL.
