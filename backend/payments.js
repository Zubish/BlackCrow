const crypto = require("crypto");

function createPaymentProvider() {
    if (process.env.PAYMENT_PROVIDER === "paystack") {
        return createPaystackProvider();
    }

    return createSimulatedProvider();
}

function createSimulatedProvider() {
    return {
        name: "simulated",

        async initialize({ escrow }) {
            const reference = `sim_${crypto.randomBytes(12).toString("hex")}`;
            return {
                provider: "simulated",
                providerReference: reference,
                authorizationUrl: `simulated://pay/${reference}`,
                rawResponse: {
                    status: true,
                    message: "Simulated payment initialized.",
                    reference,
                    amount: escrow.amount
                }
            };
        },

        async verify({ reference }) {
            return {
                verified: true,
                provider: "simulated",
                providerReference: reference,
                rawResponse: {
                    status: true,
                    message: "Simulated payment verified.",
                    reference
                }
            };
        }
    };
}

function createPaystackProvider() {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const publicAppUrl = String(process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
    if (!secretKey) {
        throw new Error("PAYMENT_PROVIDER=paystack requires PAYSTACK_SECRET_KEY.");
    }

    return {
        name: "paystack",

        async initialize({ escrow, buyerEmail }) {
            const reference = `bc_${escrow.id.toLowerCase()}_${crypto.randomBytes(8).toString("hex")}`;
            const body = {
                email: buyerEmail,
                amount: Math.round(Number(escrow.amount) * 100),
                reference,
                metadata: {
                    escrowId: escrow.id,
                    buyerEmail
                }
            };
            if (publicAppUrl) {
                body.callback_url = `${publicAppUrl}/track-escrow.html?id=${encodeURIComponent(escrow.id)}`;
            }

            const response = await fetch("https://api.paystack.co/transaction/initialize", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${secretKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.status) {
                throw new Error(data.message || "Paystack payment initialization failed.");
            }

            return {
                provider: "paystack",
                providerReference: data.data.reference,
                authorizationUrl: data.data.authorization_url,
                rawResponse: data
            };
        },

        async verify({ reference }) {
            const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
                headers: {
                    Authorization: `Bearer ${secretKey}`
                }
            });
            const data = await response.json().catch(() => ({}));
            const verified = Boolean(response.ok && data.status && data.data?.status === "success");

            return {
                verified,
                provider: "paystack",
                providerReference: reference,
                rawResponse: data
            };
        }
    };
}

module.exports = { createPaymentProvider };
