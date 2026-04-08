/**
 * Daily Activity Digest Report
 * 
 * Generates a summary email of dealer network activity after each CSV ingestion.
 * Compares today's snapshots to yesterday's to detect status changes,
 * new applications/approvals/bookings, and at-risk dealers.
 * 
 * @module services/reports/dailyDigest
 */

const DailyDealerSnapshot = require('../../models/DailyDealerSnapshot');
const DealerLocation = require('../../models/DealerLocation');
const DealerGroup = require('../../models/DealerGroup');
const SalesBudget = require('../../models/SalesBudget');

/**
 * Collect all data needed for the daily digest.
 * 
 * @param {Date} reportDate - The date of the ingested report
 * @returns {Promise<Object>} Collected metrics for template rendering
 */
async function collectDigestData(reportDate) {
    // Normalize to midnight UTC for date comparisons
    const today = new Date(reportDate);
    today.setUTCHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    // 0. Build state → rep lookup map
    const budgetDocs = await SalesBudget.find({ year: today.getUTCFullYear() })
        .select('state rep').lean();
    const stateRepMap = {};
    for (const b of budgetDocs) {
        stateRepMap[b.state] = b.rep;
    }

    // 1. Status breakdown for today
    const statusBreakdown = await DailyDealerSnapshot.aggregate([
        { $match: { reportDate: today } },
        { $group: { _id: '$activityStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
    ]);

    const statusMap = {};
    let totalToday = 0;
    for (const s of statusBreakdown) {
        statusMap[s._id] = s.count;
        totalToday += s.count;
    }

    // 2. Status breakdown for yesterday (for day-over-day changes)
    const yesterdayBreakdown = await DailyDealerSnapshot.aggregate([
        { $match: { reportDate: yesterday } },
        { $group: { _id: '$activityStatus', count: { $sum: 1 } } },
    ]);

    const yesterdayMap = {};
    for (const s of yesterdayBreakdown) {
        yesterdayMap[s._id] = s.count;
    }

    // 3. Detect new events by comparing today vs yesterday snapshots
    // Find dealers where lastApplicationDate changed
    const eventCounts = await DailyDealerSnapshot.aggregate([
        {
            $match: { reportDate: today }
        },
        {
            $lookup: {
                from: 'dailydealersnapshots',
                let: { locId: '$dealerLocation' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ['$dealerLocation', '$$locId'] },
                                    { $eq: ['$reportDate', yesterday] },
                                ]
                            }
                        }
                    },
                    { $limit: 1 },
                ],
                as: 'prev',
            }
        },
        { $addFields: { prevSnap: { $arrayElemAt: ['$prev', 0] } } },
        {
            $group: {
                _id: null,
                newApplications: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$lastApplicationDate', null] },
                                    { $ne: ['$lastApplicationDate', '$prevSnap.lastApplicationDate'] },
                                ]
                            }, 1, 0
                        ]
                    }
                },
                newApprovals: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$lastApprovalDate', null] },
                                    { $ne: ['$lastApprovalDate', '$prevSnap.lastApprovalDate'] },
                                ]
                            }, 1, 0
                        ]
                    }
                },
                newBookings: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$lastBookedDate', null] },
                                    { $ne: ['$lastBookedDate', '$prevSnap.lastBookedDate'] },
                                ]
                            }, 1, 0
                        ]
                    }
                },
                reactivations: {
                    $sum: { $cond: [{ $eq: ['$reactivatedAfterVisit', true] }, 1, 0] }
                },
            }
        }
    ]);

    const events = eventCounts[0] || { newApplications: 0, newApprovals: 0, newBookings: 0, reactivations: 0 };

    // 4. Top 5 at-risk dealers (active but highest daysSinceLastApplication)
    const atRiskPipeline = [
        {
            $match: {
                reportDate: today,
                activityStatus: 'active',
                daysSinceLastApplication: { $ne: null },
            }
        },
        { $sort: { daysSinceLastApplication: -1 } },
        { $limit: 5 },
        {
            $lookup: {
                from: 'dealerlocations',
                localField: 'dealerLocation',
                foreignField: '_id',
                as: 'location',
            }
        },
        { $addFields: { location: { $arrayElemAt: ['$location', 0] } } },
        {
            $project: {
                dealerName: '$location.dealerName',
                dealerId: '$location.dealerId',
                statePrefix: '$location.statePrefix',
                daysSinceLastApplication: 1,
                activityStatus: 1,
            }
        },
    ];

    const atRiskDealers = (await DailyDealerSnapshot.aggregate(atRiskPipeline))
        .map(d => ({ ...d, rep: stateRepMap[d.statePrefix] || '—' }))
        .sort((a, b) => a.rep.localeCompare(b.rep));

    // 5. Find dealers whose status actually changed (with names)
    let statusTransitions = [];
    if (yesterdayBreakdown.length > 0) {
        statusTransitions = await DailyDealerSnapshot.aggregate([
            { $match: { reportDate: today } },
            {
                $lookup: {
                    from: 'dailydealersnapshots',
                    let: { locId: '$dealerLocation' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$dealerLocation', '$$locId'] },
                                        { $eq: ['$reportDate', yesterday] },
                                    ]
                                }
                            }
                        },
                        { $limit: 1 },
                    ],
                    as: 'prev',
                }
            },
            { $addFields: { prevSnap: { $arrayElemAt: ['$prev', 0] } } },
            // Only keep rows where status actually changed
            {
                $match: {
                    prevSnap: { $ne: null },
                    $expr: { $ne: ['$activityStatus', '$prevSnap.activityStatus'] },
                }
            },
            // Lookup dealer name
            {
                $lookup: {
                    from: 'dealerlocations',
                    localField: 'dealerLocation',
                    foreignField: '_id',
                    as: 'location',
                }
            },
            { $addFields: { location: { $arrayElemAt: ['$location', 0] } } },
            {
                $project: {
                    dealerName: '$location.dealerName',
                    dealerId: '$location.dealerId',
                    statePrefix: '$location.statePrefix',
                    from: '$prevSnap.activityStatus',
                    to: '$activityStatus',
                    daysSinceLastApplication: 1,
                }
            },
            { $sort: { from: 1, to: 1, dealerName: 1 } },
            { $limit: 50 }, // Cap to keep email reasonable
        ]);
        statusTransitions = statusTransitions
            .map(t => ({ ...t, rep: stateRepMap[t.statePrefix] || '—' }))
            .sort((a, b) => a.rep.localeCompare(b.rep) || a.from.localeCompare(b.from));
    }

    // 6. Network totals
    const totalDealers = await DealerLocation.countDocuments();
    const totalGroups = await DealerGroup.countDocuments();

    return {
        reportDate: today,
        totalDealers,
        totalGroups,
        totalSnapshotsToday: totalToday,
        status: {
            active: statusMap['active'] || 0,
            inactive30: statusMap['30d_inactive'] || 0,
            inactive60: statusMap['60d_inactive'] || 0,
            longInactive: statusMap['long_inactive'] || 0,
            neverActive: statusMap['never_active'] || 0,
        },
        statusChanges: {
            active: (statusMap['active'] || 0) - (yesterdayMap['active'] || 0),
            inactive30: (statusMap['30d_inactive'] || 0) - (yesterdayMap['30d_inactive'] || 0),
            inactive60: (statusMap['60d_inactive'] || 0) - (yesterdayMap['60d_inactive'] || 0),
            longInactive: (statusMap['long_inactive'] || 0) - (yesterdayMap['long_inactive'] || 0),
        },
        events,
        atRiskDealers,
        statusTransitions,
        hasYesterdayData: yesterdayBreakdown.length > 0,
    };
}

/**
 * Format a date as "April 8, 2026"
 */
function formatDate(d) {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Render a change indicator: "+5" green, "-3" red, "—" grey
 */
function changeHtml(val) {
    if (val > 0) return `<span style="color:#34d399;font-weight:600;">+${val}</span>`;
    if (val < 0) return `<span style="color:#f87171;font-weight:600;">${val}</span>`;
    return `<span style="color:#64748b;">—</span>`;
}

/**
 * Human-readable status label with color
 */
const STATUS_DISPLAY = {
    'active': { label: 'Active', color: '#34d399' },
    '30d_inactive': { label: '30d Inactive', color: '#fbbf24' },
    '60d_inactive': { label: '60d Inactive', color: '#f97316' },
    'long_inactive': { label: 'Long Inactive', color: '#ef4444' },
    'never_active': { label: 'Never Active', color: '#64748b' },
};

function statusLabel(status) {
    const s = STATUS_DISPLAY[status] || { label: status, color: '#94a3b8' };
    return `<span style="color:${s.color};font-weight:600;">${s.label}</span>`;
}

/**
 * Generate the daily digest email.
 * 
 * @param {Date} reportDate - The date of the ingested report
 * @returns {Promise<{ subject: string, html: string }>}
 */
async function generateDailyDigest(reportDate) {
    const data = await collectDigestData(reportDate);
    const dateStr = formatDate(data.reportDate);
    const activeRate = data.totalSnapshotsToday > 0
        ? Math.round((data.status.active / data.totalSnapshotsToday) * 100)
        : 0;

    const subject = `📊 Source One Daily Digest — ${dateStr}`;

    // Compute gross in/out per status category from transitions
    const flows = { active: { in: 0, out: 0 }, '30d_inactive': { in: 0, out: 0 }, '60d_inactive': { in: 0, out: 0 }, 'long_inactive': { in: 0, out: 0 } };
    for (const t of data.statusTransitions) {
        if (flows[t.from]) flows[t.from].out++;
        if (flows[t.to]) flows[t.to].in++;
    }

    function flowHtml(key) {
        const f = flows[key];
        if (!f || (f.in === 0 && f.out === 0)) return `<span style="color:#64748b;">—</span>`;
        const parts = [];
        if (f.in > 0) parts.push(`<span style="color:#34d399;">↑${f.in}</span>`);
        if (f.out > 0) parts.push(`<span style="color:#f87171;">↓${f.out}</span>`);
        return parts.join(' ');
    }

    // Group transitions by type for flow summary
    const flowGroups = {};
    for (const t of data.statusTransitions) {
        const key = `${t.from}→${t.to}`;
        if (!flowGroups[key]) flowGroups[key] = { from: t.from, to: t.to, count: 0 };
        flowGroups[key].count++;
    }
    const flowSummaryItems = Object.values(flowGroups).sort((a, b) => b.count - a.count);

    // Build at-risk table rows
    let atRiskRows = '';
    if (data.atRiskDealers.length > 0) {
        atRiskRows = data.atRiskDealers.map(d =>
            `<tr>
                <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px;">${d.dealerName || 'Unknown'}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${d.dealerId || '—'}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#818cf8;font-size:13px;text-align:center;">${d.rep}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1e293b;color:#f87171;font-size:13px;font-weight:600;text-align:center;">${d.daysSinceLastApplication}d</td>
            </tr>`
        ).join('');
    }

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:28px;">
      <h1 style="margin:0 0 4px;font-size:22px;color:#f1f5f9;">📊 Daily Activity Digest</h1>
      <p style="margin:0;font-size:14px;color:#64748b;">${dateStr}</p>
    </div>

    <!-- Summary Cards -->
    <div style="display:flex;gap:8px;margin-bottom:24px;">
      <div style="flex:1;background:#162031;border:1px solid #1e293b;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#34d399;">${data.status.active.toLocaleString()}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">Active</div>
        ${data.hasYesterdayData ? `<div style="font-size:12px;margin-top:4px;">${flowHtml('active')}</div>` : ''}
      </div>
      <div style="flex:1;background:#162031;border:1px solid #1e293b;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#fbbf24;">${data.status.inactive30.toLocaleString()}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">30d Inactive</div>
        ${data.hasYesterdayData ? `<div style="font-size:12px;margin-top:4px;">${flowHtml('30d_inactive')}</div>` : ''}
      </div>
      <div style="flex:1;background:#162031;border:1px solid #1e293b;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#f97316;">${data.status.inactive60.toLocaleString()}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">60d Inactive</div>
        ${data.hasYesterdayData ? `<div style="font-size:12px;margin-top:4px;">${flowHtml('60d_inactive')}</div>` : ''}
      </div>
      <div style="flex:1;background:#162031;border:1px solid #1e293b;border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#ef4444;">${data.status.longInactive.toLocaleString()}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">Long Inactive</div>
        ${data.hasYesterdayData ? `<div style="font-size:12px;margin-top:4px;">${flowHtml('long_inactive')}</div>` : ''}
      </div>
    </div>

    <!-- Status Changes (which dealers actually moved) -->
    ${data.statusTransitions.length > 0 ? `
    <div style="background:#162031;border:1px solid #1e293b;border-radius:10px;padding:16px;margin-bottom:24px;">
      <h2 style="margin:0 0 14px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">🔄 Status Changes (${data.statusTransitions.length} dealer${data.statusTransitions.length > 1 ? 's' : ''})</h2>

      <!-- Flow summary -->
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
        ${flowSummaryItems.map(f => `<span style="background:#0f172a;border-radius:6px;padding:4px 10px;font-size:12px;">
          ${statusLabel(f.from)} <span style="color:#475569;">→</span> ${statusLabel(f.to)}: <span style="color:#e2e8f0;font-weight:600;">${f.count}</span>
        </span>`).join('')}
      </div>

      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">Dealer</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">ID</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">Rep</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">From</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;"></th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">To</th>
          </tr>
        </thead>
        <tbody>
          ${data.statusTransitions.map(t => `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:13px;">${t.dealerName || 'Unknown'}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:12px;">${t.dealerId || '—'}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #1e293b;color:#818cf8;font-size:12px;text-align:center;">${t.rep}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #1e293b;text-align:center;font-size:12px;">${statusLabel(t.from)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #1e293b;text-align:center;color:#475569;font-size:12px;">→</td>
            <td style="padding:6px 12px;border-bottom:1px solid #1e293b;text-align:center;font-size:12px;">${statusLabel(t.to)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Active Rate Bar -->
    <div style="background:#162031;border:1px solid #1e293b;border-radius:10px;padding:16px;margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:13px;color:#94a3b8;">Network Active Rate</span>
        <span style="font-size:18px;font-weight:700;color:${activeRate >= 50 ? '#34d399' : activeRate >= 30 ? '#fbbf24' : '#ef4444'};">${activeRate}%</span>
      </div>
      <div style="background:#0f172a;border-radius:6px;height:8px;overflow:hidden;">
        <div style="background:linear-gradient(90deg,#34d399,#3b82f6);height:100%;width:${activeRate}%;border-radius:6px;transition:width 0.3s;"></div>
      </div>
      <div style="font-size:11px;color:#475569;margin-top:6px;">${data.totalSnapshotsToday.toLocaleString()} dealers tracked across ${data.totalGroups} groups</div>
    </div>

    <!-- Today's Events -->
    <div style="background:#162031;border:1px solid #1e293b;border-radius:10px;padding:16px;margin-bottom:24px;">
      <h2 style="margin:0 0 14px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Today's Activity</h2>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:120px;background:#0f172a;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#60a5fa;">${data.events.newApplications}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">New Applications</div>
        </div>
        <div style="flex:1;min-width:120px;background:#0f172a;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#a78bfa;">${data.events.newApprovals}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">New Approvals</div>
        </div>
        <div style="flex:1;min-width:120px;background:#0f172a;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#2dd4bf;">${data.events.newBookings}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">New Bookings</div>
        </div>
        <div style="flex:1;min-width:120px;background:#0f172a;border-radius:8px;padding:12px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#34d399;">${data.events.reactivations}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">Reactivations</div>
        </div>
      </div>
    </div>

    <!-- At-Risk Dealers -->
    ${data.atRiskDealers.length > 0 ? `
    <div style="background:#162031;border:1px solid #1e293b;border-radius:10px;padding:16px;margin-bottom:24px;">
      <h2 style="margin:0 0 14px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">⚠️ At-Risk Dealers (Active, Longest Since App)</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">Dealer</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">ID</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">Rep</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">Days Since App</th>
          </tr>
        </thead>
        <tbody>
          ${atRiskRows}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Footer -->
    <div style="text-align:center;padding-top:16px;border-top:1px solid #1e293b;">
      <p style="margin:0;font-size:12px;color:#475569;">
        Source One Analytics — Automated Daily Report
      </p>
    </div>

  </div>
</body>
</html>`;

    return { subject, html };
}

module.exports = { generateDailyDigest, collectDigestData };
