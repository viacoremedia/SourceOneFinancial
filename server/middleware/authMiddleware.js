const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ROLE_HIERARCHY = { employee: 0, admin: 1, super_admin: 2 };

/**
 * Verify JWT and attach req.user
 */
async function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    try {
        const token = header.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-passwordHash -inviteToken').lean();
        if (!user || user.status !== 'active') {
            return res.status(401).json({ success: false, message: 'Invalid or inactive account' });
        }
        req.user = user;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
}

/**
 * Require minimum role level. Must be used AFTER requireAuth.
 */
function requireRole(minRole) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const userLevel = ROLE_HIERARCHY[req.user.role] ?? -1;
        const requiredLevel = ROLE_HIERARCHY[minRole] ?? 99;
        if (userLevel < requiredLevel) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole, JWT_SECRET, ROLE_HIERARCHY };
