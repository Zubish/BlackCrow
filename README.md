# BlackCrow Escrow

BlackCrow is an escrow web app for social-commerce transactions. A buyer or seller can create a protected transaction link, both parties accept the terms, the buyer funds escrow, the seller delivers, the buyer releases funds, and the seller requests payout to a local bank.

## Current Scope

- Public landing page and one-off escrow creation.
- Account signup, login, and dashboard pages.
- Email OTP access for guest escrow tracking.
- Neon/Postgres persistence through the Node backend.
- Simulated payment boundary with Paystack-ready provider wiring.
- Seller wallet and withdrawal request boundary.
- Static frontend served by the same Node service.

## Core Flow

1. Buyer or seller creates an escrow link.
2. The other party opens the link and verifies by email OTP.
3. Both parties accept the terms.
4. Buyer initializes and confirms payment.
5. Seller marks the product delivered.
6. Buyer releases funds to seller wallet.
7. Seller requests withdrawal to a local bank.
8. Backend/provider/admin marks the withdrawal as paid after payout settlement.

## Local Development

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example`, then start the server:

```bash
npm start
```

Open:

```text
http://127.0.0.1:5000
```

Run syntax checks:

```bash
npm run check
```

Run the local end-to-end smoke test while the server is running:

```bash
npm run smoke
```

Run database migrations:

```bash
npm run migrate
```

## Environment Variables

Required for production:

```text
NODE_ENV=production
PORT=5000
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

Development can use:

```text
PAYMENT_PROVIDER=simulated
```

In production, the backend refuses to start if critical values are missing or still set to local/demo values.

## API Overview

Authentication:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

Account:

- `GET /api/account/escrows`
- `POST /api/account/escrows`
- `GET /api/account/wallet`
- `GET /api/account/activity`
- `GET /api/account/withdrawals`

Guest escrow:

- `POST /api/escrows`
- `POST /api/escrows/:id/otp`
- `POST /api/escrows/:id/otp/verify`
- `PATCH /api/escrows/:id/actions`

Payments:

- `POST /api/escrows/:id/payments/initialize`
- `POST /api/escrows/:id/payments/verify`
- `POST /api/payments/paystack/webhook`

Withdrawals:

- `POST /api/escrows/:id/withdrawals`
- `GET /api/escrows/:id/withdrawals`
- `PATCH /api/internal/withdrawals/:id/paid`

The public list and raw email wallet endpoints are intentionally locked down for production safety.

## Deployment Checklist

- Rotate any connection strings or keys that were shared during development.
- Set production Neon `DATABASE_URL`.
- Run `npm run migrate`.
- Configure verified Resend sender domain.
- Configure Paystack secret key and test payments.
- Set Paystack webhook URL to `/api/payments/paystack/webhook`.
- Set `PUBLIC_APP_URL` to the final domain.
- Set `ALLOWED_ORIGINS` to the final domain.
- Set `INTERNAL_API_SECRET`.
- Start with `npm start`.

## Roadmap

- Automated payout provider integration.
- Bank account verification and automated payout provider.
- Dispute workflow and support inbox.
- Admin dashboard for payout review and fraud controls.
- Automated browser regression tests.
