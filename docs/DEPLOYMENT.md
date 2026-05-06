# BlackCrow Deployment

BlackCrow can run as a single Node web service or as static frontend files plus Vercel serverless API adapters.

Locally, `backend/server.js` serves both static pages and `/api` routes. On Vercel, `npm run build` copies the frontend into `public/`, while the top-level files in `api/` forward requests into the same backend handler.

## Required Production Values

Set these in the host dashboard:

```text
NODE_ENV=production
DATABASE_URL=postgresql://...
DATABASE_SSL=true
PUBLIC_APP_URL=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=BlackCrow <verified@yourdomain.com>
PAYMENT_PROVIDER=paystack
PAYSTACK_SECRET_KEY=sk_...
INTERNAL_API_SECRET=long-random-secret
```

`PUBLIC_APP_URL` is used for payment return URLs. `ALLOWED_ORIGINS` controls production CORS.

## Vercel

Use these project settings:

```text
Build command: npm run build && npm run check
Output directory: public
Install command: npm install
```

After deployment, set:

```text
PUBLIC_APP_URL=https://your-vercel-domain.vercel.app
ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
```

For a custom domain, change both values to the final custom domain.

## Database

Run migrations after setting `DATABASE_URL`:

```bash
npm run migrate
```

For Neon, use the pooled connection string and set:

```text
DATABASE_SSL=true
```

## Paystack

Set the webhook URL in Paystack to:

```text
https://yourdomain.com/api/payments/paystack/webhook
```

Run a low-value live payment test before opening the app to public users.

## Resend

`onboarding@resend.dev` is acceptable only for private testing. For public OTP delivery, verify a sender domain in Resend and set:

```text
RESEND_FROM_EMAIL=BlackCrow <support@yourdomain.com>
```

## Render or Node Hosting

`render.yaml` and `Procfile` are retained for Node web-service hosting. Use:

```text
Build command: npm install && npm run check
Start command: npm start
Health check: /api/health
```

## Local Verification

With the local server running:

```bash
npm run check
npm run smoke
npm audit --omit=dev
```

`npm run smoke` uses development OTP codes, so do not run it against production.
