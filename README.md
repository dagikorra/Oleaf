# Oleaf Cleaning

Static front end plus a small Node backend for v1 reservation and staff workflows.

## Run locally

```powershell
npm install
npm start
```

Open `http://127.0.0.1:8080`.

## Deploy with Render

This repo includes `render.yaml`, so Render can run the frontend and backend together from GitHub.

1. Go to Render and create a **New Blueprint**.
2. Connect the `dagikorra/Oleaf` GitHub repository.
3. Select the `oleaf-cleaning` service from the blueprint.
4. Set these secret environment variables:

```text
ADMIN_PASSWORD=choose-a-strong-password
CLEANER_PASSWORD=choose-a-strong-password
```

5. Deploy.

Render will install dependencies, run `npm start`, and serve the site and API from the same URL. The booking form will call `/api/reservations` automatically on that deployed URL.

The blueprint also creates a Render Postgres database and injects its connection string as `DATABASE_URL`. When `DATABASE_URL` exists, reservations are stored in Postgres. Without it, local development falls back to `data/reservations.json`.

## Demo staff accounts

```text
Admin: oleafcleaning@gmail.com / cleaningv1
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
FROM_EMAIL=oleafcleaning@gmail.com
ADMIN_EMAIL=oleafcleaning@gmail.com
```

GitHub Pages can host the static site, but it cannot run this backend. For the full reservation/email/login workflow, use the Render deployment instead of GitHub Pages.
