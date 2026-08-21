/**
 * Relationship Demand & TLC Allocation Analytics Routes (v6.2 Final)
 * 
 * Endpoints for Dealer Relationship Demand (DRD) segmentation, sales routing recommendations,
 * overdue visit alerts, rep effort allocation diagnostics, and single dealer drawer inspection.
 * 
 * @module routes/analytics/relationshipDemand
 */

const express = require('express');
const router = express.Router();
const DealerProfile = require('../../models/DealerProfile');
const DealerLocation = require('../../models/DealerLocation');
const Application = require('../../models/Application');
const DealerCommunication = require('../../models/DealerCommunication');
const { recomputeAllProfiles, classifyCommType } = require('../../services/dealerRelationshipEngine');
const { getRepHandles } = require('../../config/repConfig');

// ==========================================
// GET /analytics/relationship-demand/summary
// Summary KPIs, DRD Segment Distribution & Urgency Counts
// ==========================================
router.get('/summary', async (req, res) => {
    try {
        const { rep, state } = req.query;
        const match = {};

        if (rep && rep.trim() && rep !== 'all') {
            const handles = getRepHandles(rep);
            match.assignedRep = { $in: handles.map(h => new RegExp(h, 'i')) };
        }
        if (state && state.trim() && state !== 'all') {
            match.statePrefix = state.trim().toUpperCase();
        }

        const profiles = await DealerProfile.find(match).lean();

        const totalDealers = profiles.length;
        const segments = {
            high_tlc: { count: 0, pct: 0, bookedVolume: 0, totalVisits: 0, totalBookings: 0 },
            self_sufficient: { count: 0, pct: 0, bookedVolume: 0, totalVisits: 0, totalBookings: 0 },
            comfort_stop: { count: 0, pct: 0, bookedVolume: 0, totalVisits: 0, totalBookings: 0 },
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

        if (rep && rep.trim() && rep !== 'all') {
            const handles = getRepHandles(rep);
            match.assignedRep = { $in: handles.map(h => new RegExp(h, 'i')) };
        }

        if (state && state.trim() && state !== 'all') {
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
                sortObj = { daysSinceLastVisit: dir };
                break;
            case 'lift':
            case 'postVisitBookedLiftPct':
                sortObj = { postVisitBookedLiftPct: dir };
                break;
            case 'visits':
                sortObj = { 'lifetimeStats.totalVisits': dir };
                break;
            case 'bookings':
                sortObj = { 'lifetimeStats.totalBookings': dir };
                break;
            case 'volume':
            case 'bookedVolume':
                sortObj = { 'lifetimeStats.totalBookedVolume': dir };
                break;
            case 'yield':
            case 'lifetimeYieldPerVisit':
                sortObj = { lifetimeYieldPerVisit: dir };
                break;
            case 'daysSinceVisit':
                sortObj = { daysSinceLastVisit: dir };
                break;
            case 'cycles':
                sortObj = { verifiedCycleCount: dir };
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
// GET /analytics/relationship-demand/dealers/:clientDealerId/drawer
// Complete Payload for DealerRelationshipDrawer (<50ms response)
// ==========================================
router.get('/dealers/:clientDealerId/drawer', async (req, res) => {
    try {
        const clientDealerId = req.params.clientDealerId.trim().toUpperCase();

        const profile = await DealerProfile.findOne({ clientDealerId }).lean();
        if (!profile) {
            return res.status(404).json({ success: false, message: `Profile not found for dealer ${clientDealerId}` });
        }

        // Fetch recent communications (normalized)
        const rawComms = await DealerCommunication.find({
            internalRelationshipId2: clientDealerId,
            communicationEventDatetime: { $ne: null }
        })
            .sort({ communicationEventDatetime: -1 })
            .limit(50)
            .lean();

        const recentCommunications = rawComms.map(c => ({
            _id: c._id,
            date: c.communicationEventDatetime,
            channel: classifyCommType(c),
            repName: c.communicationUserFullName || 'Sales Rep',
            result: c.communicationResult1 || '',
            feedback: c.communicationFeedback1 || ''
        }));

        // Fetch recent applications
        const recentApplications = await Application.find({
            clientDealerId,
            applicationDate: { $ne: null }
        })
            .select('applicationId applicationDate bookedDate status amountFinanced lender collateralType collateralYear')
            .sort({ applicationDate: -1 })
            .limit(50)
            .lean();

        res.status(200).json({
            success: true,
            profile,
            recentCommunications,
            recentApplications
        });
    } catch (error) {
        console.error('Error fetching dealer DRD drawer payload:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// GET /analytics/relationship-demand/rep-allocation
// Rep Visit Allocation Diagnostic (High TLC vs Autonomous vs Comfort Stops)
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
                    comfortStopCount: 0,
                    insufficientCount: 0,
                    overdueCount: 0,
                    dueSoonCount: 0,
                    onTrackCount: 0,
                    totalVisits: 0,
                    highTlcVisits: 0,
                    selfSuffVisits: 0,
                    comfortStopVisits: 0,
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
                else if (p.urgencyStatus === 'due_soon') r.dueSoonCount++;
                else if (p.urgencyStatus === 'on_track') r.onTrackCount++;
            } else if (p.relationshipDemand === 'self_sufficient') {
                r.selfSuffCount++;
                r.selfSuffVisits += visits;
            } else if (p.relationshipDemand === 'comfort_stop') {
                r.comfortStopCount++;
                r.comfortStopVisits += visits;
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
                comfortStopVisitPct: Math.round((r.comfortStopVisits / vTotal) * 1000) / 10,
                misallocatedWarning: (r.comfortStopVisits / vTotal) > 0.25 || (r.overdueCount >= 5)
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
