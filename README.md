# 🛡️ Blackcrow Escrow – Trust Layer for Social Commerce

## 🚨 Problem

Buying and selling on platforms like WhatsApp, Instagram, and Twitter comes with a major issue:

> **Lack of trust between buyers and sellers**

- Buyers fear getting scammed after payment
- Sellers fear chargebacks or fake claims
- No structured transaction protection exists

---

## 💡 Solution

**Blackcrow Escrow** introduces a simple escrow system that:

- Holds funds until conditions are met
- Defines clear release rules
- Tracks both buyer and seller actions
- Makes transactions transparent and verifiable

---

## ⚙️ Current State (MVP)

This project currently includes:

- 🏠 **Landing Page** (`landingpage.html`): Public-facing page with hero section, features, testimonials, and CTAs to sign up.
- 🔐 **Authentication Pages**:
  - Login (`login.html`) with email/password and social options (Google, Apple, Email).
  - Signup (`signup.html`) with form fields and social options.
- 📊 **Escrow Dashboard** (`user.html`): Internal workspace for managing escrows, transactions, and stats.
- 📦 Transaction tracking system (frontend state)
- 🔍 Search and filter functionality
- 📈 Stats (volume, completion rate)
- 🧾 Escrow creation form
- 🔄 Status updates (pending → review → completed)
- 🎨 Consistent dark theme with Manrope font, responsive design, and favicon.

> ⚠️ Note: Data is currently stored in frontend memory (no backend persistence yet). Authentication is simulated via links.

---

## 🧠 How It Works

1. Buyer and seller agree on terms
2. Escrow is created with:
   - Amount
   - Inspection period
   - Release condition
3. Funds are held (simulated)
4. Transaction progresses through:
   - `pending`
   - `review`
   - `completed`
5. Release happens only when condition is met

---

## 🏗️ Tech Stack

- HTML5
- CSS3 (Custom UI system with CSS variables)
- Vanilla JavaScript (state management)
- SVG icons for social buttons

---

## 🚀 Future Roadmap

We are actively building toward:

- 🔐 Backend integration (Node.js / Flask)
- 💳 Payment integration (Stripe / Paystack / Flutterwave)
- 👤 Full authentication system
- 📱 Mobile responsiveness improvements
- ⚖️ Dispute resolution system
- 🔔 Notifications system
- 🌍 Multi-currency support (future reference)

---

## 🤝 Contributing

We welcome contributions from developers of all levels.

### 💡 Good First Contributions:

- Improve UI/UX (e.g., animations, feedback states)
- Add mobile responsiveness fixes
- Improve filtering/search logic
- Refactor JavaScript into modules
- Add form validation
- Convert to React / Vue
- Enhance accessibility (ARIA labels, keyboard navigation)

---

## 🛠️ How to Contribute

1. Fork the repository
2. Clone your fork
3. Create a branch:
   git checkout -b feature/your-feature
4. Make changes
5. Commit:
   - `review`
   - `completed`
6. Release happens only when condition is met

---

## 🏗️ Tech Stack

- HTML5
- CSS3 (Custom UI system)
- Vanilla JavaScript (state management)

---

## 🚀 Future Roadmap

We are actively building toward:

- 🔐 Backend integration (Node.js / Flask)
- 💳 Payment integration (Stripe / Paystack / Flutterwave)
- 👤 Authentication system
- 📱 Mobile responsiveness improvements
- ⚖️ Dispute resolution system
- 🔔 Notifications system
- 🌍 Multi-currency support (future reference)

---

## 🤝 Contributing

We welcome contributions from developers of all levels.

### 💡 Good First Contributions:

- Improve UI/UX
- Add mobile responsiveness fixes
- Improve filtering/search logic
- Refactor JavaScript into modules
- Add form validation
- Convert to React / Vue

---

## 🛠️ How to Contribute

1. Fork the repository
2. Clone your fork
3. Create a branch:
   git checkout -b feature/your-feature
4. Make changes
5. Commit:
   git commit -m "Added feature"
6. Push:
   git push origin feature/your-feature
7. Open a Pull Request

---

## 📌 Project Vision

To become the **default escrow layer for social commerce transactions globally**, starting from Africa.

---

## ⭐ Why Contribute?

- Work on a real-world fintech problem
- Build production-level features
- Great for portfolio projects
- Beginner-friendly + scalable architecture

---

## 👨‍💻 Author

Musa Ibrahim
