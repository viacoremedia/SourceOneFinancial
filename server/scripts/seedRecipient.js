/**
 * Seed default report recipient.
 * Run once: node scripts/seedRecipient.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const ReportRecipient = require('../models/ReportRecipient');

const DEFAULT_EMAIL = 'joshua@viacoremedia.com';

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const existing = await ReportRecipient.findOne({ email: DEFAULT_EMAIL });
    if (existing) {
        console.log(`Recipient "${DEFAULT_EMAIL}" already exists — skipping`);
    } else {
        await ReportRecipient.create({ email: DEFAULT_EMAIL });
        console.log(`✅ Added "${DEFAULT_EMAIL}" as default report recipient`);
    }

    await mongoose.disconnect();
    console.log('Done');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
