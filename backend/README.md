# BlackCrow Backend MVP

This backend is intentionally small. It gives the frontend real API contracts while keeping payments, bank transfers, and production email delivery simulated until the product flow is stable.

## Storage

BlackCrow now supports two storage modes:

- Local file storage: used when `DATABASE_URL` is empty.
- Neon/Postgres storage: used when `DATABASE_URL` is set.

For local development, run:

```bash
npm start
```

The API runs on:

```text
http://127.0.0.1:5000
```

Local data is stored in `backend/data.json`, which is ignored by Git.

## Neon Setup

1. Create a Neon project.
2. Copy the pooled Postgres connection string from Neon.
3. Create `.env` from `.env.example`.
4. Set:

```text
DATABASE_URL=postgresql://...
DATABASE_SSL=true
```

5. Install dependencies:

```bash
npm install
```

6. Run the schema migration:

```bash
npm run migrate
```

7. Start the backend:

```bash
npm start
```

8. In another terminal, run the local smoke test:

```bash
npm run smoke
```

## Routes

- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me?token=session_token`
- `GET /api/account/escrows`
- `POST /api/account/escrows`
- `GET /api/account/wallet`
- `GET /api/account/activity`
- `POST /api/escrows`
- `POST /api/escrows/:id/otp`
- `POST /api/escrows/:id/otp/verify`
- `POST /api/escrows/:id/payments/initialize`
- `POST /api/escrows/:id/payments/verify`
- `POST /api/payments/paystack/webhook`
- `POST /api/escrows/:id/withdrawals`
- `GET /api/escrows/:id/withdrawals`
- `GET /api/account/withdrawals`
- `PATCH /api/internal/withdrawals/:id/paid`
- `PATCH /api/escrows/:id/actions`

## Escrow Actions

Lifecycle actions are guarded by an email verification session token:

- `accept`
- `deliver`
- `release`

Funding and withdrawal are not generic lifecycle actions. Funding goes through the payment routes, and withdrawal goes through withdrawal request routes.

## Payments

Buyer funding now goes through a payment boundary instead of directly toggling escrow state.

Development defaults to simulated payments:

```text
PAYMENT_PROVIDER=simulated
```

For Paystack later:

```text
PAYMENT_PROVIDER=paystack
PAYSTACK_SECRET_KEY=sk_...
```

Payment flow:

1. Buyer verifies escrow access by OTP.
2. Buyer initializes payment.
3. Buyer confirms funding.
4. Backend verifies the provider reference.
5. Escrow moves to `funded`/`review`.

Paystack webhooks are verified with `x-paystack-signature` and can also settle matching `charge.success` events.

## Withdrawals

Released funds become seller wallet balance. The seller can request withdrawal to a local bank, but only internal payout/provider code can mark the withdrawal as paid.

Withdrawal flow:

1. Buyer releases funds.
2. Seller verifies escrow access by OTP or account session.
3. Seller submits payout destination details.
4. Backend records a `requested` withdrawal.
5. Internal payout/provider code marks it `paid`.
6. Escrow lifecycle becomes `withdrawn`.

## Resend Email OTP

BlackCrow can send escrow access codes through Resend.

For local development, OTP codes are still returned in API responses so the flow can be tested without email setup. In production, set `NODE_ENV=production` so OTP codes are not exposed in responses.

Add these values to `.env`:

```text
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=BlackCrow <verified@yourdomain.com>
```

Resend allows `onboarding@resend.dev` for early testing, but a verified domain should be used before a public launch.
