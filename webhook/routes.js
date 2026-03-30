const express = require('express');
const busboy = require('busboy');
const router = express.Router();

/**
 * Parse multipart/form-data from a raw body Buffer using busboy.
 * This works on both local dev (where express.raw captures the body)
 * and Vercel (where the stream would otherwise be pre-consumed).
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

        // Feed the raw buffer to busboy
        bb.end(rawBuffer);
    });
}

router.post('/', async (req, res) => {
    try {
        const contentType = req.headers['content-type'] || '';

        console.log('--- Webhook Received ---');
        console.log('Content-Type:', contentType);
        console.log('Body type:', typeof req.body, Buffer.isBuffer(req.body) ? `(Buffer, ${req.body.length} bytes)` : '');

        let bodyData = {};
        let processedFiles = [];

        // --- Handle multipart/form-data (file uploads) ---
        if (contentType.includes('multipart/form-data') && Buffer.isBuffer(req.body)) {
            const { files, fields } = await parseMultipartBuffer(req.body, req.headers);
            bodyData = fields;

            for (const file of files) {
                const content = file.buffer.toString('utf8');
                processedFiles.push({
                    originalName: file.originalName,
                    mimeType: file.mimeType,
                    content: content
                });
            }
        }
        // --- Handle plain text / CSV payloads ---
        else if (typeof req.body === 'string' && req.body.length > 0) {
            // Source One might send the CSV as raw text instead of multipart
            bodyData = {};
            processedFiles.push({
                originalName: 'payload.csv',
                mimeType: contentType || 'text/plain',
                content: req.body
            });
        }
        // --- Handle raw binary payloads ---
        else if (Buffer.isBuffer(req.body) && req.body.length > 0) {
            bodyData = {};
            processedFiles.push({
                originalName: 'payload.bin',
                mimeType: contentType || 'application/octet-stream',
                content: req.body.toString('utf8')
            });
        }
        // --- Handle JSON or urlencoded payloads ---
        else if (typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length > 0) {
            bodyData = req.body;
        }

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

        res.status(200).json({
            success: true,
            message: 'Webhook processed and saved successfully',
            dataReceived: bodyData,
            filesReceived: processedFiles.length
        });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Something went wrong while processing your webhook payload.',
            details: error.message
        });
    }
});

module.exports = router;
