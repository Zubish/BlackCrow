# BlackCrow Deployment

BlackCrow can deploy either as one Node web service or through Vercel serverless functions. The Node server serves both the static frontend and the `/api` routes locally; Vercel uses `api/[...path].js` as the serverless adapter.

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

`PUBLIC_APP_URL` is used for Paystack payment return URLs. `ALLOWED_ORIGINS` controls production CORS.

## Deploy Steps

1. Rotate the Neon connection string before public launch.
2. Push the latest GitHub `master` branch.
3. Create a Node web service from the repository.
4. Use:

```text
Build command: npm install && npm run check
Start command: npm start
Health check: /api/health
```

5. Add all required environment variables.
6. Run the database migration from the host shell:

```bash
npm run migrate
```

7. Configure Paystack webhook URL:

```text
https://yourdomain.com/api/payments/paystack/webhook
```

8. Open the domain and complete a real low-value payment test.

## Render Blueprint

`render.yaml` is included for Render. It creates a Node web service and marks secrets as dashboard-managed values.

## Vercel

`vercel.json` is included for Vercel. Configure the same production environment variables in the Vercel project settings.

Use:

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

For a custom domain, change both values to the custom domain.

## Local Verification

With the local server running:

```bash
npm run check
npm run smoke
npm audit --omit=dev
```

`npm run smoke` uses development OTP codes, so do not run it against production.
