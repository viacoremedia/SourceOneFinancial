/**
 * Report Service — Central Orchestrator
 * 
 * Manages report recipient resolution and coordinates
 * automated report generation after CSV ingestion.
 * 
 * @module services/reportService
 */

const { sendEmail } = require('./emailService');
const ReportRecipient = require('../models/ReportRecipient');

/**
 * Resolve the list of email addresses that should receive reports.
 * Queries the ReportRecipient collection.
 * 
 * @returns {Promise<string[]>} Array of email addresses
 */
async function getRecipients() {
    const recipients = await ReportRecipient.find({}).select('email').lean();
    return recipients.map(r => r.email).filter(Boolean);
}

/**
 * Send a report email to all configured recipients.
 * If no recipients are configured, logs a warning and skips.
 * 
 * @param {string} reportName - Human-readable report name (for logging)
 * @param {string} subject - Email subject line
 * @param {string} html - Rendered HTML email body
 * @returns {Promise<{ sent: boolean, recipientCount: number }>}
 */
async function sendReport(reportName, subject, html) {
    const recipients = await getRecipients();

    if (recipients.length === 0) {
        console.warn(`  reports: no recipients configured for "${reportName}" — skipping email`);
        return { sent: false, recipientCount: 0 };
    }

    try {
        await sendEmail(recipients, subject, html);
        console.log(`  reports: "${reportName}" sent to ${recipients.length} recipient(s)`);
        return { sent: true, recipientCount: recipients.length };
    } catch (err) {
        console.error(`  reports: failed to send "${reportName}": ${err.message}`);
        return { sent: false, recipientCount: 0 };
    }
}

/**
 * Run all post-ingestion reports.
 * Called after a successful CSV ingestion + rollup rebuild.
 * Each report is independent — one failing doesn't block others.
 * 
 * @param {Object} ingestionResult - Summary from ingestDealerMetricsCSV()
 * @param {Date} reportDate - The report date from the ingested CSV
 */
async function runPostIngestionReports(ingestionResult, reportDate) {
    console.log('  reports: running post-ingestion reports...');

    // Daily Activity Digest
    try {
        const { generateDailyDigest } = require('./reports/dailyDigest');
        const { subject, html } = await generateDailyDigest(reportDate);
        await sendReport('Daily Activity Digest', subject, html);
    } catch (err) {
        console.error(`  reports: Daily Digest failed: ${err.message}`);
    }

    console.log('  reports: post-ingestion reports complete');
}

module.exports = {
    getRecipients,
    sendReport,
    runPostIngestionReports,
};
