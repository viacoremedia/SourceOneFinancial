const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../models/User');
const { requireAuth, requireRole, JWT_SECRET, ROLE_HIERARCHY } = require('../../middleware/authMiddleware');
const { sendInviteEmail } = require('../../services/emailService');

const router = express.Router();

const TOKEN_EXPIRY = '90d'; // ~3 months

// ── POST /auth/login ──
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user || !user.passwordHash) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        if (user.status !== 'active') {
            return res.status(401).json({ success: false, message: 'Account is not active' });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

        res.json({
            success: true,
            token,
            user: { id: user._id, email: user.email, name: user.name, role: user.role },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /auth/accept-invite ──
router.post('/accept-invite', async (req, res) => {
    try {
        const { token, password, name } = req.body;
        if (!token || !password) {
            return res.status(400).json({ success: false, message: 'Token and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const user = await User.findOne({ inviteToken: token });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid invite link' });
        }
        if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
            return res.status(400).json({ success: false, message: 'Invite link has expired' });
        }

        user.passwordHash = await bcrypt.hash(password, 12);
        user.status = 'active';
        user.inviteToken = null;
        user.inviteExpiresAt = null;
        if (name) user.name = name.trim();
        await user.save();

        const jwtToken = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

        res.json({
            success: true,
            token: jwtToken,
            user: { id: user._id, email: user.email, name: user.name, role: user.role },
        });
    } catch (err) {
        console.error('Accept invite error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /auth/me ──
router.get('/me', requireAuth, (req, res) => {
    res.json({ success: true, user: req.user });
});

// ── POST /auth/change-password ──
router.post('/change-password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Both passwords required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const user = await User.findById(req.user._id);
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 12);
        await user.save();

        res.json({ success: true, message: 'Password updated' });
    } catch (err) {
        console.error('Change password error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── POST /auth/invite (admin+) ──
router.post('/invite', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const { email, role = 'employee', name = '' } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Admins can only invite employees; super_admins can invite anyone
        const inviterLevel = ROLE_HIERARCHY[req.user.role];
        const targetLevel = ROLE_HIERARCHY[role] ?? 0;
        if (targetLevel >= inviterLevel) {
            return res.status(403).json({ success: false, message: 'Cannot invite a user with equal or higher role' });
        }

        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            return res.status(409).json({ success: false, message: 'User with this email already exists' });
        }

        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const user = await User.create({
            email: email.toLowerCase().trim(),
            name: name.trim(),
            role,
            status: 'invited',
            inviteToken,
            inviteExpiresAt,
        });

        await sendInviteEmail(user.email, inviteToken, req.user.name || req.user.email, role);

        res.json({ success: true, message: `Invite sent to ${user.email}`, user: { id: user._id, email: user.email, role: user.role, status: user.status } });
    } catch (err) {
        console.error('Invite error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── GET /auth/users (admin+) ──
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const users = await User.find({})
            .select('-passwordHash -inviteToken')
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, users });
    } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── DELETE /auth/users/:id (admin+, role-scoped) ──
router.delete('/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Can't remove yourself
        if (targetUser._id.toString() === req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Cannot remove yourself' });
        }

        // Role check: can only remove users below your level
        const myLevel = ROLE_HIERARCHY[req.user.role];
        const targetLevel = ROLE_HIERARCHY[targetUser.role];
        if (targetLevel >= myLevel) {
            return res.status(403).json({ success: false, message: 'Cannot remove a user with equal or higher role' });
        }

        await User.deleteOne({ _id: targetUser._id });
        res.json({ success: true, message: `User ${targetUser.email} removed` });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
