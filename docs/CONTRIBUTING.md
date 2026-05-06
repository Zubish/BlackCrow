# Contributing to BlackCrow

Thanks for helping improve BlackCrow. The project goal is to make buyer-seller transactions safer without making either party fight the product.

## Development Setup

```bash
npm install
npm start
```

Open:

```text
http://127.0.0.1:5000
```

## Before Submitting Changes

Run:

```bash
npm run check
```

For backend flow changes, also run the smoke test while the server is running:

```bash
npm run smoke
```

## Contribution Areas

- Frontend responsiveness and accessibility.
- Dashboard, wallet, and transaction UX polish.
- Backend API hardening and validation.
- Payment, payout, and webhook reliability.
- Dispute and support workflows.
- Browser regression tests.

## Guidelines

- Keep changes focused and easy to review.
- Follow the existing visual language and naming style.
- Do not commit `.env`, import files, generated `public/`, screenshots, or local data.
- Add or update tests when changing lifecycle, payment, or authentication behavior.
- Keep secrets in the deployment provider, not in source control.
