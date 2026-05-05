function toCamelEscrow(row) {
    if (!row) return null;
    return {
        id: row.id,
        buyer: row.buyer_name,
        seller: row.seller_name,
        buyerEmail: row.buyer_email,
        sellerEmail: row.seller_email,
        amount: Number(row.amount),
        status: row.status,
        condition: row.condition,
        inspectionDays: Number(row.inspection_days),
        item: row.item,
        note: row.note,
        initiatorRole: row.initiator_role,
        creatorUserId: row.creator_user_id,
        creationMode: row.creation_mode,
        lifecycle: row.lifecycle || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toCamelUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        passwordHash: row.password_hash,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toCamelWithdrawal(row) {
    if (!row) return null;
    return {
        id: row.id,
        escrowId: row.escrow_id,
        sellerEmail: row.seller_email,
        sellerUserId: row.seller_user_id,
        amount: Number(row.amount),
        status: row.status,
        payoutDestination: row.payout_destination || {},
        provider: row.provider,
        providerReference: row.provider_reference,
        rawResponse: row.raw_response || {},
        failureReason: row.failure_reason,
        requestedAt: row.requested_at,
        approvedAt: row.approved_at,
        processingAt: row.processing_at,
        paidAt: row.paid_at,
        rejectedAt: row.rejected_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function toDbTimestamp(value) {
    return new Date(value).toISOString();
}

async function createPostgresStore() {
    let Pool;
    try {
        ({ Pool } = require("pg"));
    } catch (error) {
        throw new Error("DATABASE_URL is set, but the pg package is not installed. Run npm install first.");
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });

    return {
        mode: "postgres",

        async countEscrows() {
            const result = await pool.query("select count(*)::int as count from escrows");
            return result.rows[0].count;
        },

        async getUserByEmail(email) {
            const result = await pool.query("select * from users where email = $1", [email]);
            return toCamelUser(result.rows[0]);
        },

        async getUserById(id) {
            const result = await pool.query("select * from users where id = $1", [id]);
            return toCamelUser(result.rows[0]);
        },

        async createUser(user) {
            const result = await pool.query(
                `insert into users (id, full_name, email, password_hash, created_at, updated_at)
                 values ($1, $2, $3, $4, $5, $6)
                 returning *`,
                [
                    user.id,
                    user.fullName,
                    user.email,
                    user.passwordHash,
                    toDbTimestamp(user.createdAt),
                    toDbTimestamp(user.updatedAt)
                ]
            );
            return toCamelUser(result.rows[0]);
        },

        async createUserSession(session) {
            await pool.query(
                `insert into user_sessions (user_id, token, expires_at)
                 values ($1, $2, $3)`,
                [session.userId, session.token, toDbTimestamp(session.expiresAt)]
            );
            return session;
        },

        async getValidUserSession(token, nowMs) {
            const result = await pool.query(
                `select user_id as "userId", token, expires_at as "expiresAt"
                 from user_sessions
                 where token = $1 and expires_at > $2`,
                [token, toDbTimestamp(nowMs)]
            );
            return result.rows[0] || null;
        },

        async listEscrows(email = "") {
            const result = email
                ? await pool.query(
                    `select * from escrows
                     where buyer_email = $1 or seller_email = $1
                     order by created_at desc`,
                    [email]
                )
                : await pool.query("select * from escrows order by created_at desc");
            return result.rows.map(toCamelEscrow);
        },

        async listEscrowsForAccount(userId, email) {
            const result = await pool.query(
                `select * from escrows
                 where creator_user_id = $1 or buyer_email = $2 or seller_email = $2
                 order by created_at desc`,
                [userId, email]
            );
            return result.rows.map(toCamelEscrow);
        },

        async getEscrow(id) {
            const result = await pool.query("select * from escrows where upper(id) = upper($1)", [id]);
            return toCamelEscrow(result.rows[0]);
        },

        async createEscrow(escrow) {
            const result = await pool.query(
                `insert into escrows (
                    id, buyer_name, seller_name, buyer_email, seller_email, amount, status,
                    condition, inspection_days, item, note, initiator_role, creator_user_id, creation_mode,
                    lifecycle, created_at, updated_at
                ) values (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11, $12, $13, $14,
                    $15, $16, $17
                )
                returning *`,
                [
                    escrow.id,
                    escrow.buyer,
                    escrow.seller,
                    escrow.buyerEmail,
                    escrow.sellerEmail,
                    escrow.amount,
                    escrow.status,
                    escrow.condition,
                    escrow.inspectionDays,
                    escrow.item,
                    escrow.note,
                    escrow.initiatorRole,
                    escrow.creatorUserId,
                    escrow.creationMode,
                    escrow.lifecycle,
                    toDbTimestamp(escrow.createdAt),
                    toDbTimestamp(escrow.updatedAt)
                ]
            );
            return toCamelEscrow(result.rows[0]);
        },

        async updateEscrow(escrow) {
            const result = await pool.query(
                `update escrows
                 set status = $2,
                     note = $3,
                     lifecycle = $4,
                     updated_at = $5
                 where id = $1
                 returning *`,
                [
                    escrow.id,
                    escrow.status,
                    escrow.note,
                    escrow.lifecycle,
                    toDbTimestamp(escrow.updatedAt)
                ]
            );
            return toCamelEscrow(result.rows[0]);
        },

        async createPaymentInitialization(payment) {
            const result = await pool.query(
                `insert into payment_initializations (
                    id, escrow_id, provider, provider_reference, status, amount, buyer_email,
                    authorization_url, raw_response, verified_at, created_at, updated_at
                ) values (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11, $12
                )
                returning id,
                          escrow_id as "escrowId",
                          provider,
                          provider_reference as "providerReference",
                          status,
                          amount,
                          buyer_email as "buyerEmail",
                          authorization_url as "authorizationUrl",
                          raw_response as "rawResponse",
                          verified_at as "verifiedAt",
                          created_at as "createdAt",
                          updated_at as "updatedAt"`,
                [
                    payment.id,
                    payment.escrowId,
                    payment.provider,
                    payment.providerReference,
                    payment.status,
                    payment.amount,
                    payment.buyerEmail,
                    payment.authorizationUrl,
                    payment.rawResponse,
                    payment.verifiedAt,
                    toDbTimestamp(payment.createdAt),
                    toDbTimestamp(payment.updatedAt)
                ]
            );
            return result.rows[0];
        },

        async getPaymentInitializationByReference(provider, providerReference) {
            const result = await pool.query(
                `select id,
                        escrow_id as "escrowId",
                        provider,
                        provider_reference as "providerReference",
                        status,
                        amount,
                        buyer_email as "buyerEmail",
                        authorization_url as "authorizationUrl",
                        raw_response as "rawResponse",
                        verified_at as "verifiedAt",
                        created_at as "createdAt",
                        updated_at as "updatedAt"
                 from payment_initializations
                 where provider = $1 and provider_reference = $2`,
                [provider, providerReference]
            );
            return result.rows[0] || null;
        },

        async getLatestPaymentInitializationForEscrow(escrowId) {
            const result = await pool.query(
                `select id,
                        escrow_id as "escrowId",
                        provider,
                        provider_reference as "providerReference",
                        status,
                        amount,
                        buyer_email as "buyerEmail",
                        authorization_url as "authorizationUrl",
                        raw_response as "rawResponse",
                        verified_at as "verifiedAt",
                        created_at as "createdAt",
                        updated_at as "updatedAt"
                 from payment_initializations
                 where escrow_id = $1
                 order by created_at desc
                 limit 1`,
                [escrowId]
            );
            return result.rows[0] || null;
        },

        async markPaymentVerified({ provider, providerReference, rawResponse, verifiedAt }) {
            const result = await pool.query(
                `update payment_initializations
                 set status = 'verified',
                     raw_response = $3,
                     verified_at = $4,
                     updated_at = $4
                 where provider = $1 and provider_reference = $2
                 returning id,
                           escrow_id as "escrowId",
                           provider,
                           provider_reference as "providerReference",
                           status,
                           amount,
                           buyer_email as "buyerEmail",
                           authorization_url as "authorizationUrl",
                           raw_response as "rawResponse",
                           verified_at as "verifiedAt",
                           created_at as "createdAt",
                           updated_at as "updatedAt"`,
                [provider, providerReference, rawResponse, toDbTimestamp(verifiedAt)]
            );
            return result.rows[0] || null;
        },

        async fundEscrowFromPayment({ escrowId, provider, providerReference, actorEmail, fundedAt }) {
            const client = await pool.connect();
            try {
                await client.query("begin");
                const paymentResult = await client.query(
                    `select *
                     from payment_initializations
                     where provider = $1 and provider_reference = $2 and escrow_id = $3
                     for update`,
                    [provider, providerReference, escrowId]
                );
                const payment = paymentResult.rows[0];
                if (!payment || payment.status !== "verified") {
                    await client.query("rollback");
                    return null;
                }

                const escrowResult = await client.query(
                    "select * from escrows where id = $1 for update",
                    [escrowId]
                );
                const escrow = escrowResult.rows[0];
                if (!escrow) {
                    await client.query("rollback");
                    return null;
                }

                const lifecycle = {
                    ...(escrow.lifecycle || {}),
                    paymentInitialized: true,
                    paymentConfirmed: true,
                    funded: true
                };
                const updatedEscrowResult = await client.query(
                    `update escrows
                     set status = 'review',
                         note = 'Buyer funding confirmed. Waiting for seller delivery.',
                         lifecycle = $2,
                         updated_at = $3
                     where id = $1
                     returning *`,
                    [escrowId, lifecycle, toDbTimestamp(fundedAt)]
                );
                await client.query(
                    `insert into escrow_events (id, escrow_id, type, actor_email, message, created_at)
                     values ($1, $2, $3, $4, $5, $6)`,
                    [
                        `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                        escrowId,
                        "escrow.funded",
                        actorEmail,
                        "Buyer funding was verified.",
                        toDbTimestamp(fundedAt)
                    ]
                );
                await client.query("commit");
                return toCamelEscrow(updatedEscrowResult.rows[0]);
            } catch (error) {
                await client.query("rollback");
                throw error;
            } finally {
                client.release();
            }
        },

        async createWithdrawalRequest(withdrawal) {
            const client = await pool.connect();
            try {
                await client.query("begin");
                const escrowResult = await client.query(
                    "select * from escrows where id = $1 for update",
                    [withdrawal.escrowId]
                );
                const escrow = escrowResult.rows[0];
                if (!escrow) throw new Error("Escrow not found.");

                const lifecycle = escrow.lifecycle || {};
                if (escrow.seller_email !== withdrawal.sellerEmail) {
                    throw new Error("Seller access required.");
                }
                if (!lifecycle.released) {
                    throw new Error("Funds must be released before withdrawal can be requested.");
                }
                if (lifecycle.withdrawn) {
                    throw new Error("This escrow has already been paid out.");
                }

                const activeResult = await client.query(
                    `select * from withdrawal_requests
                     where escrow_id = $1 and status in ('requested', 'approved', 'processing', 'paid')
                     limit 1
                     for update`,
                    [withdrawal.escrowId]
                );
                if (activeResult.rows[0]) {
                    throw new Error("A withdrawal request already exists for this escrow.");
                }

                const result = await client.query(
                    `insert into withdrawal_requests (
                        id, escrow_id, seller_email, seller_user_id, amount, status,
                        payout_destination, provider, provider_reference, raw_response,
                        failure_reason, requested_at, approved_at, processing_at, paid_at,
                        rejected_at, created_at, updated_at
                    ) values (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10,
                        $11, $12, $13, $14, $15,
                        $16, $17, $18
                    )
                    returning *`,
                    [
                        withdrawal.id,
                        withdrawal.escrowId,
                        withdrawal.sellerEmail,
                        withdrawal.sellerUserId,
                        withdrawal.amount,
                        withdrawal.status,
                        withdrawal.payoutDestination,
                        withdrawal.provider,
                        withdrawal.providerReference,
                        withdrawal.rawResponse,
                        withdrawal.failureReason,
                        toDbTimestamp(withdrawal.requestedAt),
                        withdrawal.approvedAt ? toDbTimestamp(withdrawal.approvedAt) : null,
                        withdrawal.processingAt ? toDbTimestamp(withdrawal.processingAt) : null,
                        withdrawal.paidAt ? toDbTimestamp(withdrawal.paidAt) : null,
                        withdrawal.rejectedAt ? toDbTimestamp(withdrawal.rejectedAt) : null,
                        toDbTimestamp(withdrawal.createdAt),
                        toDbTimestamp(withdrawal.updatedAt)
                    ]
                );
                await client.query("commit");
                return toCamelWithdrawal(result.rows[0]);
            } catch (error) {
                await client.query("rollback");
                throw error;
            } finally {
                client.release();
            }
        },

        async getWithdrawalRequest(id) {
            const result = await pool.query("select * from withdrawal_requests where id = $1", [id]);
            return toCamelWithdrawal(result.rows[0]);
        },

        async getActiveWithdrawalRequestForEscrow(escrowId) {
            const result = await pool.query(
                `select * from withdrawal_requests
                 where escrow_id = $1 and status in ('requested', 'approved', 'processing', 'paid')
                 order by created_at desc
                 limit 1`,
                [escrowId]
            );
            return toCamelWithdrawal(result.rows[0]);
        },

        async listWithdrawalRequestsForAccount(userId, email) {
            const result = await pool.query(
                `select * from withdrawal_requests
                 where seller_user_id = $1 or seller_email = $2
                 order by created_at desc`,
                [userId, email]
            );
            return result.rows.map(toCamelWithdrawal);
        },

        async listWithdrawalRequestsForEscrow(escrowId) {
            const result = await pool.query(
                `select * from withdrawal_requests
                 where escrow_id = $1
                 order by created_at desc`,
                [escrowId]
            );
            return result.rows.map(toCamelWithdrawal);
        },

        async markWithdrawalPaid({ id, paidAt, rawResponse }) {
            const client = await pool.connect();
            try {
                await client.query("begin");
                const withdrawalResult = await client.query(
                    "select * from withdrawal_requests where id = $1 for update",
                    [id]
                );
                const withdrawal = withdrawalResult.rows[0];
                if (!withdrawal || withdrawal.status === "paid") {
                    await client.query("rollback");
                    return null;
                }

                const escrowResult = await client.query(
                    "select * from escrows where id = $1 for update",
                    [withdrawal.escrow_id]
                );
                const escrow = escrowResult.rows[0];
                if (!escrow) {
                    await client.query("rollback");
                    return null;
                }

                const paidWithdrawalResult = await client.query(
                    `update withdrawal_requests
                     set status = 'paid',
                         raw_response = $2,
                         paid_at = $3,
                         updated_at = $3
                     where id = $1
                     returning *`,
                    [id, rawResponse || {}, toDbTimestamp(paidAt)]
                );
                const lifecycle = {
                    ...(escrow.lifecycle || {}),
                    withdrawalRequested: true,
                    withdrawn: true
                };
                const paidEscrowResult = await client.query(
                    `update escrows
                     set note = 'Seller payout was marked paid.',
                         lifecycle = $2,
                         updated_at = $3
                     where id = $1
                     returning *`,
                    [withdrawal.escrow_id, lifecycle, toDbTimestamp(paidAt)]
                );

                await client.query("commit");
                return {
                    withdrawal: toCamelWithdrawal(paidWithdrawalResult.rows[0]),
                    escrow: toCamelEscrow(paidEscrowResult.rows[0])
                };
            } catch (error) {
                await client.query("rollback");
                throw error;
            } finally {
                client.release();
            }
        },

        async nextEscrowId() {
            const result = await pool.query("select nextval('escrow_number_seq') as value");
            return `BC-${result.rows[0].value}`;
        },

        async addEvent(event) {
            await pool.query(
                `insert into escrow_events (id, escrow_id, type, actor_email, message, created_at)
                 values ($1, $2, $3, $4, $5, $6)`,
                [event.id, event.escrowId, event.type, event.actorEmail, event.message, toDbTimestamp(event.createdAt)]
            );
            return event;
        },

        async listEventsForAccount(userId, email, limit = 20) {
            const result = await pool.query(
                `select events.id,
                        events.escrow_id as "escrowId",
                        events.type,
                        events.actor_email as "actorEmail",
                        events.message,
                        events.created_at as "createdAt"
                 from escrow_events events
                 join escrows on escrows.id = events.escrow_id
                 where escrows.creator_user_id = $1
                    or escrows.buyer_email = $2
                    or escrows.seller_email = $2
                 order by events.created_at desc
                 limit $3`,
                [userId, email, limit]
            );
            return result.rows;
        },

        async upsertOtp(otp) {
            await pool.query(
                `insert into escrow_otps (escrow_id, email, code, expires_at)
                 values ($1, $2, $3, $4)
                 on conflict (escrow_id, email)
                 do update set code = excluded.code, expires_at = excluded.expires_at`,
                [otp.escrowId, otp.email, otp.code, toDbTimestamp(otp.expiresAt)]
            );
            return otp;
        },

        async getValidOtp(escrowId, email, code, nowMs) {
            const result = await pool.query(
                `select escrow_id as "escrowId", email, code, expires_at as "expiresAt"
                 from escrow_otps
                 where escrow_id = $1 and email = $2 and code = $3 and expires_at > $4`,
                [escrowId, email, code, toDbTimestamp(nowMs)]
            );
            return result.rows[0] || null;
        },

        async deleteOtp(otp) {
            await pool.query(
                "delete from escrow_otps where escrow_id = $1 and email = $2 and code = $3",
                [otp.escrowId, otp.email, otp.code]
            );
        },

        async createSession(session) {
            await pool.query(
                `insert into escrow_sessions (escrow_id, email, token, expires_at)
                 values ($1, $2, $3, $4)`,
                [session.escrowId, session.email, session.token, toDbTimestamp(session.expiresAt)]
            );
            return session;
        },

        async getValidSession(escrowId, token, nowMs) {
            const result = await pool.query(
                `select escrow_id as "escrowId", email, token, expires_at as "expiresAt"
                 from escrow_sessions
                 where escrow_id = $1 and token = $2 and expires_at > $3`,
                [escrowId, token, toDbTimestamp(nowMs)]
            );
            return result.rows[0] || null;
        }
    };
}

module.exports = { createPostgresStore };
