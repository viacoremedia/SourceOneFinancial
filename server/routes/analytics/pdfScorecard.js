/**
 * PDF Scorecard API Routes
 * 
 * Manages report generation jobs, paginated report history, individual PDF streaming from MongoDB,
 * ZIP bundle downloading, automated 30-day retention/storage quota enforcement, and report deletion.
 * 
 * @module routes/analytics/pdfScorecard
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const archiver = require('archiver');
const ScorecardReport = require('../../models/ScorecardReport');
const ScorecardReportFile = require('../../models/ScorecardReportFile');
const { generateScorecardPDFs } = require('../../services/pdfGenerator');
const { cleanupScorecardStorage, getStorageUsage } = require('../../services/scorecardStorageService');

// Helper to format date label
function formatDateLabel(d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// ==========================================
// GET /analytics/pdf-scorecard/storage
// Get Current Scorecard Storage Stats & Quota
// ==========================================
router.get('/storage', async (req, res) => {
    try {
        const usage = await getStorageUsage();
        res.status(200).json({
            success: true,
            storage: usage
        });
    } catch (error) {
        console.error('Error fetching scorecard storage metrics:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

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

        // Run automated cleanup of expired reports (>30 days) and enforce 200MB soft cap
        await cleanupScorecardStorage();

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

        // On Vercel / serverless runtimes, execute generation directly within the request lifecycle
        // so the function is not frozen/terminated prematurely by serverless background suspension.
        try {
            await generateScorecardPDFs(report._id, report.config);
            
            res.status(201).json({
                success: true,
                reportId: report._id,
                status: 'ready',
                message: 'Scorecard report generated successfully'
            });
        } catch (genErr) {
            console.error(`[PDF Scorecard] Generation failed for report ${report._id}:`, genErr);
            res.status(500).json({
                success: false,
                reportId: report._id,
                status: 'failed',
                message: genErr.message
            });
        }
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
// Stream Individual PDF from MongoDB to Browser / In-App Viewer
// ==========================================
router.get('/reports/:id/files/:filename', async (req, res) => {
    try {
        const { id, filename } = req.params;
        const sanitizedFilename = path.basename(filename); // Prevent path traversal

        const fileDoc = await ScorecardReportFile.findOne({
            reportId: id,
            filename: sanitizedFilename
        });

        if (!fileDoc || !fileDoc.pdfData) {
            return res.status(404).json({ success: false, message: 'File not found in database' });
        }

        const pdfBuffer = Buffer.isBuffer(fileDoc.pdfData)
            ? fileDoc.pdfData
            : Buffer.from(fileDoc.pdfData.buffer || fileDoc.pdfData);

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length,
            'Content-Disposition': `inline; filename="${sanitizedFilename}"`,
            'Cache-Control': 'public, max-age=86400'
        });

        res.end(pdfBuffer);
    } catch (error) {
        console.error('Error streaming scorecard PDF from MongoDB:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/pdf-scorecard/reports/:id/download
// Stream Full ZIP Archive of All Report PDFs from MongoDB
// ==========================================
router.get('/reports/:id/download', async (req, res) => {
    try {
        const { id } = req.params;
        const report = await ScorecardReport.findById(id).lean();
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found' });
        }

        const files = await ScorecardReportFile.find({ reportId: id });
        if (!files || files.length === 0) {
            return res.status(404).json({ success: false, message: 'No report files found in database' });
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

        // Append all PDF binary buffers from MongoDB
        for (const file of files) {
            const pdfBuffer = Buffer.isBuffer(file.pdfData)
                ? file.pdfData
                : Buffer.from(file.pdfData.buffer || file.pdfData);
            archive.append(pdfBuffer, { name: file.filename });
        }

        await archive.finalize();
    } catch (error) {
        console.error('Error creating scorecard ZIP download from MongoDB:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
});

// ==========================================
// DELETE /analytics/pdf-scorecard/reports/:id
// Delete Report Record & Purge PDF Documents from MongoDB
// ==========================================
router.delete('/reports/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const report = await ScorecardReport.findByIdAndDelete(id);
        if (!report) {
            return res.status(404).json({ success: false, message: 'Report not found' });
        }

        const deleteFilesResult = await ScorecardReportFile.deleteMany({ reportId: id });

        res.status(200).json({
            success: true,
            message: `Report and ${deleteFilesResult.deletedCount} associated PDF documents deleted from database`
        });
    } catch (error) {
        console.error('Error deleting scorecard report from MongoDB:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
