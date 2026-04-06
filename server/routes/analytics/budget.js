/**
 * Budget Analytics Routes
 * 
 * Endpoints:
 *   GET /analytics/budget           — All state/rep budgets for a year
 *   GET /analytics/budget/by-rep    — Budgets grouped by rep (with states + totals)
 *   GET /analytics/budget/by-state  — Budgets grouped by state (with rep info)
 *   GET /analytics/budget/large     — Large dealer / FSP budgets
 *   GET /analytics/budget/state-rep-map — Quick lookup: state → rep mapping
 */

const express = require('express');
const router = express.Router();
const SalesBudget = require('../../models/SalesBudget');
const LargeDealerBudget = require('../../models/LargeDealerBudget');

// ==========================================
// GET /analytics/budget
// All state/rep budgets for a year
// ==========================================
router.get('/', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || 2026;
        const budgets = await SalesBudget.find({ year }).sort({ rep: 1, state: 1 }).lean();

        res.status(200).json({
            success: true,
            year,
            count: budgets.length,
            budgets,
        });
    } catch (error) {
        console.error('Error fetching budgets:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/budget/by-rep
// Budgets grouped by rep with state breakdown + totals
// ==========================================
router.get('/by-rep', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || 2026;
        const budgets = await SalesBudget.find({ year }).sort({ rep: 1, state: 1 }).lean();

        // Group by rep
        const byRep = {};
        for (const b of budgets) {
            if (!byRep[b.rep]) {
                byRep[b.rep] = {
                    rep: b.rep,
                    states: [],
                    monthlyTotals: {},
                    annualTotal: 0,
                };
                for (let m = 1; m <= 12; m++) byRep[b.rep].monthlyTotals[m] = 0;
            }
            byRep[b.rep].states.push({
                state: b.state,
                growthTarget: b.growthTarget,
                marketShare: b.marketShare,
                monthlyBudgets: b.monthlyBudgets,
                annualTotal: b.annualTotal,
            });
            byRep[b.rep].annualTotal += b.annualTotal;
            for (let m = 1; m <= 12; m++) {
                byRep[b.rep].monthlyTotals[m] += (b.monthlyBudgets[m] || 0);
            }
        }

        const reps = Object.values(byRep).sort((a, b) => b.annualTotal - a.annualTotal);

        res.status(200).json({
            success: true,
            year,
            count: reps.length,
            reps,
        });
    } catch (error) {
        console.error('Error fetching budgets by rep:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/budget/by-state
// Budgets grouped by state with rep info
// ==========================================
router.get('/by-state', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || 2026;
        const budgets = await SalesBudget.find({ year }).sort({ state: 1 }).lean();

        const byState = budgets.map(b => ({
            state: b.state,
            rep: b.rep,
            growthTarget: b.growthTarget,
            marketShare: b.marketShare,
            monthlyBudgets: b.monthlyBudgets,
            annualTotal: b.annualTotal,
        }));

        res.status(200).json({
            success: true,
            year,
            count: byState.length,
            states: byState,
        });
    } catch (error) {
        console.error('Error fetching budgets by state:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/budget/large
// Large dealer / FSP / Silver budgets
// ==========================================
router.get('/large', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || 2026;
        const budgets = await LargeDealerBudget.find({ year })
            .sort({ annualTotal: -1 }).lean();

        res.status(200).json({
            success: true,
            year,
            count: budgets.length,
            budgets,
        });
    } catch (error) {
        console.error('Error fetching large dealer budgets:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/budget/state-rep-map
// Quick lookup: state → rep assignment
// Used by frontend to show rep on dealer groups/locations
// ==========================================
router.get('/state-rep-map', async (req, res) => {
    try {
        const year = parseInt(req.query.year) || 2026;
        const budgets = await SalesBudget.find({ year })
            .select('state rep -_id').lean();

        const map = {};
        for (const b of budgets) {
            map[b.state] = b.rep;
        }

        res.status(200).json({
            success: true,
            year,
            stateRepMap: map,
        });
    } catch (error) {
        console.error('Error fetching state-rep map:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
