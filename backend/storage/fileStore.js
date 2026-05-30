const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data.json");

const defaultStore = {
    users: [],
    userSessions: [],
    passwordResets: [],
    escrows: [],
    payments: [],
    withdrawals: [],
    disputeEvidence: [],
    otps: [],
    sessions: [],
    events: []
};

function loadStore() {
    try {
        if (!fs.existsSync(DATA_FILE)) return { ...defaultStore };
        return { ...defaultStore, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
    } catch (error) {
        return { ...defaultStore };
    }
}

function saveStore(store) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function createFileStore() {
    const store = loadStore();

    return {
        mode: "file",

        async countEscrows() {
            return store.escrows.length;
        },

        async getUserByEmail(email) {
            return store.users.find((user) => user.email === email) || null;
        },

        async getUserById(id) {
            return store.users.find((user) => user.id === id) || null;
        },

        async createUser(user) {
            store.users.unshift(user);
            saveStore(store);
            return user;
        },

        async updateUserPassword(userId, passwordHash, updatedAt) {
            let updatedUser = null;
            store.users = store.users.map((user) => {
                if (user.id !== userId) return user;
                updatedUser = {
                    ...user,
                    passwordHash,
                    updatedAt
                };
                return updatedUser;
            });
            saveStore(store);
            return updatedUser;
        },

        async deleteUserSessions(userId) {
            store.userSessions = store.userSessions.filter((session) => session.userId !== userId);
            saveStore(store);
        },

        async createUserSession(session) {
            store.userSessions.push(session);
            saveStore(store);
            return session;
        },

        async getValidUserSession(token, nowMs) {
            return store.userSessions.find((item) => (
                item.token === token
                && new Date(item.expiresAt).getTime() > nowMs
            )) || null;
        },

        async createPasswordReset(reset) {
            store.passwordResets.unshift(reset);
            saveStore(store);
            return reset;
        },

        async getValidPasswordReset(tokenHash, nowMs) {
            return store.passwordResets.find((reset) => (
                reset.tokenHash === tokenHash
                && !reset.usedAt
                && new Date(reset.expiresAt).getTime() > nowMs
            )) || null;
        },

        async markPasswordResetUsed(id, usedAt) {
            store.passwordResets = store.passwordResets.map((reset) => (
                reset.id === id ? { ...reset, usedAt } : reset
            ));
            saveStore(store);
        },

        async listEscrows(email = "") {
            if (!email) return [...store.escrows];
            return store.escrows.filter((escrow) => escrow.buyerEmail === email || escrow.sellerEmail === email);
        },

        async listEscrowsForAccount(userId, email) {
            return store.escrows.filter((escrow) => (
                escrow.creatorUserId === userId
                || escrow.buyerEmail === email
                || escrow.sellerEmail === email
            ));
        },

        async getEscrow(id) {
            return store.escrows.find((escrow) => escrow.id.toUpperCase() === String(id || "").toUpperCase()) || null;
        },

        async createEscrow(escrow) {
            store.escrows.unshift(escrow);
            saveStore(store);
            return escrow;
        },

        async updateEscrow(escrow) {
            store.escrows = store.escrows.map((item) => (item.id === escrow.id ? escrow : item));
            saveStore(store);
            return escrow;
        },

        async createDisputeEvidence(evidence) {
            store.disputeEvidence.unshift(evidence);
            saveStore(store);
            return evidence;
        },

        async listDisputeEvidenceForEscrow(escrowId) {
            return store.disputeEvidence
                .filter((evidence) => evidence.escrowId === escrowId)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        },

        async listDisputedEscrows(limit = 50) {
            return store.escrows
                .filter((escrow) => escrow.lifecycle?.disputed || ["open", "extended_review"].includes(escrow.dispute?.status))
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                .slice(0, limit);
        },

        async createPaymentInitialization(payment) {
            store.payments.unshift(payment);
            saveStore(store);
            return payment;
        },

        async getPaymentInitializationByReference(provider, providerReference) {
            return store.payments.find((payment) => (
                payment.provider === provider && payment.providerReference === providerReference
            )) || null;
        },

        async getLatestPaymentInitializationForEscrow(escrowId) {
            return store.payments.find((payment) => payment.escrowId === escrowId) || null;
        },

        async markPaymentVerified({ provider, providerReference, rawResponse, verifiedAt }) {
            let verifiedPayment = null;
            store.payments = store.payments.map((payment) => {
                if (payment.provider !== provider || payment.providerReference !== providerReference) {
                    return payment;
                }
                verifiedPayment = {
                    ...payment,
                    status: "verified",
                    rawResponse,
                    verifiedAt,
                    updatedAt: verifiedAt
                };
                return verifiedPayment;
            });
            saveStore(store);
            return verifiedPayment;
        },

        async fundEscrowFromPayment({ escrowId, provider, providerReference, actorEmail, fundedAt }) {
            const payment = await this.getPaymentInitializationByReference(provider, providerReference);
            if (!payment || payment.escrowId !== escrowId || payment.status !== "verified") {
                return null;
            }

            const escrow = await this.getEscrow(escrowId);
            if (!escrow) return null;

            const lifecycle = {
                ...(escrow.lifecycle || {}),
                paymentInitialized: true,
                paymentConfirmed: true,
                funded: true
            };
            const fundedEscrow = {
                ...escrow,
                lifecycle,
                status: "review",
                note: "Buyer funding confirmed. Waiting for seller delivery.",
                updatedAt: fundedAt
            };
            await this.updateEscrow(fundedEscrow);
            await this.addEvent({
                id: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                escrowId,
                type: "escrow.funded",
                actorEmail,
                message: "Buyer funding was verified.",
                createdAt: fundedAt
            });
            return fundedEscrow;
        },

        async createWithdrawalRequest(withdrawal) {
            const escrow = await this.getEscrow(withdrawal.escrowId);
            if (!escrow) throw new Error("Escrow not found.");
            const lifecycle = escrow.lifecycle || {};
            if (escrow.sellerEmail !== withdrawal.sellerEmail) throw new Error("Seller access required.");
            if (!lifecycle.released) throw new Error("Funds must be released before withdrawal can be requested.");
            if (lifecycle.withdrawn) throw new Error("This escrow has already been paid out.");
            const active = await this.getActiveWithdrawalRequestForEscrow(withdrawal.escrowId);
            if (active) throw new Error("A withdrawal request already exists for this escrow.");

            store.withdrawals.unshift(withdrawal);
            saveStore(store);
            return withdrawal;
        },

        async getWithdrawalRequest(id) {
            return store.withdrawals.find((withdrawal) => withdrawal.id === id) || null;
        },

        async getActiveWithdrawalRequestForEscrow(escrowId) {
            return store.withdrawals.find((withdrawal) => (
                withdrawal.escrowId === escrowId
                && ["requested", "approved", "processing", "paid"].includes(withdrawal.status)
            )) || null;
        },

        async listWithdrawalRequestsForAccount(userId, email) {
            return store.withdrawals.filter((withdrawal) => (
                withdrawal.sellerUserId === userId || withdrawal.sellerEmail === email
            ));
        },

        async listWithdrawalRequestsForEscrow(escrowId) {
            return store.withdrawals.filter((withdrawal) => withdrawal.escrowId === escrowId);
        },

        async markWithdrawalPaid({ id, paidAt, rawResponse }) {
            const withdrawal = await this.getWithdrawalRequest(id);
            if (!withdrawal || withdrawal.status === "paid") return null;

            const escrow = await this.getEscrow(withdrawal.escrowId);
            if (!escrow) return null;

            const paidWithdrawal = {
                ...withdrawal,
                status: "paid",
                rawResponse: rawResponse || {},
                paidAt,
                updatedAt: paidAt
            };
            store.withdrawals = store.withdrawals.map((item) => (item.id === id ? paidWithdrawal : item));

            const paidEscrow = {
                ...escrow,
                lifecycle: {
                    ...(escrow.lifecycle || {}),
                    withdrawalRequested: true,
                    withdrawn: true
                },
                note: "Seller payout was marked paid.",
                updatedAt: paidAt
            };
            store.escrows = store.escrows.map((item) => (item.id === paidEscrow.id ? paidEscrow : item));
            saveStore(store);
            return { withdrawal: paidWithdrawal, escrow: paidEscrow };
        },

        async nextEscrowId() {
            return `BC-${2401 + store.escrows.length}`;
        },

        async addEvent(event) {
            store.events.unshift(event);
            saveStore(store);
            return event;
        },

        async listEventsForAccount(userId, email, limit = 20) {
            const escrowIds = new Set(
                store.escrows
                    .filter((escrow) => (
                        escrow.creatorUserId === userId
                        || escrow.buyerEmail === email
                        || escrow.sellerEmail === email
                    ))
                    .map((escrow) => escrow.id)
            );
            return store.events
                .filter((event) => escrowIds.has(event.escrowId))
                .slice(0, limit);
        },

        async upsertOtp(otp) {
            store.otps = store.otps.filter((item) => !(item.escrowId === otp.escrowId && item.email === otp.email));
            store.otps.push(otp);
            saveStore(store);
            return otp;
        },

        async getValidOtp(escrowId, email, code, nowMs) {
            return store.otps.find((item) => (
                item.escrowId === escrowId
                && item.email === email
                && item.code === code
                && new Date(item.expiresAt).getTime() > nowMs
            )) || null;
        },

        async deleteOtp(otp) {
            store.otps = store.otps.filter((item) => item !== otp);
            saveStore(store);
        },

        async createSession(session) {
            store.sessions.push(session);
            saveStore(store);
            return session;
        },

        async getValidSession(escrowId, token, nowMs) {
            return store.sessions.find((item) => (
                item.escrowId === escrowId
                && item.token === token
                && new Date(item.expiresAt).getTime() > nowMs
            )) || null;
        }
    };
}

module.exports = { createFileStore };
