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
    const baseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
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
 * Send password reset email with secure token link
 */
async function sendPasswordResetEmail(toEmail, resetToken, userName) {
    const baseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

    const greeting = userName ? `Hello ${userName},` : 'Hello,';
    const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 36px 32px; background: #0f172a; color: #e2e8f0; border-radius: 14px; border: 1px solid #1e293b;">
            <div style="display: flex; align-items: center; margin-bottom: 24px;">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #14b8a6, #0d9488); display: inline-block; text-align: center; line-height: 32px; font-weight: 700; font-size: 14px; color: white; margin-right: 12px;">S1</div>
                <div style="font-size: 16px; font-weight: 600; color: #f8fafc; letter-spacing: -0.01em;">Source One <span style="font-size: 12px; color: #64748b; font-weight: 400; text-transform: uppercase; margin-left: 4px;">Analytics</span></div>
            </div>
            <h2 style="margin: 0 0 12px; color: #f8fafc; font-size: 20px; font-weight: 600;">Reset Your Password</h2>
            <p style="margin: 0 0 16px; color: #94a3b8; font-size: 14px; line-height: 1.6;">
                ${greeting}
            </p>
            <p style="margin: 0 0 24px; color: #94a3b8; font-size: 14px; line-height: 1.6;">
                We received a request to reset your password for your <strong>Source One Analytics</strong> account. Click the button below to choose a new password:
            </p>
            <div style="text-align: center; margin: 32px 0;">
                <a href="${resetLink}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
                    Reset Password
                </a>
            </div>
            <p style="margin: 24px 0 8px; font-size: 13px; color: #64748b; line-height: 1.5;">
                This link will expire in <strong>1 hour</strong>. If you did not request this password reset, please ignore this email and your password will remain unchanged.
            </p>
            <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0 16px;" />
            <p style="margin: 0; font-size: 11px; color: #475569; word-break: break-all;">
                Or copy and paste this link in your browser:<br/>
                <a href="${resetLink}" style="color: #38bdf8; text-decoration: underline;">${resetLink}</a>
            </p>
        </div>
    `;

    await transporter.sendMail({
        from: `"Source One" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: `Password Reset Request — Source One Analytics`,
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

module.exports = { sendInviteEmail, sendPasswordResetEmail, sendEmail };
