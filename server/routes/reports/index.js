/**
 * Report API Routes
 * 
 * Endpoints:
 *   POST /reports/daily-digest        — Manually trigger daily digest (admin+)
 *   GET  /reports/preview/daily-digest — Preview digest HTML without sending (admin+)
 *   GET  /reports/digest               — Get digest data as JSON (admin+)
 *   GET  /reports/digest/dates         — Get all available report dates (admin+)
 *   GET  /reports/recipients           — List all report recipients (admin+)
 *   POST /reports/recipients           — Add a recipient (admin+)
 *   DELETE /reports/recipients/:id     — Remove a recipient (admin+)
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/authMiddleware');
const ReportRecipient = require('../../models/ReportRecipient');

// All report routes require valid authentication
router.use(requireAuth);

// ==========================================
// GET /reports/recipients — List all recipients
// ==========================================
router.get('/recipients', requireRole('admin'), async (req, res) => {
    try {
        const recipients = await ReportRecipient.find({})
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, recipients });
    } catch (err) {
        console.error('Error listing recipients:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// POST /reports/recipients — Add a recipient
// Body: { email: "someone@example.com" }
// ==========================================
router.post('/recipients', requireRole('admin'), async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const recipient = await ReportRecipient.findOneAndUpdate(
            { email: email.toLowerCase().trim() },
            {
                $set: { email: email.toLowerCase().trim() },
                $setOnInsert: { addedBy: req.user._id, createdAt: new Date() },
            },
            { upsert: true, returnDocument: 'after', lean: true }
        );

        res.json({ success: true, recipient });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ success: false, message: 'Recipient already exists' });
        }
        console.error('Error adding recipient:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// DELETE /reports/recipients/:id — Remove a recipient
// ==========================================
router.delete('/recipients/:id', requireRole('admin'), async (req, res) => {
    try {
        const result = await ReportRecipient.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Recipient not found' });
        }
        res.json({ success: true, message: 'Recipient removed' });
    } catch (err) {
        console.error('Error removing recipient:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// POST /reports/daily-digest — Manually trigger digest
// Body: { date: "2026-04-08" } (optional, defaults to latest)
// ==========================================
router.post('/daily-digest', requireRole('admin'), async (req, res) => {
    try {
        const { sendReport } = require('../../services/reportService');
        const { generateDailyDigest } = require('../../services/reports/dailyDigest');
        const DailyDealerSnapshot = require('../../models/DailyDealerSnapshot');

        let reportDate;
        if (req.body.date) {
            reportDate = new Date(req.body.date);
        } else {
            const latest = await DailyDealerSnapshot.findOne({})
                .sort({ reportDate: -1 }).lean();
            reportDate = latest ? latest.reportDate : new Date();
        }

        const { subject, html } = await generateDailyDigest(reportDate);
        const result = await sendReport('Daily Activity Digest', subject, html);

        res.json({
            success: true,
            message: result.sent
                ? `Digest sent to ${result.recipientCount} recipient(s)`
                : 'No recipients configured — email not sent',
            date: reportDate.toISOString().slice(0, 10),
        });
    } catch (err) {
        console.error('Error triggering daily digest:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// GET /reports/preview/daily-digest — Preview HTML
// Query: ?date=2026-04-08 (optional)
// ==========================================
router.get('/preview/daily-digest', requireRole('admin'), async (req, res) => {
    try {
        const { generateDailyDigest } = require('../../services/reports/dailyDigest');
        const DailyDealerSnapshot = require('../../models/DailyDealerSnapshot');

        let reportDate;
        if (req.query.date) {
            reportDate = new Date(req.query.date);
        } else {
            const latest = await DailyDealerSnapshot.findOne({})
                .sort({ reportDate: -1 }).lean();
            reportDate = latest ? latest.reportDate : new Date();
        }

        const { subject, html } = await generateDailyDigest(reportDate);

        // Return raw HTML so it renders in the browser
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        console.error('Error previewing daily digest:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// GET /reports/digest/dates — Available report dates
// ==========================================
router.get('/digest/dates', async (req, res) => {
    try {
        const DailyDealerSnapshot = require('../../models/DailyDealerSnapshot');
        const dates = await DailyDealerSnapshot.distinct('reportDate');
        // Sort descending
        dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        res.json({
            success: true,
            dates: dates.map(d => new Date(d).toISOString().slice(0, 10)),
        });
    } catch (err) {
        console.error('Error fetching digest dates:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// GET /reports/digest — Get digest data as JSON
// Query: ?date=2026-04-07 (optional, defaults to latest), ?activityMode=application, ?rep=Dan%20Zilberchtein
// ==========================================
router.get('/digest', async (req, res) => {
    try {
        const { collectDigestData } = require('../../services/reports/dailyDigest');
        const DailyDealerSnapshot = require('../../models/DailyDealerSnapshot');

        let reportDate;
        if (req.query.date) {
            reportDate = new Date(req.query.date);
        } else {
            const latest = await DailyDealerSnapshot.findOne({})
                .sort({ reportDate: -1 }).lean();
            reportDate = latest ? latest.reportDate : new Date();
        }

        // Inside sales reps are strictly scoped to their assigned rep
        let repFilter = req.query.rep;
        if (req.user && req.user.role === 'inside_rep' && req.user.assignedRep) {
            repFilter = req.user.assignedRep;
        }

        const data = await collectDigestData(reportDate, req.query.activityMode || 'application', repFilter);
        res.json({ success: true, data });
    } catch (err) {
        console.error('Error fetching digest data:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
