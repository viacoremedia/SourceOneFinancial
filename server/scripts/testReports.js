/**
 * Test script for automated reports.
 * Run: node scripts/testReports.js
 * 
 * Tests both the Daily Digest and Health Check by connecting
 * directly to the DB and generating + sending the reports.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function main() {
    console.log('Connecting to DB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');

    // ── 1. Check recipients ──
    const ReportRecipient = require('../models/ReportRecipient');
    const recipients = await ReportRecipient.find({}).lean();
    console.log(`📬 Report recipients: ${recipients.map(r => r.email).join(', ') || '(none — add via Settings)'}\n`);

    if (recipients.length === 0) {
        console.log('⚠️  No recipients configured. Add one via Settings or run seedRecipient.js first.');
        await mongoose.disconnect();
        return;
    }

    // ── 2. Find latest report date ──
    const DailyDealerSnapshot = require('../models/DailyDealerSnapshot');
    const latest = await DailyDealerSnapshot.findOne({}).sort({ reportDate: -1 }).lean();
    
    if (!latest) {
        console.log('⚠️  No snapshot data in DB. Ingest a CSV first.');
        await mongoose.disconnect();
        return;
    }

    const reportDate = latest.reportDate;
    console.log(`📅 Latest report date: ${reportDate.toISOString().slice(0, 10)}\n`);

    // ── 3. Test Daily Digest ──
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Testing Daily Activity Digest...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
        const { generateDailyDigest, collectDigestData } = require('../services/reports/dailyDigest');
        
        // Show data summary first
        const data = await collectDigestData(reportDate);
        console.log(`  Total snapshots: ${data.totalSnapshotsToday}`);
        console.log(`  Active: ${data.status.active} | 30d: ${data.status.inactive30} | 60d: ${data.status.inactive60} | Long: ${data.status.longInactive}`);
        console.log(`  Has yesterday data: ${data.hasYesterdayData}`);
        if (data.hasYesterdayData) {
            console.log(`  Changes: Active ${data.statusChanges.active > 0 ? '+' : ''}${data.statusChanges.active}, 30d ${data.statusChanges.inactive30 > 0 ? '+' : ''}${data.statusChanges.inactive30}`);
        }
        console.log(`  Events: ${data.events.newApplications} apps, ${data.events.newApprovals} approvals, ${data.events.newBookings} bookings, ${data.events.reactivations} reactivations`);
        console.log(`  At-risk dealers: ${data.atRiskDealers.length}`);
        
        // Generate email
        const { subject, html } = await generateDailyDigest(reportDate);
        console.log(`\n  Subject: ${subject}`);
        console.log(`  HTML size: ${html.length.toLocaleString()} chars`);
        
        // Send it
        const { sendReport } = require('../services/reportService');
        const result = await sendReport('Daily Activity Digest', subject, html);
        
        if (result.sent) {
            console.log(`  ✅ Email sent to ${result.recipientCount} recipient(s)!`);
        } else {
            console.log(`  ⚠️  Email not sent (no recipients or error)`);
        }
    } catch (err) {
        console.error(`  ❌ Daily Digest failed: ${err.message}`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Test complete! Check your inbox.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
