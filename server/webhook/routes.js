const express = require('express');
const busboy = require('busboy');
const router = express.Router();
const WebhookLog = require('../models/WebhookLog');

// ==========================================
// LOGGING HELPER
// ==========================================

/**
 * Write a persistent webhook event log to MongoDB.
 * Fire-and-forget — never throws, never blocks the request.
 * 
 * @param {string} eventType - One of the WebhookLog event types
 * @param {Object} data - Event-specific data fields
 */
async function logWebhookEvent(eventType, data = {}) {
    try {
        await WebhookLog.create({ eventType, ...data });
    } catch (err) {
        // Logging should never crash the webhook handler
        console.error(`[WebhookLog] Failed to write ${eventType}:`, err.message);
    }
}

/**
 * Extract common request metadata for logging.
 */
function extractRequestMeta(req) {
    return {
        method: req.method,
        path: req.originalUrl || req.url,
        contentType: req.headers['content-type'] || null,
        contentLength: parseInt(req.headers['content-length']) || null,
        sourceIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || null,
        userAgent: req.headers['user-agent'] || null,
    };
}

// ==========================================
// MULTIPART PARSING
// ==========================================

/**
 * Parse multipart/form-data from a raw body Buffer using busboy.
 * Works on both local dev and Vercel (where the stream is pre-consumed).
 */
function parseMultipartBuffer(rawBuffer, headers) {
    return new Promise((resolve, reject) => {
        const files = [];
        const fields = {};

        const bb = busboy({ headers });

        bb.on('file', (name, stream, info) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => {
                files.push({
                    fieldname: name,
                    originalName: info.filename || 'unknown',
                    mimeType: info.mimeType || 'application/octet-stream',
                    buffer: Buffer.concat(chunks)
                });
            });
        });

        bb.on('field', (name, value) => {
            fields[name] = value;
        });

        bb.on('finish', () => resolve({ files, fields }));
        bb.on('error', (err) => reject(err));

        bb.end(rawBuffer);
    });
}

/**
 * Try to extract a filename from the request headers.
 * Checks Content-Disposition, common custom headers, and query params.
 */
function extractFilename(req) {
    // 1. Check Content-Disposition header (standard way)
    const disposition = req.headers['content-disposition'];
    if (disposition) {
        const filenameMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)/i);
        if (filenameMatch) return filenameMatch[1];
    }

    // 2. Check common custom headers platforms might send
    const customHeaders = [
        'x-filename', 'x-file-name', 'x-file',
        'x-report-name', 'x-delivery-name',
        'x-omni-filename', 'x-omni-file-name'
    ];
    for (const header of customHeaders) {
        if (req.headers[header]) return req.headers[header];
    }

    // 3. Check query parameters
    if (req.query.filename) return req.query.filename;
    if (req.query.file) return req.query.file;
    if (req.query.name) return req.query.name;

    return null;
}

/**
 * Determine file extension from content-type
 */
function getExtension(contentType) {
    if (contentType.includes('csv')) return '.csv';
    if (contentType.includes('json')) return '.json';
    if (contentType.includes('xml')) return '.xml';
    if (contentType.includes('plain')) return '.txt';
    if (contentType.includes('excel') || contentType.includes('spreadsheet')) return '.xlsx';
    return '.dat';
}

// ==========================================
// GET /webhook/health — Diagnostic health check
// ==========================================
router.get('/health', async (req, res) => {
    try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

        // Count webhook requests in the last 24 hours
        const totalLast24h = await WebhookLog.countDocuments({
            eventType: 'request_received',
            createdAt: { $gte: twentyFourHoursAgo }
        });

        // Find the most recent webhook request
        const lastReceived = await WebhookLog.findOne({ eventType: 'request_received' })
            .sort({ createdAt: -1 })
            .select('createdAt fileName sourceIp contentType')
            .lean();

        // Find the most recent successful ingestion
        const lastIngestion = await WebhookLog.findOne({ eventType: 'ingestion_complete' })
            .sort({ createdAt: -1 })
            .select('createdAt fileName durationMs')
            .lean();

        // Count by event type in last 24h
        const eventBreakdown = await WebhookLog.aggregate([
            { $match: { createdAt: { $gte: twentyFourHoursAgo } } },
            { $group: { _id: '$eventType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Log the health check itself
        await logWebhookEvent('health_check', {
            sourceIp: req.headers['x-forwarded-for'] || req.ip,
            userAgent: req.headers['user-agent'],
        });

        res.status(200).json({
            success: true,
            serverTime: now.toISOString(),
            dbStatus: 'connected',
            webhook: {
                totalLast24h,
                lastReceived: lastReceived ? {
                    at: lastReceived.createdAt,
                    fileName: lastReceived.fileName,
                    sourceIp: lastReceived.sourceIp,
                    contentType: lastReceived.contentType,
                } : null,
                lastSuccessfulIngestion: lastIngestion ? {
                    at: lastIngestion.createdAt,
                    fileName: lastIngestion.fileName,
                    durationMs: lastIngestion.durationMs,
                } : null,
                eventBreakdown: eventBreakdown.reduce((acc, e) => {
                    acc[e._id] = e.count;
                    return acc;
                }, {}),
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            success: false,
            serverTime: new Date().toISOString(),
            dbStatus: 'error',
            error: error.message
        });
    }
});

// ==========================================
// GET /webhook/logs — View persistent webhook event logs
// ==========================================
router.get('/logs', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const filter = {};

        // Filter by event type
        if (req.query.eventType) {
            filter.eventType = req.query.eventType;
        }

        // Filter by date range
        if (req.query.since) {
            filter.createdAt = { ...filter.createdAt, $gte: new Date(req.query.since) };
        }
        if (req.query.until) {
            filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.until) };
        }

        const logs = await WebhookLog.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const totalCount = await WebhookLog.countDocuments(filter);

        res.status(200).json({
            success: true,
            count: logs.length,
            totalCount,
            logs
        });
    } catch (error) {
        console.error('Error fetching webhook logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// POST /webhook — Receive data from Source One
// ==========================================
router.post('/', async (req, res) => {
    const startTime = Date.now();
    const requestMeta = extractRequestMeta(req);

    // ── LOG: Request received ──
    await logWebhookEvent('request_received', {
        ...requestMeta,
        metadata: {
            headers: req.headers,
            query: req.query,
            bodyType: typeof req.body,
            isBuffer: Buffer.isBuffer(req.body),
            bodyLength: Buffer.isBuffer(req.body) ? req.body.length : (typeof req.body === 'string' ? req.body.length : null),
        }
    });

    try {
        const contentType = req.headers['content-type'] || '';

        console.log('--- Webhook Received ---');
        console.log('Content-Type:', contentType);
        console.log('Body type:', typeof req.body, Buffer.isBuffer(req.body) ? `(Buffer, ${req.body.length} bytes)` : '');
        
        // Log ALL headers for debugging (helps us understand what Source One sends)
        console.log('--- All Headers ---');
        for (const [key, value] of Object.entries(req.headers)) {
            console.log(`  ${key}: ${value}`);
        }
        console.log('--- Query Params ---');
        console.log('  ', JSON.stringify(req.query));

        let bodyData = {};
        let processedFiles = [];

        // Try to extract filename from headers/query
        const extractedName = extractFilename(req);

        // --- Handle multipart/form-data (file uploads) ---
        if (contentType.includes('multipart/form-data') && Buffer.isBuffer(req.body)) {
            const { files, fields } = await parseMultipartBuffer(req.body, req.headers);
            bodyData = fields;

            for (const file of files) {
                const content = file.buffer.toString('utf8');
                processedFiles.push({
                    originalName: extractedName 
                        ? `${extractedName}${getExtension(file.mimeType)}` 
                        : file.originalName,
                    mimeType: file.mimeType,
                    content: content
                });
            }
        }
        // --- Handle plain text / CSV payloads (this is how Source One sends data) ---
        else if (typeof req.body === 'string' && req.body.length > 0) {
            const ext = getExtension(contentType);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = extractedName 
                ? `${extractedName}${ext}` 
                : `source_one_delivery_${timestamp}${ext}`;
            
            bodyData = {};
            processedFiles.push({
                originalName: fileName,
                mimeType: contentType.split(';')[0].trim() || 'text/plain',
                content: req.body
            });
        }
        // --- Handle raw binary payloads ---
        else if (Buffer.isBuffer(req.body) && req.body.length > 0) {
            const ext = getExtension(contentType);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const fileName = extractedName 
                ? `${extractedName}${ext}` 
                : `source_one_delivery_${timestamp}${ext}`;
            
            bodyData = {};
            processedFiles.push({
                originalName: fileName,
                mimeType: contentType.split(';')[0].trim() || 'application/octet-stream',
                content: req.body.toString('utf8')
            });
        }
        // --- Handle JSON or urlencoded payloads ---
        else if (typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length > 0) {
            bodyData = req.body;
        }

        // ── LOG: Parse result ──
        const fileNames = processedFiles.map(f => f.originalName);
        await logWebhookEvent('parse_success', {
            ...requestMeta,
            filesCount: processedFiles.length,
            fileName: fileNames[0] || null,
            metadata: {
                fileNames,
                bodyDataKeys: Object.keys(bodyData),
            }
        });

        console.log('Body data:', JSON.stringify(bodyData));
        console.log('Files received:', processedFiles.length);
        if (processedFiles.length > 0) {
            processedFiles.forEach((f, i) => {
                console.log(`  File ${i + 1}: ${f.originalName} (${f.mimeType}, ${f.content.length} chars)`);
            });
        }
        console.log('------------------------');

        // Check if payload is empty
        if (Object.keys(bodyData).length === 0 && processedFiles.length === 0) {
            // ── LOG: Empty payload ──
            await logWebhookEvent('empty_payload', {
                ...requestMeta,
                durationMs: Date.now() - startTime,
            });

            return res.status(400).json({
                success: false,
                error: 'Empty Payload',
                message: 'No data or files were provided in the request.',
                details: 'Please provide some form data or attach files to this webhook payload.'
            });
        }

        // Save to database
        const WebhookPayload = require('../models/WebhookPayload');

        const payloadData = {
            body: bodyData,
            files: processedFiles,
            headers: req.headers
        };

        const payload = new WebhookPayload(payloadData);
        await payload.save();

        // Detect if any files are CSVs that we know how to process
        let processingTriggered = false;
        const ingestionResults = [];
        const csvFiles = processedFiles.filter(f =>
            f.originalName.endsWith('.csv') ||
            (f.mimeType && f.mimeType.includes('csv'))
        );

        if (csvFiles.length > 0) {
            // Check if the CSV headers match a known parser
            const { parseCSV, detectParser } = require('../services/csvParserService');
            const { ingestDealerMetricsCSV } = require('../services/dealerMetricsIngestionService');

            for (const csvFile of csvFiles) {
                try {
                    const firstLine = csvFile.content.split('\n')[0];
                    const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                    const parserName = detectParser(headers);

                    if (parserName) {
                        processingTriggered = true;
                        console.log(`  CSV detected as "${parserName}" format — triggering ingestion`);

                        // ── LOG: Ingestion start ──
                        await logWebhookEvent('ingestion_start', {
                            ...requestMeta,
                            fileName: csvFile.originalName,
                            parserDetected: parserName,
                        });

                        // Await inline — Vercel serverless kills the process after
                        // res.send(), so setImmediate/fire-and-forget never completes.
                        try {
                            const result = await ingestDealerMetricsCSV(
                                csvFile.content,
                                payload._id,
                                csvFile.originalName
                            );
                            console.log(`  Ingestion complete for "${csvFile.originalName}":`, JSON.stringify(result));

                            // ── LOG: Ingestion complete ──
                            await logWebhookEvent('ingestion_complete', {
                                ...requestMeta,
                                fileName: csvFile.originalName,
                                parserDetected: parserName,
                                durationMs: Date.now() - startTime,
                                metadata: {
                                    reportDate: result.reportDate,
                                    dealersProcessed: result.dealersProcessed,
                                    newDealers: result.newDealers,
                                    rowCount: result.rowCount,
                                }
                            });

                            ingestionResults.push({
                                file: csvFile.originalName,
                                status: 'completed',
                                reportDate: result.reportDate,
                                dealersProcessed: result.dealersProcessed,
                                processingTimeMs: result.processingTimeMs
                            });
                        } catch (ingestionError) {
                            console.error(`  Ingestion FAILED for "${csvFile.originalName}":`, ingestionError.message);

                            // ── LOG: Ingestion failed ──
                            await logWebhookEvent('ingestion_failed', {
                                ...requestMeta,
                                fileName: csvFile.originalName,
                                parserDetected: parserName,
                                error: ingestionError.message,
                                durationMs: Date.now() - startTime,
                            });

                            ingestionResults.push({
                                file: csvFile.originalName,
                                status: 'failed',
                                error: ingestionError.message
                            });
                        }
                    }
                } catch (detectError) {
                    console.warn(`  Could not detect CSV format: ${detectError.message}`);

                    // ── LOG: Parse error on CSV detection ──
                    await logWebhookEvent('parse_error', {
                        ...requestMeta,
                        fileName: csvFile.originalName,
                        error: detectError.message,
                    });
                }
            }
        }

        res.status(200).json({
            success: true,
            message: 'Webhook processed and saved successfully',
            dataReceived: bodyData,
            filesReceived: processedFiles.length,
            fileNames: processedFiles.map(f => f.originalName),
            processing: processingTriggered,
            ingestion: ingestionResults.length > 0 ? ingestionResults : undefined
        });
    } catch (error) {
        console.error('Error processing webhook:', error);

        // ── LOG: Unhandled error ──
        await logWebhookEvent('parse_error', {
            ...requestMeta,
            error: error.message,
            durationMs: Date.now() - startTime,
        });

        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Something went wrong while processing your webhook payload.',
            details: error.message
        });
    }
});

// ==========================================
// GET /webhook — View recent payloads (for debugging)
// ==========================================
router.get('/', async (req, res) => {
    try {
        const WebhookPayload = require('../models/WebhookPayload');
        const limit = Math.min(parseInt(req.query.limit) || 5, 20);
        
        const payloads = await WebhookPayload.find({})
            .sort({ receivedAt: -1 })
            .limit(limit)
            .lean();

        // Summarize — don't return full file contents in the GET response
        const summary = payloads.map(p => ({
            id: p._id,
            receivedAt: p.receivedAt,
            body: p.body,
            files: (p.files || []).map(f => ({
                originalName: f.originalName,
                mimeType: f.mimeType,
                contentLength: f.content ? f.content.length : 0,
                contentPreview: f.content ? f.content.substring(0, 500) : ''
            })),
            headers: p.headers
        }));

        res.status(200).json({
            success: true,
            count: summary.length,
            payloads: summary
        });
    } catch (error) {
        console.error('Error fetching payloads:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

// ==========================================
// GET /webhook/ingestion-log — View CSV processing history
// ==========================================
router.get('/ingestion-log', async (req, res) => {
    try {
        const FileIngestionLog = require('../models/FileIngestionLog');
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const filter = {};

        if (req.query.status) {
            const validStatuses = ['pending', 'processing', 'completed', 'failed'];
            if (validStatuses.includes(req.query.status)) {
                filter.status = req.query.status;
            }
        }

        const logs = await FileIngestionLog.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        res.status(200).json({
            success: true,
            count: logs.length,
            logs
        });
    } catch (error) {
        console.error('Error fetching ingestion logs:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==========================================
// POST /webhook/reingest/:id — Re-trigger ingestion for a specific payload
// Use this to manually re-process payloads that failed or were missed.
// ==========================================
router.post('/reingest/:id', async (req, res) => {
    try {
        const WebhookPayload = require('../models/WebhookPayload');
        const FileIngestionLog = require('../models/FileIngestionLog');
        const { detectParser } = require('../services/csvParserService');
        const { ingestDealerMetricsCSV } = require('../services/dealerMetricsIngestionService');

        const payload = await WebhookPayload.findById(req.params.id).lean();
        if (!payload) {
            return res.status(404).json({ success: false, error: 'Payload not found' });
        }

        // Clear any stuck/failed ingestion log for this payload so it can be reprocessed
        await FileIngestionLog.deleteMany({ sourcePayload: payload._id });

        const results = [];
        for (const file of (payload.files || [])) {
            const isCSV = file.originalName.endsWith('.csv') ||
                (file.mimeType && file.mimeType.includes('csv'));
            if (!isCSV) continue;

            try {
                const firstLine = file.content.split('\n')[0];
                const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                const parserName = detectParser(headers);

                if (!parserName) {
                    results.push({ file: file.originalName, status: 'skipped', reason: 'Unknown format' });
                    continue;
                }

                const result = await ingestDealerMetricsCSV(
                    file.content,
                    payload._id,
                    file.originalName
                );
                results.push({
                    file: file.originalName,
                    status: 'completed',
                    reportDate: result.reportDate,
                    dealersProcessed: result.dealersProcessed,
                    processingTimeMs: result.processingTimeMs
                });
            } catch (err) {
                results.push({ file: file.originalName, status: 'failed', error: err.message });
            }
        }

        res.status(200).json({ success: true, payloadId: req.params.id, results });
    } catch (error) {
        console.error('Error re-ingesting:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// GET /webhook/:id — View full payload by ID
// ==========================================
router.get('/:id', async (req, res) => {
    try {
        const WebhookPayload = require('../models/WebhookPayload');
        const payload = await WebhookPayload.findById(req.params.id).lean();

        if (!payload) {
            return res.status(404).json({ success: false, error: 'Not Found' });
        }

        res.status(200).json({
            success: true,
            payload: payload
        });
    } catch (error) {
        console.error('Error fetching payload:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
