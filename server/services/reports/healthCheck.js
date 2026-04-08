/**
 * System Health Check Report
 * 
 * Evaluates ingestion health after each CSV processing.
 * Only generates an email if issues are detected (alert-only).
 * 
 * Checks:
 * 1. Ingestion failure status
 * 2. Row count anomaly (±20% from 7-day average)
 * 3. New dealer spike (>20 in one ingestion)
 * 4. Processing time spike (>3x rolling average)
 * 5. Report date gaps (missing days)
 * 6. Parse errors
 * 
 * @module services/reports/healthCheck
 */

const FileIngestionLog = require('../../models/FileIngestionLog');
const DailyDealerSnapshot = require('../../models/DailyDealerSnapshot');

/**
 * Severity levels for health check results.
 */
const SEVERITY = {
    CRITICAL: 'critical',
    WARNING: 'warning',
    OK: 'ok',
};

/**
 * Run all health checks against the latest ingestion result.
 * Returns null if all checks pass (no alert needed).
 * 
 * @param {Object} ingestionResult - Summary from ingestDealerMetricsCSV()
 * @param {Date} reportDate - The report date from the CSV
 * @returns {Promise<{ subject: string, html: string } | null>} Email content or null if healthy
 */
async function generateHealthCheck(ingestionResult, reportDate) {
    const checks = [];

    // ─── Check 1: Ingestion status ───
    if (ingestionResult.errors && ingestionResult.errors.length > 0) {
        checks.push({
            name: 'Parse Errors',
            severity: ingestionResult.errors.length > 10 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
            message: `${ingestionResult.errors.length} parse error(s) during ingestion`,
            details: ingestionResult.errors.slice(0, 5).join('; '),
        });
    }

    // ─── Check 2: Row count anomaly ───
    const recentLogs = await FileIngestionLog.find({
        status: 'completed',
        rowCount: { $gt: 0 },
    }).sort({ createdAt: -1 }).limit(8).lean();

    // Exclude the current ingestion (most recent) to compute baseline
    const historicalLogs = recentLogs.filter(l =>
        l.reportDate && l.reportDate.getTime() !== reportDate.getTime()
    ).slice(0, 7);

    if (historicalLogs.length >= 3) {
        const avgRowCount = Math.round(
            historicalLogs.reduce((sum, l) => sum + l.rowCount, 0) / historicalLogs.length
        );
        const rowRatio = ingestionResult.rowCount / avgRowCount;

        if (rowRatio < 0.8) {
            checks.push({
                name: 'Row Count Drop',
                severity: rowRatio < 0.5 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
                message: `Row count ${ingestionResult.rowCount.toLocaleString()} is ${Math.round((1 - rowRatio) * 100)}% below the 7-day average of ${avgRowCount.toLocaleString()}`,
                details: `Possible data issue — expected ~${avgRowCount.toLocaleString()} rows`,
            });
        } else if (rowRatio > 1.2) {
            checks.push({
                name: 'Row Count Spike',
                severity: SEVERITY.WARNING,
                message: `Row count ${ingestionResult.rowCount.toLocaleString()} is ${Math.round((rowRatio - 1) * 100)}% above the 7-day average of ${avgRowCount.toLocaleString()}`,
                details: 'Possible new data source or format change',
            });
        }

        // ─── Check 3: Processing time spike ───
        const avgTime = Math.round(
            historicalLogs.reduce((sum, l) => sum + (l.processingTimeMs || 0), 0) / historicalLogs.length
        );
        if (avgTime > 0 && ingestionResult.processingTimeMs > avgTime * 3) {
            checks.push({
                name: 'Processing Time Spike',
                severity: SEVERITY.WARNING,
                message: `Processing took ${(ingestionResult.processingTimeMs / 1000).toFixed(1)}s — ${Math.round(ingestionResult.processingTimeMs / avgTime)}x the average of ${(avgTime / 1000).toFixed(1)}s`,
                details: 'Possible DB performance issue or data volume change',
            });
        }
    }

    // ─── Check 4: New dealer spike ───
    if (ingestionResult.newDealers > 20) {
        checks.push({
            name: 'New Dealer Spike',
            severity: SEVERITY.WARNING,
            message: `${ingestionResult.newDealers} new dealers detected in a single ingestion`,
            details: 'Possible format change, new territory, or data issue',
        });
    }

    // ─── Check 5: Report date gap ───
    const latestDates = await DailyDealerSnapshot.aggregate([
        { $group: { _id: '$reportDate' } },
        { $sort: { _id: -1 } },
        { $limit: 5 },
    ]);

    if (latestDates.length >= 2) {
        const dates = latestDates.map(d => d._id).sort((a, b) => b - a);
        const latestDate = dates[0];
        const secondDate = dates[1];
        const gapDays = Math.round((latestDate - secondDate) / (1000 * 60 * 60 * 24));

        if (gapDays > 2) {
            checks.push({
                name: 'Report Date Gap',
                severity: gapDays > 4 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
                message: `${gapDays}-day gap detected between the last two report dates`,
                details: `Latest: ${latestDate.toISOString().slice(0, 10)}, Previous: ${secondDate.toISOString().slice(0, 10)}`,
            });
        }
    }

    // ───  If all checks pass, no alert needed ───
    if (checks.length === 0) {
        return null;
    }

    // ─── Render alert email ───
    const hasCritical = checks.some(c => c.severity === SEVERITY.CRITICAL);
    const severityLabel = hasCritical ? '🔴 CRITICAL' : '🟡 WARNING';
    const severityColor = hasCritical ? '#ef4444' : '#f59e0b';
    const dateStr = reportDate.toISOString().slice(0, 10);

    const subject = `${hasCritical ? '🔴' : '🟡'} Source One Health Alert — ${dateStr}`;

    const checkRows = checks.map(c => {
        const icon = c.severity === SEVERITY.CRITICAL ? '🔴' : '🟡';
        const color = c.severity === SEVERITY.CRITICAL ? '#ef4444' : '#f59e0b';
        return `
        <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-size:13px;">
                <span style="color:${color};font-weight:600;">${icon} ${c.name}</span>
            </td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-size:13px;color:#e2e8f0;">
                ${c.message}
                ${c.details ? `<br><span style="font-size:11px;color:#64748b;">${c.details}</span>` : ''}
            </td>
        </tr>`;
    }).join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <!-- Alert Banner -->
    <div style="background:${hasCritical ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'};border:1px solid ${severityColor};border-radius:10px;padding:20px;text-align:center;margin-bottom:24px;">
      <div style="font-size:18px;font-weight:700;color:${severityColor};">${severityLabel}</div>
      <div style="font-size:14px;color:#94a3b8;margin-top:4px;">
        System Health Alert — ${dateStr}
      </div>
      <div style="font-size:12px;color:#64748b;margin-top:8px;">
        ${checks.length} issue${checks.length > 1 ? 's' : ''} detected during ingestion
      </div>
    </div>

    <!-- Check Results -->
    <div style="background:#162031;border:1px solid #1e293b;border-radius:10px;overflow:hidden;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;width:140px;">Check</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #334155;">Details</th>
          </tr>
        </thead>
        <tbody>
          ${checkRows}
        </tbody>
      </table>
    </div>

    <!-- Ingestion Summary -->
    <div style="background:#162031;border:1px solid #1e293b;border-radius:10px;padding:16px;margin-bottom:24px;">
      <h2 style="margin:0 0 12px;font-size:14px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Ingestion Summary</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <div style="flex:1;min-width:100px;background:#0f172a;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#e2e8f0;">${(ingestionResult.rowCount || 0).toLocaleString()}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">Rows</div>
        </div>
        <div style="flex:1;min-width:100px;background:#0f172a;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#e2e8f0;">${(ingestionResult.dealersProcessed || 0).toLocaleString()}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">Dealers</div>
        </div>
        <div style="flex:1;min-width:100px;background:#0f172a;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#e2e8f0;">${ingestionResult.newDealers || 0}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">New</div>
        </div>
        <div style="flex:1;min-width:100px;background:#0f172a;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:20px;font-weight:700;color:#e2e8f0;">${((ingestionResult.processingTimeMs || 0) / 1000).toFixed(1)}s</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">Time</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding-top:16px;border-top:1px solid #1e293b;">
      <p style="margin:0;font-size:12px;color:#475569;">
        Source One Analytics — System Health Monitor
      </p>
    </div>

  </div>
</body>
</html>`;

    return { subject, html };
}

module.exports = { generateHealthCheck };
