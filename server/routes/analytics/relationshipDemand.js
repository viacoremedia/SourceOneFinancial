/**
 * Relationship Demand & TLC Allocation Analytics Routes
 * 
 * Endpoints for Dealer Relationship Demand (DRD) segmentation, sales routing recommendations,
 * overdue visit alerts, and rep effort allocation diagnostics.
 * 
 * @module routes/analytics/relationshipDemand
 */

const express = require('express');
const router = express.Router();
const DealerProfile = require('../../models/DealerProfile');
const DealerLocation = require('../../models/DealerLocation');
const Application = require('../../models/Application');
const DealerCommunication = require('../../models/DealerCommunication');
const MonthlyDealerRollup = require('../../models/MonthlyDealerRollup');
const { recomputeAllProfiles } = require('../../services/dealerRelationshipEngine');
const { getRepHandles } = require('../../config/repConfig');

// ==========================================
// GET /analytics/relationship-demand/summary
// Summary KPIs, DRD Segment Distribution & Urgency Counts
// ==========================================
router.get('/summary', async (req, res) => {
    try {
        const { rep, state } = req.query;
        const match = {};

        if (rep && rep.trim()) {
            const handles = getRepHandles(rep);
            match.assignedRep = { $in: handles.map(h => new RegExp(h, 'i')) };
        }
        if (state && state.trim()) {
            match.statePrefix = state.trim().toUpperCase();
        }

        const profiles = await DealerProfile.find(match).lean();

        const totalDealers = profiles.length;
        const segments = {
            high_tlc: { count: 0, pct: 0, bookedVolume: 0, totalVisits: 0, totalBookings: 0 },
            self_sufficient: { count: 0, pct: 0, bookedVolume: 0, totalVisits: 0, totalBookings: 0 },
            unresponsive: { count: 0, pct: 0, bookedVolume: 0, totalVisits: 0, totalBookings: 0 },
            insufficient_data: { count: 0, pct: 0, bookedVolume: 0, totalVisits: 0, totalBookings: 0 }
        };

        const urgency = {
            overdue: 0,
            due_soon: 0,
            on_track: 0,
            self_sufficient: 0,
            not_monitored: 0
        };

        let lastCalculatedAt = null;

        for (const p of profiles) {
            const seg = p.relationshipDemand || 'insufficient_data';
            if (segments[seg]) {
                segments[seg].count++;
                segments[seg].bookedVolume += (p.lifetimeStats?.totalBookedVolume || 0);
                segments[seg].totalVisits += (p.lifetimeStats?.totalVisits || 0);
                segments[seg].totalBookings += (p.lifetimeStats?.totalBookings || 0);
            }

            const urg = p.urgencyStatus || 'not_monitored';
            if (urgency[urg] !== undefined) {
                urgency[urg]++;
            }

            if (!lastCalculatedAt || (p.lastCalculatedAt && p.lastCalculatedAt > lastCalculatedAt)) {
                lastCalculatedAt = p.lastCalculatedAt;
            }
        }

        if (totalDealers > 0) {
            for (const key of Object.keys(segments)) {
                segments[key].pct = Math.round((segments[key].count / totalDealers) * 1000) / 10;
            }
        }

        res.status(200).json({
            success: true,
            totalDealers,
            segments,
            urgency,
            lastCalculatedAt
        });
    } catch (error) {
        console.error('Error fetching DRD summary:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/relationship-demand/dealers
// Filterable & Paginated Dealer Relationship List
// ==========================================
router.get('/dealers', async (req, res) => {
    try {
        const {
            demand,
            urgency,
            rep,
            state,
            search,
            sort = 'urgency',
            order = 'desc',
            page = 1,
            limit = 25
        } = req.query;

        const match = {};

        if (demand && demand !== 'all') {
            match.relationshipDemand = demand;
        }

        if (urgency && urgency !== 'all') {
            match.urgencyStatus = urgency;
        }

        if (rep && rep.trim()) {
            const handles = getRepHandles(rep);
            match.assignedRep = { $in: handles.map(h => new RegExp(h, 'i')) };
        }

        if (state && state.trim()) {
            match.statePrefix = state.trim().toUpperCase();
        }

        if (search && search.trim()) {
            const s = search.trim();
            match.$or = [
                { clientDealerId: new RegExp(s, 'i') },
                { dealerName: new RegExp(s, 'i') }
            ];
        }

        // Build sort object
        let sortObj = {};
        const dir = order === 'asc' ? 1 : -1;

        switch (sort) {
            case 'urgency':
                // Custom sort: overdue (1), due_soon (2), on_track (3), self_sufficient (4), not_monitored (5)
                sortObj = { daysSinceLastVisit: dir };
                break;
            case 'elasticity':
                sortObj = { visitElasticity: dir };
                break;
            case 'visits':
                sortObj = { 'lifetimeStats.totalVisits': dir };
                break;
            case 'bookings':
                sortObj = { 'lifetimeStats.totalBookings': dir };
                break;
            case 'volume':
                sortObj = { 'lifetimeStats.totalBookedVolume': dir };
                break;
            case 'daysSinceVisit':
                sortObj = { daysSinceLastVisit: dir };
                break;
            default:
                sortObj = { 'lifetimeStats.totalBookedVolume': -1 };
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
        const skip = (pageNum - 1) * limitNum;

        const [dealers, total] = await Promise.all([
            DealerProfile.find(match)
                .sort(sortObj)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            DealerProfile.countDocuments(match)
        ]);

        res.status(200).json({
            success: true,
            dealers,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
        });
    } catch (error) {
        console.error('Error fetching DRD dealers list:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/relationship-demand/dealers/:clientDealerId/timeline
// Detailed Single Dealer Timeline & Pulse Visualization
// ==========================================
router.get('/dealers/:clientDealerId/timeline', async (req, res) => {
    try {
        const clientDealerId = req.params.clientDealerId.trim().toUpperCase();

        const profile = await DealerProfile.findOne({ clientDealerId }).lean();
        if (!profile) {
            return res.status(404).json({ success: false, message: `Profile not found for dealer ${clientDealerId}` });
        }

        // Fetch communications (visits, calls, emails)
        const comms = await DealerCommunication.find({
            internalRelationshipId2: clientDealerId,
            communicationEventDatetime: { $ne: null }
        })
            .sort({ communicationEventDatetime: -1 })
            .limit(100)
            .lean();

        // Fetch applications
        const apps = await Application.find({
            clientDealerId,
            applicationDate: { $ne: null }
        })
            .select('applicationId applicationDate bookedDate status amountFinanced lender')
            .sort({ applicationDate: -1 })
            .limit(150)
            .lean();

        // Group into monthly buckets (2024-01 through 2026-12)
        const monthlyMap = new Map();

        // Populate monthly comms
        for (const c of comms) {
            const d = new Date(c.communicationEventDatetime);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            if (!monthlyMap.has(mKey)) {
                monthlyMap.set(mKey, { month: mKey, visits: 0, calls: 0, emails: 0, apps: 0, bookings: 0, bookedVolume: 0 });
            }
            const type = (c.communicationType || '').toLowerCase();
            if (type.includes('visit') || type.includes('face to face') || type.includes('meeting')) {
                monthlyMap.get(mKey).visits++;
            } else if (type.includes('phone') || type.includes('call')) {
                monthlyMap.get(mKey).calls++;
            } else if (type.includes('email')) {
                monthlyMap.get(mKey).emails++;
            }
        }

        // Populate monthly apps & bookings
        for (const a of apps) {
            const d = new Date(a.applicationDate);
            const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            if (!monthlyMap.has(mKey)) {
                monthlyMap.set(mKey, { month: mKey, visits: 0, calls: 0, emails: 0, apps: 0, bookings: 0, bookedVolume: 0 });
            }
            monthlyMap.get(mKey).apps++;
            if (a.status === 'Booked') {
                monthlyMap.get(mKey).bookings++;
                monthlyMap.get(mKey).bookedVolume += (Number(a.amountFinanced) || 0);
            }
        }

        const monthlyTimeline = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));

        // Generate Actionable Tactical Recommendation Text
        let recommendation = '';
        if (profile.relationshipDemand === 'high_tlc') {
            if (profile.urgencyStatus === 'overdue') {
                recommendation = `🚨 Critical High TLC Account. Last visited ${profile.daysSinceLastVisit || 'N/A'} days ago (Recommended Cadence: ${profile.recommendedCadenceDays}d). Schedule an in-person field visit immediately to prevent account dormancy.`;
            } else if (profile.urgencyStatus === 'due_soon') {
                recommendation = `⏳ High TLC Account. Visit due within 7 days to sustain recent application velocity (Production half-life is ~${profile.productionHalfLifeDays || 30} days).`;
            } else {
                recommendation = `✅ High TLC Account on track. Visited ${profile.daysSinceLastVisit} days ago. Maintain ${profile.recommendedCadenceDays}-day check-in cadence.`;
            }
        } else if (profile.relationshipDemand === 'self_sufficient') {
            recommendation = `🟢 Autonomous Producer. Sustains organic volume (${profile.lifetimeStats.totalApplications} lifetime apps) with low visit elasticity (${profile.visitElasticity}x). Deprioritize routine driving visits; maintain via quarterly phone/email check-ins.`;
        } else if (profile.relationshipDemand === 'unresponsive') {
            recommendation = `🟠 Low-Yield Comfort Stop. Account received ${profile.lifetimeStats.totalVisits} in-person visits yielding 0 booked deals. Freeze field rep visits and audit relationship viability.`;
        } else {
            recommendation = `⚪ Insufficient Data. Schedule an exploratory discovery touchpoint to establish initial dealer baseline.`;
        }

        res.status(200).json({
            success: true,
            profile,
            recommendation,
            monthlyTimeline,
            recentCommunications: comms.slice(0, 15),
            recentApplications: apps.slice(0, 15)
        });
    } catch (error) {
        console.error('Error fetching dealer DRD timeline:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/relationship-demand/rep-allocation
// Rep Visit Allocation Diagnostic (High TLC vs Autonomous vs Money Pits)
// ==========================================
router.get('/rep-allocation', async (req, res) => {
    try {
        const profiles = await DealerProfile.find({ assignedRep: { $ne: null } }).lean();

        const repMap = new Map();

        for (const p of profiles) {
            const rep = p.assignedRep;
            if (!repMap.has(rep)) {
                repMap.set(rep, {
                    rep,
                    totalDealers: 0,
                    highTlcCount: 0,
                    selfSuffCount: 0,
                    unresponsiveCount: 0,
                    insufficientCount: 0,
                    overdueCount: 0,
                    totalVisits: 0,
                    highTlcVisits: 0,
                    selfSuffVisits: 0,
                    unresponsiveVisits: 0,
                    totalBookedVolume: 0
                });
            }

            const r = repMap.get(rep);
            r.totalDealers++;
            const visits = p.lifetimeStats?.totalVisits || 0;
            const volume = p.lifetimeStats?.totalBookedVolume || 0;
            r.totalVisits += visits;
            r.totalBookedVolume += volume;

            if (p.relationshipDemand === 'high_tlc') {
                r.highTlcCount++;
                r.highTlcVisits += visits;
                if (p.urgencyStatus === 'overdue') r.overdueCount++;
            } else if (p.relationshipDemand === 'self_sufficient') {
                r.selfSuffCount++;
                r.selfSuffVisits += visits;
            } else if (p.relationshipDemand === 'unresponsive') {
                r.unresponsiveCount++;
                r.unresponsiveVisits += visits;
            } else {
                r.insufficientCount++;
            }
        }

        const repAllocations = Array.from(repMap.values()).map(r => {
            const vTotal = Math.max(1, r.totalVisits);
            return {
                ...r,
                highTlcVisitPct: Math.round((r.highTlcVisits / vTotal) * 1000) / 10,
                selfSuffVisitPct: Math.round((r.selfSuffVisits / vTotal) * 1000) / 10,
                unresponsiveVisitPct: Math.round((r.unresponsiveVisits / vTotal) * 1000) / 10,
                misallocatedWarning: (r.unresponsiveVisits / vTotal) > 0.25 || (r.overdueCount >= 5)
            };
        }).sort((a, b) => b.totalBookedVolume - a.totalBookedVolume);

        res.status(200).json({
            success: true,
            repAllocations
        });
    } catch (error) {
        console.error('Error fetching rep allocation diagnostics:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// POST /analytics/relationship-demand/recalculate
// Trigger Full Recomputation
// ==========================================
router.post('/recalculate', async (req, res) => {
    try {
        const result = await recomputeAllProfiles();
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('Error recomputing profiles:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
