const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sendEscrowOtpEmail, sendPasswordResetEmail, shouldExposeDevCode } = require("./email");
const { createPaymentProvider } = require("./payments");
const { createStorage } = require("./storage");

loadEnv();

const PORT = Number(process.env.PORT || 5000);
const FRONTEND_ROOT = path.join(__dirname, "..");
const NODE_ENV = process.env.NODE_ENV || "development";
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const OTP_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const USER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const OTP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const OTP_RATE_LIMIT_MAX = 5;
let storage;
let paymentProvider;
let runtimeReady;
const otpRateLimits = new Map();

function loadEnv() {
    const envPath = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) return;

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) return;

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

function validateProductionConfig() {
    if (NODE_ENV !== "production") return;

    const missing = [];
    if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
    if (!process.env.PUBLIC_APP_URL || process.env.PUBLIC_APP_URL.includes("localhost") || process.env.PUBLIC_APP_URL.includes("127.0.0.1")) {
        missing.push("production PUBLIC_APP_URL");
    }
    if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
    if (!process.env.RESEND_FROM_EMAIL) {
        missing.push("RESEND_FROM_EMAIL");
    }
    if (!process.env.INTERNAL_API_SECRET) missing.push("INTERNAL_API_SECRET");
    if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.some((origin) => origin.includes("localhost") || origin.includes("127.0.0.1"))) {
        missing.push("production ALLOWED_ORIGINS");
    }
    if (!process.env.PAYMENT_PROVIDER || process.env.PAYMENT_PROVIDER === "simulated") {
        missing.push("PAYMENT_PROVIDER=paystack");
    }
    if (process.env.PAYMENT_PROVIDER === "paystack" && !process.env.PAYSTACK_SECRET_KEY) {
        missing.push("PAYSTACK_SECRET_KEY");
    }

    if (missing.length) {
        throw new Error(`Production configuration is incomplete: ${missing.join(", ")}`);
    }
}

function getEmailSenderMode() {
    const sender = process.env.RESEND_FROM_EMAIL || "";
    if (!process.env.RESEND_API_KEY || !sender) return "disabled";
    if (sender.includes("onboarding@resend.dev")) return "resend-onboarding";
    return "custom-sender";
}

function sendJson(response, status, body) {
    response.writeHead(status === 204 ? 204 : status, {
        "Content-Type": "application/json",
        ...securityHeaders(),
        "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    response.end(status === 204 ? "" : JSON.stringify(body));
}

function securityHeaders(requestOrigin = "") {
    const headers = {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Frame-Options": "DENY"
    };

    if (NODE_ENV !== "production") {
        headers["Access-Control-Allow-Origin"] = requestOrigin || "*";
    } else if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
        headers["Access-Control-Allow-Origin"] = requestOrigin;
        headers.Vary = "Origin";
    } else if (ALLOWED_ORIGINS.length === 1) {
        headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGINS[0];
    }

    return headers;
}

function sendStatic(request, response, url) {
    if (request.method !== "GET" && request.method !== "HEAD") {
        return false;
    }

    const requestedPath = decodeURIComponent(url.pathname === "/" ? "/landingpage.html" : url.pathname);
    const relativePath = requestedPath.replace(/^\/+/, "");
    if (!relativePath || relativePath.startsWith("backend/")) {
        return false;
    }

    const filePath = path.resolve(FRONTEND_ROOT, relativePath);
    if (!filePath.startsWith(FRONTEND_ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }

    const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon"
    };
    const contentType = contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";

    response.writeHead(200, {
        "Content-Type": contentType,
        ...securityHeaders(request.headers.origin || "")
    });
    if (request.method === "HEAD") {
        response.end();
        return true;
    }
    fs.createReadStream(filePath).pipe(response);
    return true;
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
            if (body.length > 1_000_000) {
                request.destroy();
                reject(new Error("Request body too large."));
            }
        });
        request.on("end", () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error("Invalid JSON body."));
            }
        });
    });
}

function readRawBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
            if (body.length > 1_000_000) {
                request.destroy();
                reject(new Error("Request body too large."));
            }
        });
        request.on("end", () => resolve(body));
        request.on("error", reject);
    });
}

function parseJsonText(text) {
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error("Invalid JSON body.");
    }
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function requireFields(payload, fields) {
    const missing = fields.filter((field) => {
        const value = payload[field];
        return value === undefined || value === null || String(value).trim() === "";
    });
    return missing;
}

function createToken() {
    return crypto.randomBytes(24).toString("hex");
}

function createLongToken() {
    return crypto.randomBytes(32).toString("base64url");
}

function hashResetToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function createId(prefix) {
    return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function createOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

function nowIso() {
    return new Date().toISOString();
}

function getPublicAppUrl(request) {
    const configured = String(process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
    if (configured) return configured;

    const protocol = request.headers["x-forwarded-proto"] || "http";
    return `${protocol}://${request.headers.host}`;
}

function createPasswordResetUrl(request, token) {
    return `${getPublicAppUrl(request)}/reset-password.html?token=${encodeURIComponent(token)}`;
}

function publicEscrow(escrow) {
    return {
        ...escrow,
        lifecycle: normalizeLifecycle(escrow.lifecycle)
    };
}

function publicUser(user) {
    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        createdAt: user.createdAt
    };
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const iterations = 120000;
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
    return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, passwordHash) {
    const [algorithm, iterations, salt, storedHash] = String(passwordHash || "").split("$");
    if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !storedHash) return false;

    const hash = crypto.pbkdf2Sync(password, salt, Number(iterations), 32, "sha256");
    const stored = Buffer.from(storedHash, "hex");
    if (stored.length !== hash.length) return false;
    return crypto.timingSafeEqual(stored, hash);
}

async function createAuthSession(user) {
    const session = {
        userId: user.id,
        token: createToken(),
        expiresAt: new Date(Date.now() + USER_SESSION_TTL_MS).toISOString()
    };
    await storage.createUserSession(session);
    return session;
}

async function requestPasswordReset(request, payload) {
    const email = normalizeEmail(payload.email);
    if (!email) return { error: "Email is required." };

    const user = await storage.getUserByEmail(email);
    const neutralResponse = {
        message: "If an account exists for that email, a password reset link has been sent."
    };

    if (!user) return neutralResponse;

    const token = createLongToken();
    const reset = {
        id: createId("reset"),
        userId: user.id,
        tokenHash: hashResetToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString(),
        createdAt: nowIso()
    };
    await storage.createPasswordReset(reset);

    const resetUrl = createPasswordResetUrl(request, token);
    const emailResult = await sendPasswordResetEmail({
        to: user.email,
        resetUrl,
        user
    });

    if (!emailResult.sent && shouldExposeDevCode()) {
        return {
            ...neutralResponse,
            devResetUrl: resetUrl
        };
    }

    return neutralResponse;
}

async function confirmPasswordReset(payload) {
    const token = String(payload.token || "").trim();
    const password = String(payload.password || "");
    if (!token || !password) return { error: "Reset token and new password are required." };
    if (password.length < 8) return { error: "Password must be at least 8 characters." };

    const reset = await storage.getValidPasswordReset(hashResetToken(token), Date.now());
    if (!reset) return { error: "This reset link is invalid or has expired." };

    const user = await storage.getUserById(reset.userId);
    if (!user) return { error: "This reset link is invalid or has expired." };

    await storage.updateUserPassword(user.id, hashPassword(password), nowIso());
    await storage.markPasswordResetUsed(reset.id, nowIso());
    await storage.deleteUserSessions(user.id);
    return { message: "Password reset successful. You can now log in." };
}

function getAuthToken(request, url) {
    const header = request.headers.authorization || "";
    if (header.toLowerCase().startsWith("bearer ")) {
        return header.slice(7).trim();
    }
    return url.searchParams.get("token") || "";
}

async function getAccountUser(request, url) {
    const token = getAuthToken(request, url);
    const session = token ? await storage.getValidUserSession(token, Date.now()) : null;
    if (!session) return null;
    return storage.getUserById(session.userId);
}

async function requireAccountUser(request, response, url) {
    const user = await getAccountUser(request, url);
    if (!user) {
        sendJson(response, 401, { error: "Valid user session required." });
        return null;
    }
    return user;
}

function normalizeLifecycle(lifecycle = {}) {
    return {
        buyerAccepted: Boolean(lifecycle.buyerAccepted || lifecycle.accepted),
        sellerAccepted: Boolean(lifecycle.sellerAccepted || lifecycle.accepted),
        paymentInitialized: Boolean(lifecycle.paymentInitialized),
        paymentConfirmed: Boolean(lifecycle.paymentConfirmed),
        withdrawalRequested: Boolean(lifecycle.withdrawalRequested),
        funded: Boolean(lifecycle.funded),
        dispatched: Boolean(lifecycle.dispatched),
        delivered: Boolean(lifecycle.delivered),
        disputed: Boolean(lifecycle.disputed),
        released: Boolean(lifecycle.released),
        withdrawn: Boolean(lifecycle.withdrawn)
    };
}

async function addEvent(escrowId, type, actorEmail, message) {
    await storage.addEvent({
        id: createToken(),
        escrowId,
        type,
        actorEmail,
        message,
        createdAt: nowIso()
    });
}

function publicPayment(payment) {
    return {
        id: payment.id,
        escrowId: payment.escrowId,
        provider: payment.provider,
        providerReference: payment.providerReference,
        status: payment.status,
        amount: Number(payment.amount),
        buyerEmail: payment.buyerEmail,
        authorizationUrl: payment.authorizationUrl,
        verifiedAt: payment.verifiedAt,
        createdAt: payment.createdAt
    };
}

function publicWithdrawal(withdrawal, includeDestination = false) {
    if (!withdrawal) return null;
    const body = {
        id: withdrawal.id,
        escrowId: withdrawal.escrowId,
        sellerEmail: withdrawal.sellerEmail,
        amount: Number(withdrawal.amount),
        status: withdrawal.status,
        provider: withdrawal.provider,
        providerReference: withdrawal.providerReference,
        failureReason: withdrawal.failureReason,
        requestedAt: withdrawal.requestedAt,
        processingAt: withdrawal.processingAt,
        paidAt: withdrawal.paidAt,
        rejectedAt: withdrawal.rejectedAt,
        createdAt: withdrawal.createdAt,
        updatedAt: withdrawal.updatedAt
    };
    if (includeDestination) {
        body.payoutDestination = withdrawal.payoutDestination || {};
    }
    return body;
}

function checkOtpRateLimit(escrowId, email) {
    const key = `${escrowId}:${email}`;
    const now = Date.now();
    const entry = otpRateLimits.get(key) || { count: 0, resetAt: now + OTP_RATE_LIMIT_WINDOW_MS };

    if (entry.resetAt <= now) {
        entry.count = 0;
        entry.resetAt = now + OTP_RATE_LIMIT_WINDOW_MS;
    }

    entry.count += 1;
    otpRateLimits.set(key, entry);

    if (entry.count > OTP_RATE_LIMIT_MAX) {
        const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
        return {
            allowed: false,
            retryAfterSeconds
        };
    }

    return { allowed: true };
}

async function createEscrow(payload, creatorUser = null) {
    const buyerEmail = normalizeEmail(payload.buyerEmail);
    const sellerEmail = normalizeEmail(payload.sellerEmail);
    const buyer = String(payload.buyer || "").trim();
    const seller = String(payload.seller || "").trim();
    const amount = Number(payload.amount);

    if (!buyer || !seller || !buyerEmail || !sellerEmail || !amount || amount < 1) {
        return { error: "Buyer, seller, their emails, and a valid amount are required." };
    }

    const escrow = {
        id: await storage.nextEscrowId(),
        buyer,
        seller,
        buyerEmail,
        sellerEmail,
        amount,
        status: "pending",
        condition: String(payload.condition || "Delivery confirmation").trim(),
        inspectionDays: Number(payload.inspectionDays || 5),
        item: String(payload.item || "Protected transaction").trim(),
        terms: cleanEscrowTerms(payload.terms || payload),
        dispatchProof: {},
        dispute: {},
        note: "Awaiting both parties to accept escrow terms.",
        initiatorRole: payload.initiatorRole === "buyer" ? "buyer" : "seller",
        creatorUserId: creatorUser?.id || null,
        creationMode: creatorUser ? "account" : "guest",
        lifecycle: {
            buyerAccepted: false,
            sellerAccepted: false,
            paymentInitialized: false,
            paymentConfirmed: false,
            withdrawalRequested: false,
            funded: false,
            dispatched: false,
            delivered: false,
            disputed: false,
            released: false,
            withdrawn: false
        },
        createdAt: nowIso(),
        updatedAt: nowIso()
    };

    const savedEscrow = await storage.createEscrow(escrow);
    await addEvent(savedEscrow.id, "escrow.created", buyerEmail, "Escrow link created.");

    return { escrow: publicEscrow(savedEscrow) };
}

function cleanEscrowTerms(payload = {}) {
    const inspectionDays = Number(payload.inspectionDays || 2);
    return {
        category: String(payload.category || "General goods").trim().slice(0, 80),
        itemCondition: String(payload.itemCondition || "Not specified").trim().slice(0, 80),
        quantity: String(payload.quantity || "1").trim().slice(0, 40),
        deliveryMethod: String(payload.deliveryMethod || "To be agreed").trim().slice(0, 120),
        preferredCourier: String(payload.preferredCourier || "").trim().slice(0, 120),
        shippingResponsibility: String(payload.shippingResponsibility || "seller").trim().slice(0, 40),
        inspectionDays: Number.isFinite(inspectionDays) && inspectionDays > 0 ? Math.min(inspectionDays, 7) : 2
    };
}

function cleanDispatchProof(payload = {}) {
    return {
        courierName: String(payload.courierName || "").trim().slice(0, 120),
        waybillNumber: String(payload.waybillNumber || "").trim().slice(0, 120),
        dispatchNote: String(payload.dispatchNote || "").trim().slice(0, 600),
        evidenceLink: String(payload.evidenceLink || "").trim().slice(0, 500),
        submittedAt: nowIso()
    };
}

function validateDispatchProof(proof) {
    if (!proof.courierName || !proof.waybillNumber) {
        return "Courier name and waybill/tracking number are required before dispatch can be recorded.";
    }
    return "";
}

function cleanDispute(payload = {}, role = "") {
    return {
        openedBy: role,
        reason: String(payload.reason || "").trim().slice(0, 120),
        details: String(payload.details || "").trim().slice(0, 1000),
        evidenceLink: String(payload.evidenceLink || "").trim().slice(0, 500),
        status: "open",
        openedAt: nowIso()
    };
}

function validateDispute(dispute) {
    if (!dispute.reason || !dispute.details) {
        return "Dispute reason and explanation are required.";
    }
    return "";
}

async function findEscrow(id) {
    return storage.getEscrow(id);
}

function roleForEmail(escrow, email) {
    const normalized = normalizeEmail(email);
    if (normalized === escrow.buyerEmail) return "buyer";
    if (normalized === escrow.sellerEmail) return "seller";
    return "";
}

async function getValidSession(escrow, token) {
    const session = await storage.getValidSession(escrow.id, token, Date.now());
    if (!session) return null;
    return { ...session, role: roleForEmail(escrow, session.email) };
}

async function applyLifecycleAction(escrow, role, action, actorEmail, payload = {}) {
    const lifecycle = normalizeLifecycle(escrow.lifecycle);
    const accepted = lifecycle.buyerAccepted && lifecycle.sellerAccepted;

    if (action === "accept") {
        if (role === "buyer") lifecycle.buyerAccepted = true;
        if (role === "seller") lifecycle.sellerAccepted = true;
        escrow.note = lifecycle.buyerAccepted && lifecycle.sellerAccepted
            ? "Both parties accepted. Waiting for buyer funding."
            : "Terms accepted. Waiting for the other party.";
        await addEvent(escrow.id, "escrow.accepted", actorEmail, `${role} accepted the escrow terms.`);
    } else if (action === "fund") {
        return { error: "Use payment initialization to fund escrow." };
    } else if (action === "deliver") {
        if (role !== "seller") return { error: "Only the seller can mark delivery." };
        if (!lifecycle.funded) return { error: "Escrow must be funded before delivery." };
        if (!lifecycle.dispatched) return { error: "Dispatch proof must be submitted before delivery can be marked." };
        if (lifecycle.disputed) return { error: "Delivery cannot be changed while a dispute is open." };
        lifecycle.delivered = true;
        escrow.status = "review";
        escrow.note = "Seller marked delivery complete. Waiting for buyer release.";
        await addEvent(escrow.id, "escrow.delivered", actorEmail, "Seller marked the product delivered.");
    } else if (action === "dispatch") {
        if (role !== "seller") return { error: "Only the seller can submit dispatch proof." };
        if (!lifecycle.funded) return { error: "Escrow must be funded before dispatch proof is submitted." };
        if (lifecycle.disputed) return { error: "Dispatch proof cannot be changed while a dispute is open." };
        const dispatchProof = cleanDispatchProof(payload.dispatchProof || payload);
        const dispatchError = validateDispatchProof(dispatchProof);
        if (dispatchError) return { error: dispatchError };
        lifecycle.dispatched = true;
        escrow.dispatchProof = dispatchProof;
        escrow.status = "review";
        escrow.note = "Seller submitted dispatch proof. Waiting for delivery confirmation.";
        await addEvent(escrow.id, "escrow.dispatched", actorEmail, "Seller submitted dispatch proof.");
    } else if (action === "dispute") {
        if (!lifecycle.funded) return { error: "Escrow must be funded before a dispute can be opened." };
        if (lifecycle.released) return { error: "Funds have already been released." };
        if (lifecycle.disputed) return { error: "A dispute is already open for this escrow." };
        const dispute = cleanDispute(payload.dispute || payload, role);
        const disputeError = validateDispute(dispute);
        if (disputeError) return { error: disputeError };
        lifecycle.disputed = true;
        escrow.dispute = dispute;
        escrow.status = "review";
        escrow.note = "Dispute opened. BlackCrow will review the terms, dispatch proof, and submitted evidence.";
        await addEvent(escrow.id, "escrow.disputed", actorEmail, `${role} opened a dispute.`);
    } else if (action === "release") {
        if (role !== "buyer") return { error: "Only the buyer can release funds." };
        if (!lifecycle.delivered) return { error: "Seller delivery must be marked before release." };
        if (lifecycle.disputed) return { error: "Funds cannot be released while a dispute is open." };
        lifecycle.released = true;
        escrow.status = "completed";
        escrow.note = "Buyer released funds to seller wallet.";
        await addEvent(escrow.id, "escrow.released", actorEmail, "Buyer released funds to seller wallet.");
    } else if (action === "withdraw") {
        return { error: "Use withdrawal request to move released funds to a local bank." };
    } else {
        return { error: "Unsupported escrow action." };
    }

    escrow.lifecycle = lifecycle;
    escrow.updatedAt = nowIso();
    const savedEscrow = await storage.updateEscrow(escrow);
    return { escrow: publicEscrow(savedEscrow) };
}

async function getEscrowPartySession(escrow, payload) {
    const session = await getValidSession(escrow, payload.token);
    if (!session || !session.role) return null;
    return session;
}

async function requireSellerAccess(request, response, url, escrow, payload = {}) {
    const accountUser = await getAccountUser(request, url);
    if (accountUser && accountUser.email === escrow.sellerEmail) {
        return {
            email: accountUser.email,
            userId: accountUser.id,
            mode: "account"
        };
    }

    const session = await getValidSession(escrow, payload.token);
    if (session?.role === "seller") {
        return {
            email: session.email,
            userId: null,
            mode: "guest"
        };
    }

    sendJson(response, 403, { error: "Seller access required." });
    return null;
}

function cleanPayoutDestination(payload = {}) {
    return {
        bankName: String(payload.bankName || "").trim(),
        accountName: String(payload.accountName || "").trim(),
        accountNumber: String(payload.accountNumber || "").replace(/\D/g, "").slice(0, 20)
    };
}

function validatePayoutDestination(destination) {
    if (!destination.bankName || !destination.accountName || !destination.accountNumber) {
        return "Bank name, account name, and account number are required.";
    }
    if (destination.accountNumber.length < 8) {
        return "Account number looks too short.";
    }
    return "";
}

async function requestSellerWithdrawal(escrow, sellerAccess, payoutDestination) {
    const lifecycle = normalizeLifecycle(escrow.lifecycle);
    if (!lifecycle.released) {
        return { error: "Funds must be released before withdrawal can be requested." };
    }
    if (lifecycle.withdrawn) {
        return { error: "This escrow has already been paid out." };
    }

    const activeRequest = await storage.getActiveWithdrawalRequestForEscrow(escrow.id);
    if (activeRequest) {
        return {
            withdrawal: publicWithdrawal(activeRequest, true),
            escrow: publicEscrow(escrow)
        };
    }

    const now = nowIso();
    const withdrawal = await storage.createWithdrawalRequest({
        id: createId("wd"),
        escrowId: escrow.id,
        sellerEmail: sellerAccess.email,
        sellerUserId: sellerAccess.userId,
        amount: escrow.amount,
        status: "requested",
        payoutDestination,
        provider: "manual",
        providerReference: null,
        rawResponse: {},
        failureReason: null,
        requestedAt: now,
        approvedAt: null,
        processingAt: null,
        paidAt: null,
        rejectedAt: null,
        createdAt: now,
        updatedAt: now
    });

    const updatedEscrow = await storage.updateEscrow({
        ...escrow,
        lifecycle: {
            ...normalizeLifecycle(escrow.lifecycle),
            withdrawalRequested: true
        },
        note: "Seller requested payout to local bank. Withdrawal is pending.",
        updatedAt: now
    });
    await addEvent(escrow.id, "withdrawal.requested", sellerAccess.email, "Seller requested withdrawal to local bank.");

    return {
        withdrawal: publicWithdrawal(withdrawal, true),
        escrow: publicEscrow(updatedEscrow)
    };
}

async function markWithdrawalPaid(withdrawalId, actorEmail = "system") {
    const paidAt = nowIso();
    const result = await storage.markWithdrawalPaid({
        id: withdrawalId,
        paidAt,
        rawResponse: { settledBy: actorEmail, mode: "internal" }
    });
    if (!result?.escrow || !result?.withdrawal) {
        return { error: "Unable to mark withdrawal paid." };
    }
    await addEvent(result.escrow.id, "escrow.withdrawn", actorEmail, "Withdrawal payout was marked paid.");
    return {
        withdrawal: publicWithdrawal(result.withdrawal, true),
        escrow: publicEscrow(result.escrow)
    };
}

async function initializeBuyerFunding(escrow, session) {
    if (session.role !== "buyer") {
        return { error: "Only the buyer can initialize payment." };
    }

    const lifecycle = normalizeLifecycle(escrow.lifecycle);
    if (!lifecycle.buyerAccepted || !lifecycle.sellerAccepted) {
        return { error: "Both parties must accept before payment can be initialized." };
    }

    if (lifecycle.funded) {
        return { error: "This escrow is already funded." };
    }

    const existingPayment = await storage.getLatestPaymentInitializationForEscrow(escrow.id);
    if (existingPayment && existingPayment.status === "initialized") {
        return { payment: publicPayment(existingPayment), escrow: publicEscrow(escrow) };
    }

    const initialized = await paymentProvider.initialize({ escrow, buyerEmail: session.email });
    const now = nowIso();
    const payment = await storage.createPaymentInitialization({
        id: createId("pay"),
        escrowId: escrow.id,
        provider: initialized.provider,
        providerReference: initialized.providerReference,
        status: "initialized",
        amount: escrow.amount,
        buyerEmail: session.email,
        authorizationUrl: initialized.authorizationUrl,
        rawResponse: initialized.rawResponse,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now
    });

    const lifecycleWithPayment = {
        ...normalizeLifecycle(escrow.lifecycle),
        paymentInitialized: true
    };
    const updatedEscrow = await storage.updateEscrow({
        ...escrow,
        lifecycle: lifecycleWithPayment,
        note: "Payment initialized. Waiting for funding confirmation.",
        updatedAt: now
    });
    await addEvent(escrow.id, "payment.initialized", session.email, "Buyer initialized payment.");

    return { payment: publicPayment(payment), escrow: publicEscrow(updatedEscrow) };
}

async function verifyBuyerFunding(escrow, session, providerReference) {
    if (session.role !== "buyer") {
        return { error: "Only the buyer can confirm funding." };
    }

    const payment = providerReference
        ? await storage.getPaymentInitializationByReference(paymentProvider.name, providerReference)
        : await storage.getLatestPaymentInitializationForEscrow(escrow.id);
    if (!payment || payment.escrowId !== escrow.id) {
        return { error: "No payment initialization found for this escrow." };
    }

    const verified = await paymentProvider.verify({ reference: payment.providerReference, escrow });
    if (!verified.verified) {
        await storage.markPaymentVerified({
            provider: payment.provider,
            providerReference: payment.providerReference,
            rawResponse: verified.rawResponse,
            verifiedAt: nowIso()
        });
        return { error: "Payment has not been verified yet." };
    }

    return settleVerifiedPayment(payment, verified.rawResponse, session.email);
}

async function settleVerifiedPayment(payment, rawResponse, actorEmail = "payment-provider") {
    const verifiedAt = nowIso();
    const verifiedPayment = await storage.markPaymentVerified({
        provider: payment.provider,
        providerReference: payment.providerReference,
        rawResponse,
        verifiedAt
    });
    const fundedEscrow = await storage.fundEscrowFromPayment({
        escrowId: payment.escrowId,
        provider: payment.provider,
        providerReference: payment.providerReference,
        actorEmail,
        fundedAt: verifiedAt
    });

    if (!fundedEscrow) return { error: "Unable to fund escrow from verified payment." };
    return { payment: publicPayment(verifiedPayment), escrow: publicEscrow(fundedEscrow) };
}

function isValidPaystackWebhook(rawBody, signature) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY || "";
    if (!secretKey || !signature) return false;

    const digest = crypto
        .createHmac("sha512", secretKey)
        .update(rawBody)
        .digest("hex");

    const received = Buffer.from(String(signature), "hex");
    const expected = Buffer.from(digest, "hex");
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function handlePaystackWebhook(request, response) {
    const rawBody = await readRawBody(request);
    if (!isValidPaystackWebhook(rawBody, request.headers["x-paystack-signature"])) {
        return sendJson(response, 401, { error: "Invalid Paystack signature." });
    }

    const event = parseJsonText(rawBody);
    if (event.event !== "charge.success") {
        return sendJson(response, 200, { ignored: true });
    }

    const reference = event.data?.reference;
    if (!reference) return sendJson(response, 400, { error: "Missing Paystack reference." });

    const payment = await storage.getPaymentInitializationByReference("paystack", reference);
    if (!payment) return sendJson(response, 404, { error: "Payment initialization not found." });

    const amountMatches = Number(event.data?.amount || 0) === Math.round(Number(payment.amount) * 100);
    const statusIsSuccess = event.data?.status === "success";
    if (!amountMatches || !statusIsSuccess) {
        return sendJson(response, 400, { error: "Paystack event does not match initialized payment." });
    }

    const result = await settleVerifiedPayment(payment, event, "paystack");
    if (result.error) return sendJson(response, 400, result);
    return sendJson(response, 200, result);
}

async function handleRequest(request, response) {
    if (request.method === "OPTIONS") {
        return sendJson(response, 204, {});
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = url.pathname;

    try {
        if (request.method === "GET" && pathname === "/api/health") {
            return sendJson(response, 200, {
                ok: true,
                service: "blackcrow-api",
                storage: storage.mode,
                email: getEmailSenderMode(),
                escrows: await storage.countEscrows()
            });
        }

        if (request.method === "POST" && pathname === "/api/auth/signup") {
            const payload = await readJson(request);
            const missing = requireFields(payload, ["fullName", "email", "password"]);
            if (missing.length) return sendJson(response, 400, { error: `Missing fields: ${missing.join(", ")}` });

            const email = normalizeEmail(payload.email);
            const password = String(payload.password || "");
            if (password.length < 8) {
                return sendJson(response, 400, { error: "Password must be at least 8 characters." });
            }

            const existingUser = await storage.getUserByEmail(email);
            if (existingUser) return sendJson(response, 409, { error: "An account with this email already exists." });

            const user = await storage.createUser({
                id: createId("usr"),
                fullName: String(payload.fullName || "").trim(),
                email,
                passwordHash: hashPassword(password),
                createdAt: nowIso(),
                updatedAt: nowIso()
            });
            const session = await createAuthSession(user);
            return sendJson(response, 201, { user: publicUser(user), token: session.token });
        }

        if (request.method === "POST" && pathname === "/api/auth/login") {
            const payload = await readJson(request);
            const missing = requireFields(payload, ["email", "password"]);
            if (missing.length) return sendJson(response, 400, { error: `Missing fields: ${missing.join(", ")}` });

            const email = normalizeEmail(payload.email);
            const user = await storage.getUserByEmail(email);
            if (!user || !verifyPassword(String(payload.password || ""), user.passwordHash)) {
                return sendJson(response, 401, { error: "Invalid email or password." });
            }

            const session = await createAuthSession(user);
            return sendJson(response, 200, { user: publicUser(user), token: session.token });
        }

        if (request.method === "POST" && pathname === "/api/auth/password-reset/request") {
            const payload = await readJson(request);
            const result = await requestPasswordReset(request, payload);
            if (result.error) return sendJson(response, 400, result);
            return sendJson(response, 200, result);
        }

        if (request.method === "POST" && pathname === "/api/auth/password-reset/confirm") {
            const payload = await readJson(request);
            const result = await confirmPasswordReset(payload);
            if (result.error) return sendJson(response, 400, result);
            return sendJson(response, 200, result);
        }

        if (request.method === "GET" && pathname === "/api/auth/me") {
            const user = await requireAccountUser(request, response, url);
            if (!user) return;

            return sendJson(response, 200, { user: publicUser(user) });
        }

        if (request.method === "POST" && pathname === "/api/payments/paystack/webhook") {
            return handlePaystackWebhook(request, response);
        }

        if (request.method === "GET" && pathname === "/api/account/escrows") {
            const user = await requireAccountUser(request, response, url);
            if (!user) return;

            const escrows = await storage.listEscrowsForAccount(user.id, user.email);
            return sendJson(response, 200, { escrows: escrows.map(publicEscrow) });
        }

        if (request.method === "POST" && pathname === "/api/account/escrows") {
            const user = await requireAccountUser(request, response, url);
            if (!user) return;

            const payload = await readJson(request);
            const missing = requireFields(payload, ["buyer", "seller", "buyerEmail", "sellerEmail", "amount", "item"]);
            if (missing.length) return sendJson(response, 400, { error: `Missing fields: ${missing.join(", ")}` });

            const result = await createEscrow(payload, user);
            if (result.error) return sendJson(response, 400, result);
            return sendJson(response, 201, result);
        }

        if (request.method === "GET" && pathname === "/api/account/wallet") {
            const user = await requireAccountUser(request, response, url);
            if (!user) return;

            const escrows = await storage.listEscrowsForAccount(user.id, user.email);
            const withdrawals = await storage.listWithdrawalRequestsForAccount(user.id, user.email);
            const activeWithdrawalEscrowIds = new Set(
                withdrawals
                    .filter((item) => ["requested", "approved", "processing"].includes(item.status))
                    .map((item) => item.escrowId)
            );
            const released = escrows.filter((escrow) => (
                escrow.sellerEmail === user.email
                && normalizeLifecycle(escrow.lifecycle).released
                && !normalizeLifecycle(escrow.lifecycle).withdrawn
                && !activeWithdrawalEscrowIds.has(escrow.id)
            ));
            const pendingWithdrawal = withdrawals
                .filter((item) => ["requested", "approved", "processing"].includes(item.status))
                .reduce((sum, item) => sum + Number(item.amount || 0), 0);

            return sendJson(response, 200, {
                email: user.email,
                availableBalance: released.reduce((sum, escrow) => sum + escrow.amount, 0),
                pendingWithdrawal,
                escrows: released.map(publicEscrow),
                withdrawals: withdrawals.map((item) => publicWithdrawal(item, false))
            });
        }

        if (request.method === "GET" && pathname === "/api/account/activity") {
            const user = await requireAccountUser(request, response, url);
            if (!user) return;

            const limit = Math.min(Number(url.searchParams.get("limit") || 20), 50);
            const events = await storage.listEventsForAccount(user.id, user.email, limit);
            return sendJson(response, 200, { events });
        }

        if (request.method === "GET" && pathname === "/api/escrows") {
            return sendJson(response, 401, { error: "Use account routes or escrow OTP access to view escrows." });
        }

        if (request.method === "POST" && pathname === "/api/escrows") {
            const payload = await readJson(request);
            const missing = requireFields(payload, ["buyer", "seller", "buyerEmail", "sellerEmail", "amount", "item"]);
            if (missing.length) return sendJson(response, 400, { error: `Missing fields: ${missing.join(", ")}` });

            const result = await createEscrow(payload);
            if (result.error) return sendJson(response, 400, result);
            return sendJson(response, 201, result);
        }

        const escrowOtpMatch = pathname.match(/^\/api\/escrows\/([^/]+)\/otp$/);
        if (request.method === "POST" && escrowOtpMatch) {
            const escrow = await findEscrow(escrowOtpMatch[1]);
            if (!escrow) return sendJson(response, 404, { error: "Escrow not found." });

            const payload = await readJson(request);
            const email = normalizeEmail(payload.email);
            const role = roleForEmail(escrow, email);
            if (!role) return sendJson(response, 403, { error: "Use the buyer or seller email attached to this escrow." });

            const rateLimit = checkOtpRateLimit(escrow.id, email);
            if (!rateLimit.allowed) {
                return sendJson(response, 429, {
                    error: `Too many access code requests. Try again in ${rateLimit.retryAfterSeconds} seconds.`
                });
            }

            const code = createOtp();
            await storage.upsertOtp({
                escrowId: escrow.id,
                email,
                code,
                expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString()
            });
            const emailResult = await sendEscrowOtpEmail({ to: email, code, escrow });

            const body = {
                message: "Access code generated. Email delivery is simulated in this MVP.",
                emailSent: emailResult.sent
            };
            if (emailResult.sent) {
                body.message = "Access code sent.";
            }
            if (shouldExposeDevCode()) {
                body.devCode = code;
                body.devEmailFallback = emailResult.devOnly || false;
            }

            return sendJson(response, 200, body);
        }

        const escrowOtpVerifyMatch = pathname.match(/^\/api\/escrows\/([^/]+)\/otp\/verify$/);
        if (request.method === "POST" && escrowOtpVerifyMatch) {
            const escrow = await findEscrow(escrowOtpVerifyMatch[1]);
            if (!escrow) return sendJson(response, 404, { error: "Escrow not found." });

            const payload = await readJson(request);
            const email = normalizeEmail(payload.email);
            const code = String(payload.code || "").trim();
            const otp = await storage.getValidOtp(escrow.id, email, code, Date.now());
            const role = roleForEmail(escrow, email);
            if (!role || !otp) return sendJson(response, 403, { error: "Invalid or expired access code." });

            const token = createToken();
            await storage.deleteOtp(otp);
            await storage.createSession({
                escrowId: escrow.id,
                email,
                token,
                expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString()
            });

            return sendJson(response, 200, { escrow: publicEscrow(escrow), role, token });
        }

        const escrowActionMatch = pathname.match(/^\/api\/escrows\/([^/]+)\/actions$/);
        if (request.method === "PATCH" && escrowActionMatch) {
            const escrow = await findEscrow(escrowActionMatch[1]);
            if (!escrow) return sendJson(response, 404, { error: "Escrow not found." });

            const payload = await readJson(request);
            const session = await getValidSession(escrow, payload.token);
            if (!session || !session.role) return sendJson(response, 403, { error: "Valid email session required." });

            const result = await applyLifecycleAction(escrow, session.role, payload.action, session.email, payload);
            if (result.error) return sendJson(response, 400, result);
            return sendJson(response, 200, { ...result, role: session.role });
        }

        const escrowPaymentInitMatch = pathname.match(/^\/api\/escrows\/([^/]+)\/payments\/initialize$/);
        if (request.method === "POST" && escrowPaymentInitMatch) {
            const escrow = await findEscrow(escrowPaymentInitMatch[1]);
            if (!escrow) return sendJson(response, 404, { error: "Escrow not found." });

            const payload = await readJson(request);
            const session = await getEscrowPartySession(escrow, payload);
            if (!session) return sendJson(response, 403, { error: "Valid escrow session required." });

            const result = await initializeBuyerFunding(escrow, session);
            if (result.error) return sendJson(response, 400, result);
            return sendJson(response, 201, { ...result, role: session.role });
        }

        const escrowPaymentVerifyMatch = pathname.match(/^\/api\/escrows\/([^/]+)\/payments\/verify$/);
        if (request.method === "POST" && escrowPaymentVerifyMatch) {
            const escrow = await findEscrow(escrowPaymentVerifyMatch[1]);
            if (!escrow) return sendJson(response, 404, { error: "Escrow not found." });

            const payload = await readJson(request);
            const session = await getEscrowPartySession(escrow, payload);
            if (!session) return sendJson(response, 403, { error: "Valid escrow session required." });

            const result = await verifyBuyerFunding(escrow, session, payload.providerReference);
            if (result.error) return sendJson(response, 400, result);
            return sendJson(response, 200, { ...result, role: session.role });
        }

        const escrowWithdrawalMatch = pathname.match(/^\/api\/escrows\/([^/]+)\/withdrawals$/);
        if ((request.method === "GET" || request.method === "POST") && escrowWithdrawalMatch) {
            const escrow = await findEscrow(escrowWithdrawalMatch[1]);
            if (!escrow) return sendJson(response, 404, { error: "Escrow not found." });

            const payload = request.method === "POST" ? await readJson(request) : { token: url.searchParams.get("token") };
            const sellerAccess = await requireSellerAccess(request, response, url, escrow, payload);
            if (!sellerAccess) return;

            if (request.method === "GET") {
                const withdrawals = await storage.listWithdrawalRequestsForEscrow(escrow.id);
                return sendJson(response, 200, {
                    withdrawals: withdrawals.map((item) => publicWithdrawal(item, true))
                });
            }

            const payoutDestination = cleanPayoutDestination(payload.payoutDestination || payload);
            const destinationError = validatePayoutDestination(payoutDestination);
            if (destinationError) return sendJson(response, 400, { error: destinationError });

            const result = await requestSellerWithdrawal(escrow, sellerAccess, payoutDestination);
            if (result.error) return sendJson(response, 400, result);
            return sendJson(response, 201, result);
        }

        if (request.method === "GET" && pathname === "/api/account/withdrawals") {
            const user = await requireAccountUser(request, response, url);
            if (!user) return;

            const withdrawals = await storage.listWithdrawalRequestsForAccount(user.id, user.email);
            return sendJson(response, 200, {
                withdrawals: withdrawals.map((item) => publicWithdrawal(item, false))
            });
        }

        const internalWithdrawalPaidMatch = pathname.match(/^\/api\/internal\/withdrawals\/([^/]+)\/paid$/);
        if (request.method === "PATCH" && internalWithdrawalPaidMatch) {
            const internalSecret = process.env.INTERNAL_API_SECRET || "";
            const suppliedSecret = request.headers["x-internal-api-secret"] || "";
            if (!internalSecret || suppliedSecret !== internalSecret) {
                return sendJson(response, 403, { error: "Internal access required." });
            }

            const result = await markWithdrawalPaid(internalWithdrawalPaidMatch[1], "internal");
            if (result.error) return sendJson(response, 400, result);
            return sendJson(response, 200, result);
        }

        if (request.method === "GET" && pathname === "/api/wallet") {
            return sendJson(response, 401, { error: "Use account wallet or escrow OTP access." });
        }

        if (sendStatic(request, response, url)) return;

        return sendJson(response, 404, { error: "Route not found." });
    } catch (error) {
        return sendJson(response, 500, { error: error.message || "Unexpected server error." });
    }
}

async function initializeRuntime() {
    if (!runtimeReady) {
        runtimeReady = (async () => {
            validateProductionConfig();
            storage = await createStorage();
            paymentProvider = createPaymentProvider();
            return { storage, paymentProvider };
        })();
    }
    return runtimeReady;
}

async function startServer() {
    await initializeRuntime();
    http.createServer(handleRequest).listen(PORT, () => {
        console.log(`BlackCrow API listening on http://127.0.0.1:${PORT}`);
        console.log(`Storage mode: ${storage.mode}`);
        console.log(`Payment provider: ${paymentProvider.name}`);
    });
}

async function serverlessHandler(request, response) {
    try {
        await initializeRuntime();
        return handleRequest(request, response);
    } catch (error) {
        response.writeHead(500, {
            "Content-Type": "application/json",
            ...securityHeaders(request.headers.origin || "")
        });
        response.end(JSON.stringify({
            error: error.message || "Server initialization failed."
        }));
    }
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
}

module.exports = { handleRequest: serverlessHandler, initializeRuntime };
