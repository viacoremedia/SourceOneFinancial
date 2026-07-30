/**
 * Communication Analytics Routes
 *
 * Exposes endpoints for the Visit Impact Engine and Effort vs Yield coaching matrix.
 *
 * @module routes/analytics/communication
 */

const express = require('express');
const router = express.Router();
const { computeVisitImpact, computeVisitImpactV2, computeEffortVsYieldFlags, getRepCommunicationHistory } = require('../../services/communicationImpactService');

// GET /analytics/communication/impact?window=30&mode=visits&rep=John
router.get('/impact', async (req, res) => {
    try {
        const reactivationWindow = parseInt(req.query.window, 10) || 30;
        const touchpointMode = req.query.mode === 'all' ? 'all' : 'visits';
        const repFilter = req.query.rep || null;
        const timeframe = req.query.timeframe || 'ytd';
        const startDate = req.query.startDate || null;
        const endDate = req.query.endDate || null;
        const result = await computeVisitImpactV2({ reactivationWindow, touchpointMode, repFilter, timeframe, startDate, endDate });
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('Error fetching visit impact data:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /analytics/communication/effort-yield?window=30
router.get('/effort-yield', async (req, res) => {
    try {
        const windowDays = parseInt(req.query.window, 10) || 30;
        const result = await computeEffortVsYieldFlags(windowDays);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('Error fetching effort vs yield flags:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /analytics/communication/history
router.get('/history', async (req, res) => {
    try {
        const rep = req.query.rep || null;
        const state = req.query.state || null;
        const groupSlug = req.query.groupSlug || null;
        const dealerId = req.query.dealerId || null;
        const type = req.query.type || null;
        const search = req.query.search || null;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 25;

        const result = await getRepCommunicationHistory({
            rep,
            state,
            groupSlug,
            dealerId,
            type,
            search,
            page,
            limit,
        });

        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('Error fetching rep communication history:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
