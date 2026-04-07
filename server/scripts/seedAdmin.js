/**
 * Seed the initial super_admin account.
 *
 * Usage: node server/scripts/seedAdmin.js
 *
 * Idempotent — skips if user already exists.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');

const ADMIN_EMAIL = 'joshua@viacoremedia.com';
const ADMIN_NAME = 'Joshua';

async function main() {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error('No MONGO_URI found in env');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB\n');

    // Check if already exists
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
        console.log(`✅ Admin account already exists: ${ADMIN_EMAIL} (role: ${existing.role}, status: ${existing.status})`);
        await mongoose.disconnect();
        return;
    }

    // Generate a random password
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Generate JWT_SECRET if not in env
    if (!process.env.JWT_SECRET) {
        const secret = crypto.randomBytes(48).toString('hex');
        console.log('='.repeat(60));
        console.log('JWT_SECRET generated. Add this to your server/.env:');
        console.log(`JWT_SECRET="${secret}"`);
        console.log('='.repeat(60) + '\n');
    }

    await User.create({
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        role: 'super_admin',
        status: 'active',
        passwordHash,
    });

    console.log('✅ Super admin account created:');
    console.log(`   Email:    ${ADMIN_EMAIL}`);
    console.log(`   Password: ${tempPassword}`);
    console.log(`   Role:     super_admin`);
    console.log('\n⚠️  Change this password after first login!');

    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
