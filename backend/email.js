const RESEND_API_URL = "https://api.resend.com/emails";

function emailConfigured() {
    return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

function shouldExposeDevCode() {
    return process.env.NODE_ENV !== "production";
}

async function sendEscrowOtpEmail({ to, code, escrow }) {
    const subject = `Your BlackCrow access code for ${escrow.id}`;
    const text = [
        `Your BlackCrow access code is ${code}.`,
        "",
        `Escrow: ${escrow.id}`,
        `Item: ${escrow.item}`,
        "",
        "This code expires in 10 minutes. If you did not request it, you can ignore this email."
    ].join("\n");
    const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
            <p>Your BlackCrow access code is:</p>
            <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
            <p><strong>Escrow:</strong> ${escapeHtml(escrow.id)}</p>
            <p><strong>Item:</strong> ${escapeHtml(escrow.item)}</p>
            <p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
        </div>
    `;

    if (!emailConfigured()) {
        return {
            sent: false,
            devOnly: true,
            reason: "RESEND_API_KEY and RESEND_FROM_EMAIL are not configured."
        };
    }

    const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL,
            to,
            subject,
            html,
            text
        })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Email provider rejected the OTP email.");
    }

    return { sent: true, provider: "resend", id: data.id };
}

async function sendPasswordResetEmail({ to, resetUrl, user }) {
    const subject = "Reset your BlackCrow password";
    const text = [
        `Hello ${user.fullName || "there"},`,
        "",
        "Use the secure link below to reset your BlackCrow password:",
        resetUrl,
        "",
        "This link expires in 30 minutes. If you did not request it, you can ignore this email."
    ].join("\n");
    const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
            <p>Hello ${escapeHtml(user.fullName || "there")},</p>
            <p>Use the secure link below to reset your BlackCrow password.</p>
            <p>
                <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#f0b35a;color:#111827;border-radius:10px;text-decoration:none;font-weight:700">
                    Reset password
                </a>
            </p>
            <p style="word-break:break-all"><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>
            <p>This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>
        </div>
    `;

    if (!emailConfigured()) {
        return {
            sent: false,
            devOnly: true,
            reason: "RESEND_API_KEY and RESEND_FROM_EMAIL are not configured."
        };
    }

    const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL,
            to,
            subject,
            html,
            text
        })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Email provider rejected the password reset email.");
    }

    return { sent: true, provider: "resend", id: data.id };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
    }[character]));
}

module.exports = {
    emailConfigured,
    sendEscrowOtpEmail,
    sendPasswordResetEmail,
    shouldExposeDevCode
};
