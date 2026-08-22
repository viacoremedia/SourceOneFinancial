/**
 * Scorecard Storage & Retention Service
 * 
 * Manages automated lifecycle, MongoDB storage quota enforcement (200MB soft cap),
 * and 30-day retention pruning for Scorecard PDF reports.
 * 
 * @module services/scorecardStorageService
 */

const ScorecardReport = require('../models/ScorecardReport');
const ScorecardReportFile = require('../models/ScorecardReportFile');

const DEFAULT_MAX_STORAGE_BYTES = 200 * 1024 * 1024; // 200 MB
const DEFAULT_RETENTION_DAYS = 30; // 30 Days

/**
 * Get current scorecard storage statistics
 */
async function getStorageUsage() {
    try {
        const [sizeAgg, reportCount, fileCount] = await Promise.all([
            ScorecardReportFile.aggregate([
                {
                    $group: {
                        _id: null,
                        totalBytes: { $sum: '$fileSizeBytes' }
                    }
                }
            ]),
            ScorecardReport.countDocuments({}),
            ScorecardReportFile.countDocuments({})
        ]);

        const totalBytes = sizeAgg[0]?.totalBytes || 0;
        const totalMb = Number((totalBytes / (1024 * 1024)).toFixed(2));

        return {
            totalBytes,
            totalMb,
            reportCount,
            fileCount,
            maxStorageMb: Math.round(DEFAULT_MAX_STORAGE_BYTES / (1024 * 1024))
        };
    } catch (err) {
        console.error('Error fetching scorecard storage usage:', err);
        return { totalBytes: 0, totalMb: 0, reportCount: 0, fileCount: 0, maxStorageMb: 200 };
    }
}

/**
 * Run automated cleanup of expired reports and enforce storage quotas
 * 
 * @param {Object} options
 * @param {number} [options.maxAgeDays=30] - Max age in days to retain reports
 * @param {number} [options.maxStorageBytes=209715200] - Max total bytes before oldest reports are pruned
 * @param {number} [options.minKeepReports=3] - Minimum number of recent reports to preserve
 */
async function cleanupScorecardStorage({
    maxAgeDays = DEFAULT_RETENTION_DAYS,
    maxStorageBytes = DEFAULT_MAX_STORAGE_BYTES,
    minKeepReports = 3
} = {}) {
    try {
        let deletedReportCount = 0;
        let freedBytes = 0;

        // 1. Age-based retention: Delete reports older than maxAgeDays
        const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
        const expiredReports = await ScorecardReport.find({
            generatedAt: { $lt: cutoffDate }
        }).select('_id').lean();

        if (expiredReports.length > 0) {
            const expiredIds = expiredReports.map(r => r._id);
            const deleteFilesResult = await ScorecardReportFile.deleteMany({ reportId: { $in: expiredIds } });
            await ScorecardReport.deleteMany({ _id: { $in: expiredIds } });
            deletedReportCount += expiredReports.length;
            console.log(`[Scorecard Cleanup] Pruned ${expiredReports.length} reports older than ${maxAgeDays} days (${deleteFilesResult.deletedCount} files).`);
        }

        // 2. Size-based quota enforcement: Prune oldest reports if storage > maxStorageBytes
        const currentStats = await getStorageUsage();
        if (currentStats.totalBytes > maxStorageBytes) {
            console.log(`[Scorecard Cleanup] Storage limit exceeded (${currentStats.totalMb} MB / ${Math.round(maxStorageBytes / (1024 * 1024))} MB). Pruning oldest reports...`);

            const allReportsOldestFirst = await ScorecardReport.find({})
                .sort({ generatedAt: 1 })
                .select('_id name generatedAt')
                .lean();

            // Always keep at least minKeepReports
            const eligibleForPruning = allReportsOldestFirst.slice(0, Math.max(0, allReportsOldestFirst.length - minKeepReports));

            let currentBytes = currentStats.totalBytes;
            for (const report of eligibleForPruning) {
                if (currentBytes <= maxStorageBytes) break;

                const files = await ScorecardReportFile.find({ reportId: report._id }).select('fileSizeBytes').lean();
                const reportBytes = files.reduce((s, f) => s + (f.fileSizeBytes || 0), 0);

                await ScorecardReportFile.deleteMany({ reportId: report._id });
                await ScorecardReport.findByIdAndDelete(report._id);

                currentBytes -= reportBytes;
                freedBytes += reportBytes;
                deletedReportCount++;
                console.log(`[Scorecard Cleanup] Pruned older report ${report._id} ("${report.name}"), freed ${(reportBytes / (1024 * 1024)).toFixed(2)} MB.`);
            }
        }

        return {
            success: true,
            deletedReportCount,
            freedBytes,
            freedMb: Number((freedBytes / (1024 * 1024)).toFixed(2))
        };
    } catch (err) {
        console.error('Error during scorecard storage cleanup:', err);
        return { success: false, error: err.message };
    }
}

module.exports = {
    getStorageUsage,
    cleanupScorecardStorage,
    DEFAULT_MAX_STORAGE_BYTES,
    DEFAULT_RETENTION_DAYS
};
