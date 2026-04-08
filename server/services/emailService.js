const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.PASSWORD,
    },
});

/**
 * Send invite email with link to set password
 */
async function sendInviteEmail(toEmail, inviteToken, inviterName, role) {
    const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const inviteLink = `${baseUrl}/invite?token=${inviteToken}`;

    const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0f172a; color: #e2e8f0; border-radius: 12px;">
            <h2 style="margin: 0 0 8px; color: #fff;">You've been invited</h2>
            <p style="margin: 0 0 24px; color: #94a3b8;">
                ${inviterName} has invited you to <strong>Source One Analytics</strong> as ${role === 'admin' ? 'an' : 'a'} <strong>${role.replace('_', ' ')}</strong>.
            </p>
            <a href="${inviteLink}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Set Your Password
            </a>
            <p style="margin: 24px 0 0; font-size: 13px; color: #64748b;">
                This link expires in 7 days. If you didn't expect this invite, you can ignore this email.
            </p>
        </div>
    `;

    await transporter.sendMail({
        from: `"Source One" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: `You're invited to Source One Analytics`,
        html,
    });
}

/**
 * Send a generic email via the shared SMTP transport.
 * Used by automated reports, alerts, etc.
 *
 * @param {string|string[]} to - Recipient email(s)
 * @param {string} subject - Email subject line
 * @param {string} html - HTML email body
 */
async function sendEmail(to, subject, html) {
    const recipients = Array.isArray(to) ? to.join(', ') : to;
    await transporter.sendMail({
        from: `"Source One" <${process.env.SMTP_USER}>`,
        to: recipients,
        subject,
        html,
    });
}

module.exports = { sendInviteEmail, sendEmail };
