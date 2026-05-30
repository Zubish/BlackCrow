const fs = require("fs");
const path = require("path");

loadEnv();

const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 5000}/api`;
const smokeDomain = "example.com";

async function main() {
    let escrowId = "";
    const buyerEmail = `buyer-${Date.now()}@${smokeDomain}`;
    const sellerEmail = `seller-${Date.now()}@${smokeDomain}`;

    try {
        const created = await request("/escrows", {
            method: "POST",
            body: {
                buyer: "Smoke Buyer",
                seller: "Smoke Seller",
                buyerEmail,
                sellerEmail,
                amount: 7500,
                item: "Smoke test item",
                condition: "Buyer confirms delivery",
                terms: {
                    category: "General goods",
                    itemCondition: "New",
                    quantity: "1",
                    deliveryMethod: "Home delivery",
                    preferredCourier: "Smoke Courier",
                    shippingResponsibility: "Seller handles shipping",
                    inspectionDays: 2
                },
                initiatorRole: "buyer"
            }
        });
        escrowId = created.escrow.id;

        const buyer = await verifyParty(escrowId, buyerEmail);
        const seller = await verifyParty(escrowId, sellerEmail);

        await request(`/escrows/${escrowId}/actions`, {
            method: "PATCH",
            body: { token: buyer.token, action: "accept" }
        });
        await request(`/escrows/${escrowId}/actions`, {
            method: "PATCH",
            body: { token: seller.token, action: "accept" }
        });

        const payment = await request(`/escrows/${escrowId}/payments/initialize`, {
            method: "POST",
            body: { token: buyer.token }
        });
        await request(`/escrows/${escrowId}/payments/verify`, {
            method: "POST",
            body: {
                token: buyer.token,
                providerReference: payment.payment.providerReference
            }
        });
        await request(`/escrows/${escrowId}/actions`, {
            method: "PATCH",
            body: {
                token: seller.token,
                action: "dispatch",
                dispatchProof: {
                    courierName: "Smoke Courier",
                    waybillNumber: `SMK-${Date.now()}`,
                    dispatchNote: "Smoke test dispatch proof."
                }
            }
        });
        await request(`/escrows/${escrowId}/actions`, {
            method: "PATCH",
            body: { token: seller.token, action: "deliver" }
        });
        await request(`/escrows/${escrowId}/actions`, {
            method: "PATCH",
            body: { token: buyer.token, action: "release" }
        });
        const withdrawal = await request(`/escrows/${escrowId}/withdrawals`, {
            method: "POST",
            body: {
                token: seller.token,
                payoutDestination: {
                    bankName: "Smoke Test Bank",
                    accountName: "Smoke Seller",
                    accountNumber: "0123456789"
                }
            }
        });

        console.log(JSON.stringify({
            ok: true,
            escrowId,
            withdrawalStatus: withdrawal.withdrawal.status,
            withdrawn: withdrawal.escrow.lifecycle.withdrawn
        }, null, 2));
    } finally {
        await cleanupSmokeEscrow(escrowId);
    }
}

async function request(route, options = {}) {
    const response = await fetch(`${baseUrl}${route}`, {
        method: options.method || "GET",
        headers: { "Content-Type": "application/json" },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(`${options.method || "GET"} ${route} -> ${response.status}: ${data.error || "failed"}`);
    }
    return data;
}

async function verifyParty(escrowId, email) {
    const otp = await request(`/escrows/${encodeURIComponent(escrowId)}/otp`, {
        method: "POST",
        body: { email }
    });
    if (!otp.devCode) {
        throw new Error("Smoke test requires development OTP codes. Do not run this against production.");
    }
    return request(`/escrows/${encodeURIComponent(escrowId)}/otp/verify`, {
        method: "POST",
        body: { email, code: otp.devCode }
    });
}

async function cleanupSmokeEscrow(escrowId) {
    if (!escrowId || !process.env.DATABASE_URL) return;

    let Pool;
    try {
        ({ Pool } = require("pg"));
    } catch (error) {
        return;
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });
    try {
        await pool.query(
            "delete from escrows where id = $1 and (buyer_email like $2 or seller_email like $2)",
            [escrowId, `%@${smokeDomain}`]
        );
    } finally {
        await pool.end();
    }
}

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

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
