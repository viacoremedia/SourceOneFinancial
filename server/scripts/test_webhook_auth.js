/**
 * Webhook Authentication and Multi-Table Ingestion Integration Test
 * 
 * Verifies:
 * 1. 401 Unauthorized when no token is provided.
 * 2. 401 Unauthorized when an invalid token is provided.
 * 3. 200 OK when valid Bearer token is provided.
 * 4. 200 OK when valid x-webhook-token header is provided.
 * 5. 200 OK when valid query param token is provided.
 * 6. Detection and ingestion handling for all 3 OMNI tables.
 * 
 * Usage:
 *   NODE_PATH=server/node_modules node server/scripts/test_webhook_auth.js
 */

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const webhookRoutes = require('../webhook/routes');
const WebhookPayload = require('../models/WebhookPayload');
const FileIngestionLog = require('../models/FileIngestionLog');
const WebhookLog = require('../models/WebhookLog');

const PORT = 3199;
const BASE_URL = `http://127.0.0.1:${PORT}/webhook`;
const VALID_TOKEN = process.env.WEBHOOK_TOKEN || 'so_wh_live_ecn_8f2b7a91c4e6d302';

async function runTests() {
    console.log('==================================================');
    console.log(' WEBHOOK AUTH & MULTI-TABLE INGESTION TEST SUITE');
    console.log('==================================================\n');

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.\n');

    // Create Express test app
    const app = express();
    app.use(express.raw({
        type: (req) => {
            const ct = req.headers['content-type'] || '';
            return ct.includes('multipart/form-data') || ct.includes('application/octet-stream');
        },
        limit: '50mb'
    }));
    app.use(express.text({ type: ['text/*'], limit: '50mb' }));
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true }));

    app.use('/webhook', webhookRoutes);

    const server = app.listen(PORT);
    console.log(`Test server running on port ${PORT}...\n`);

    let passed = 0;
    let failed = 0;

    function assert(name, condition, extra = '') {
        if (condition) {
            console.log(`  ✓ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${name} ${extra}`);
            failed++;
        }
    }

    try {
        // Test 1: Public GET /webhook/health should work without auth
        console.log('--- TEST 1: Public Health Check ---');
        const healthRes = await fetch(`${BASE_URL}/health`);
        const healthData = await healthRes.json();
        assert('Health check returns 200', healthRes.status === 200);
        assert('Health check reports DB connected', healthData.dbStatus === 'connected');

        // Test 2: POST /webhook without token -> 401
        console.log('\n--- TEST 2: Rejection of Unauthenticated POST ---');
        const noAuthRes = await fetch(BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/csv' },
            body: 'dummy,data\n1,2'
        });
        const noAuthData = await noAuthRes.json();
        assert('Returns 401 when token is omitted', noAuthRes.status === 401);
        assert('Error message specifies unauthorized', noAuthData.error === 'Unauthorized');

        // Test 3: POST /webhook with wrong token -> 401
        console.log('\n--- TEST 3: Rejection of Invalid Token ---');
        const badAuthRes = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/csv',
                'Authorization': 'Bearer wrong_token_12345'
            },
            body: 'dummy,data\n1,2'
        });
        assert('Returns 401 when token is invalid', badAuthRes.status === 401);

        // Test 4: POST /webhook with valid Bearer token -> Accepts request
        console.log('\n--- TEST 4: Authorization: Bearer <token> ---');
        const sampleDealerCsv = `DEALERID,CLIENTDEALERID,ISACTIVE,ENROLLMENTDATE,DEALERNAME
TEST999,TEST999,1,2026-01-01,Test Webhook Dealer Location`;
        
        const bearerRes = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/csv',
                'Authorization': `Bearer ${VALID_TOKEN}`,
                'X-Filename': 'dealer_information_test.csv'
            },
            body: sampleDealerCsv
        });
        const bearerData = await bearerRes.json();
        assert('Returns 200 with valid Bearer token', bearerRes.status === 200, JSON.stringify(bearerData));
        assert('Detects dealer_information parser', bearerData.ingestion?.[0]?.parser === 'dealer_information');
        assert('WebhookPayload created in DB', bearerData.success === true);

        // Test 5: POST /webhook with x-webhook-token header
        console.log('\n--- TEST 5: x-webhook-token Header ---');
        const sampleCommCsv = `SOURCESYSTEMCOMMUNICATIONID,COMMUNICATIONTYPE,COMMUNICATIONEVENTDATETIME,COMMUNICATIONUSERFULLNAME,RECIPIENTORGANIZATIONNAME,INTERNALRELATIONSHIPID2
TEST_COMM_999,Dealer Visit,2026-09-01 10:00:00,Test Rep,Test Dealer,TEST999`;

        const headerRes = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/csv',
                'x-webhook-token': VALID_TOKEN,
                'X-Filename': 'salescomms_test.csv'
            },
            body: sampleCommCsv
        });
        const headerData = await headerRes.json();
        assert('Returns 200 with x-webhook-token header', headerRes.status === 200, JSON.stringify(headerData));
        assert('Detects dealer_communication parser', headerData.ingestion?.[0]?.parser === 'dealer_communication');

        // Test 6: POST /webhook with query param token & main_application table
        console.log('\n--- TEST 6: Query Parameter Token & Main Application Table ---');
        const sampleAppCsv = `APPLICATIONID,AMOUNTFINANCED,STATUS,DEALERNAME,APPLICATIONDATE DATE,CLIENTDEALERID
TEST_APP_999,25000,Approved,Test Webhook Dealer Location,2026-09-02,TEST999`;

        const queryRes = await fetch(`${BASE_URL}?token=${VALID_TOKEN}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/csv',
                'X-Filename': 'Main_data_test.csv'
            },
            body: sampleAppCsv
        });
        const queryData = await queryRes.json();
        assert('Returns 200 with ?token= query parameter', queryRes.status === 200, JSON.stringify(queryData));
        assert('Detects main_application parser', queryData.ingestion?.[0]?.parser === 'main_application');

        // Clean up test records
        console.log('\nCleaning up test records from database...');
        const DealerLocation = require('../models/DealerLocation');
        const DealerCommunication = require('../models/DealerCommunication');
        const Application = require('../models/Application');

        await DealerLocation.deleteOne({ dealerId: 'TEST999' });
        await DealerCommunication.deleteOne({ sourceCommunicationId: 'TEST_COMM_999' });
        await Application.deleteOne({ applicationId: 'TEST_APP_999' });
        await WebhookPayload.deleteMany({ 'files.originalName': { $in: ['dealer_information_test.csv', 'salescomms_test.csv', 'Main_data_test.csv'] } });
        console.log('Cleanup complete.');

    } catch (err) {
        console.error('Test suite error:', err);
        failed++;
    } finally {
        server.close();
        await mongoose.disconnect();
        console.log('\n==================================================');
        console.log(` TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
        console.log('==================================================\n');
        process.exit(failed > 0 ? 1 : 0);
    }
}

runTests();
