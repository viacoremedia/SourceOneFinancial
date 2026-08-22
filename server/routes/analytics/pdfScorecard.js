/**
 * PDF Scorecard API Routes
 * 
 * Manages report generation jobs, paginated report history, individual PDF streaming,
 * ZIP bundle downloading, and report deletion.
 * 
 * @module routes/analytics/pdfScorecard
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const ScorecardReport = require('../../models/ScorecardReport');
const { generateScorecardPDFs } = require('../../services/pdfGenerator');

const BASE_REPORTS_DIR = path.join(__dirname, '../../data/scorecard-reports');

// Helper to format date label
function formatDateLabel(d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// ==========================================
// POST /analytics/pdf-scorecard/generate
// Trigger PDF Report Generation Job
// ==========================================
router.post('/generate', async (req, res) => {
    try {
        const {
            name,
            scorecard = {},
            visitImpact = {},
            drd = {}
        } = req.body || {};

        const finPeriod = (scorecard.finPeriod || 'mtd').toUpperCase();
        const timeframe = (visitImpact.timeframe || 'ytd').toUpperCase();

        let finPeriodLabel = finPeriod;
        if (scorecard.finPeriod === 'custom' && (scorecard.customStartDate || scorecard.customEndDate)) {
            finPeriodLabel = `${scorecard.customStartDate || 'Earliest'} to ${scorecard.customEndDate || 'Latest'}`;
        }
        let visitPeriodLabel = timeframe;
        if (visitImpact.timeframe === 'custom' && (visitImpact.customStartDate || visitImpact.customEndDate)) {
            visitPeriodLabel = `${visitImpact.customStartDate || 'Earliest'} to ${visitImpact.customEndDate || 'Latest'}`;
        }

        const autoName = name && name.trim()
            ? name.trim()
            : `Scorecard Report — ${formatDateLabel(new Date())} (${finPeriodLabel} / ${visitPeriodLabel})`;

        const report = new ScorecardReport({
            name: autoName,
            config: {
                scorecard: {
                    windowSize: Number(scorecard.windowSize) || 7,
                    statusFilter: scorecard.statusFilter || null,
                    activityMode: scorecard.activityMode || 'application',
                    finPeriod: scorecard.finPeriod || 'mtd',
                    customStartDate: scorecard.customStartDate || null,
                    customEndDate: scorecard.customEndDate || null
                },
                visitImpact: {
                    reactivationWindow: Number(visitImpact.reactivationWindow) || 30,
                    touchpointMode: visitImpact.touchpointMode || 'visits',
                    timeframe: visitImpact.timeframe || 'ytd',
                    customStartDate: visitImpact.customStartDate || null,
                    customEndDate: visitImpact.customEndDate || null
                },
                drd: {
                    includeTlcList: drd.includeTlcList !== false
                }
            },
            status: 'generating'
        });

        await report.save();

        // Run generation asynchronously in background
        setImmediate(async () => {
            try {
                await generateScorecardPDFs(report._id, report.config);
            } catch (err) {
                console.error(`[PDF Scorecard] Generation failed for report ${report._id}:`, err);
            }
        });

        res.status(202).json({
            success: true,
            reportId: report._id,
            status: 'generating',
            message: 'Scorecard report generation initiated'
        });
    } catch (error) {
        console.error('Error initiating PDF scorecard generation:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/pdf-scorecard/reports
// Paginated Report History
// ==========================================
router.get('/reports', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const skip = (page - 1) * limit;

        const [reports, total] = await Promise.all([
            ScorecardReport.find({})
                .sort({ generatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ScorecardReport.countDocuments({})
        ]);

        res.status(200).json({
            success: true,
            reports,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error fetching scorecard report history:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/pdf-scorecard/reports/:id
// Single Report Metadata & File Manifest
// ==========================================
router.get('/reports/:id', async (req, res) => {
    try {
        const report = await ScorecardReport.findById(req.params.id).lean();
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found' });
        }

        res.status(200).json({
            success: true,
            report
        });
    } catch (error) {
        console.error('Error fetching scorecard report details:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/pdf-scorecard/reports/:id/files/:filename
// Stream Individual PDF to Browser / In-App Viewer
// ==========================================
router.get('/reports/:id/files/:filename', async (req, res) => {
    try {
        const { id, filename } = req.params;
        const sanitizedFilename = path.basename(filename); // Prevent path traversal
        const filePath = path.join(BASE_REPORTS_DIR, id, sanitizedFilename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on disk' });
        }

        const stat = fs.statSync(filePath);

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': stat.size,
            'Content-Disposition': `inline; filename="${sanitizedFilename}"`,
            'Cache-Control': 'public, max-age=3600'
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
    } catch (error) {
        console.error('Error streaming scorecard PDF:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/pdf-scorecard/reports/:id/download
// Stream Full ZIP Archive of All Report PDFs
// ==========================================
router.get('/reports/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const report = await ScorecardReport.findById(id).lean();
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found' });
        }

        const reportDir = path.join(BASE_REPORTS_DIR, id);
        if (!fs.existsSync(reportDir)) {
            return res.status(404).json({ success: false, message: 'Report files directory not found on disk' });
        }

        const zipFilename = `Scorecard_Reports_${id.toString().slice(-6)}.zip`;

        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${zipFilename}"`
        });

        const archive = archiver('zip', { zlib: { level: 6 } });

        archive.on('error', (err) => {
            console.error('Archiver error:', err);
            if (!res.headersSent) res.status(500).send({ error: err.message });
        });

        archive.pipe(res);

        // Append all PDF files from directory
        archive.directory(reportDir, false);

        await archive.finalize();
    } catch (error) {
        console.error('Error creating scorecard ZIP download:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
});

// ==========================================
// DELETE /analytics/pdf-scorecard/reports/:id
// Delete Report Record & Purge Disk Files
// ==========================================
router.delete('/reports/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const report = await ScorecardReport.findByIdAndDelete(id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found' });
        }

        const reportDir = path.join(BASE_REPORTS_DIR, id);
        if (fs.existsSync(reportDir)) {
            fs.rmSync(reportDir, { recursive: true, force: true });
        }

        res.status(200).json({
            success: true,
            message: 'Report and associated PDF files deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting scorecard report:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
