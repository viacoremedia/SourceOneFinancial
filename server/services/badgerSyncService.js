/**
 * Badger Maps Sync Service
 * 
 * Synchronizes dealer contacts, accounts, phone numbers, emails,
 * rep visit notes, and geolocations from Badger Maps API into Source One.
 * 
 * @module services/badgerSyncService
 */

const mongoose = require('mongoose');
const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const DealerCommunication = require('../models/DealerCommunication');
const BadgerUpdateLog = require('../models/BadgerUpdateLog');
const { resolveRepName } = require('../config/repConfig');

const BADGER_BASE_URL = 'https://badgerapis.badgermapping.com/api/2';

// Global state for progress tracking in Admin UI
const syncState = {
    isRunning: false,
    startedAt: null,
    completedAt: null,
    total: 0,
    processed: 0,
    matched: 0,
    updated: 0,
    errors: [],
    lastStatus: 'idle', // 'idle' | 'running' | 'completed' | 'error'
    message: ''
};

/**
 * Get the current Badger Maps sync state
 */
function getSyncStatus() {
    return { ...syncState };
}

/**
 * Fetch with Authorization header
 */
async function callBadgerApi(endpoint, options = {}) {
    const apiKey = process.env.BADGER_API_KEY || 'fb0874e8859697594ab751f04cf263453310d3e1';
    const url = endpoint.startsWith('http') ? endpoint : `${BADGER_BASE_URL}${endpoint}`;

    const headers = {
        'Authorization': `Token ${apiKey}`,
        'Accept': 'application/json',
        ...options.headers
    };

    const res = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
        throw new Error(`Badger API error: HTTP ${res.status} ${res.statusText} for ${url}`);
    }

    if (res.status === 204 || res.headers.get('content-length') === '0') {
        return { success: true };
    }

    const text = await res.text();
    return text ? JSON.parse(text) : { success: true };
}

/**
 * Parse and normalize a Badger customer record into contact roster and dealer fields
 */
function parseBadgerCustomer(customer) {
    if (!customer) return null;

    // 1. Extract Client Dealer ID (e.g. "WI113", "OK116", "AZ219")
    let clientDealerId = (customer.custom_text2 || '').trim().toUpperCase();

    // Fallback regex match if custom_text2 is empty: e.g. "Name - AZ219 - 281557" or "Name (TX400)"
    if (!clientDealerId && customer.last_name) {
        const idMatch = customer.last_name.match(/[\s\-_(]([A-Z]{2,4}\d{2,4})[\s\-_)]/i)
            || customer.last_name.match(/[\s\-_]([A-Z]{2,4}\d{2,4})$/i);
        if (idMatch) {
            clientDealerId = idMatch[1].toUpperCase();
        }
    }

    // 2. Extract OMNI Dealer ID
    const omniDealerId = (customer.customer_id || customer.custom_text || '').trim();

    // Helper to format phone numbers nicely
    const formatPhoneNumber = (str) => {
        if (!str) return '';
        const digits = str.replace(/\D/g, '');
        if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        } else if (digits.length === 11 && digits.startsWith('1')) {
            return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
        }
        return str.trim();
    };

    // Helper to process contact trios from Badger custom_text fields
    const extractContact = (nameRaw, field2Raw, field3Raw, isPrimary = false) => {
        const name = (nameRaw || '').trim();
        const f2 = (field2Raw || '').trim();
        const f3 = (field3Raw || '').trim();

        if (!name && !f2 && !f3) return null;

        let title = '';
        let phone = '';
        let email = '';

        const inspectField = (val) => {
            if (!val) return;
            const v = val.trim();
            if (v.includes('@')) {
                email = v;
            } else if ((v.match(/\d/g) || []).length >= 7 && /^[\d\s\(\)\-\.\+extEXT#]+$/.test(v)) {
                phone = formatPhoneNumber(v);
            } else {
                title = v;
            }
        };

        inspectField(f2);
        inspectField(f3);

        return {
            name: name || (title ? title : 'Contact'),
            title: title || (isPrimary ? 'Primary' : 'Representative'),
            phone,
            email,
            isPrimary
        };
    };

    // 3. Extract Contacts
    const contacts = [];

    // Main / Primary Contact
    if (customer.email || customer.phone_number) {
        contacts.push({
            name: 'Dealership Main',
            title: 'Primary',
            phone: formatPhoneNumber(customer.phone_number),
            email: customer.email || '',
            isPrimary: true
        });
    }

    // Custom Contacts 1 through 4
    const c1 = extractContact(customer.custom_text19, customer.custom_text20, customer.custom_text21, contacts.length === 0);
    if (c1) contacts.push(c1);

    const c2 = extractContact(customer.custom_text22, customer.custom_text23, customer.custom_text24, false);
    if (c2) contacts.push(c2);

    const c3 = extractContact(customer.custom_text25, customer.custom_text26, customer.custom_text27, false);
    if (c3) contacts.push(c3);

    const c4 = extractContact(customer.custom_text28, customer.custom_text29, customer.custom_text30, false);
    if (c4) contacts.push(c4);

    // 4. Geolocation coordinates
    const loc = customer.locations && customer.locations.length > 0 ? customer.locations[0] : null;
    const lat = loc?.lat || null;
    const lng = loc?.long || null;

    // 5. Badger data payload
    const badgerData = {
        badgerId: customer.id,
        accountOwner: customer.account_owner || customer.custom_text5 || null,
        notes: customer.notes || null,
        lastCheckinDate: customer.last_checkin_date ? new Date(customer.last_checkin_date) : null,
        daysSinceLastCheckin: typeof customer.days_since_last_checkin === 'number' ? customer.days_since_last_checkin : null,
        lastSyncedAt: new Date()
    };

    return {
        clientDealerId,
        omniDealerId,
        dealerName: customer.full_name || customer.last_name,
        phone: customer.phone_number || null,
        email: customer.email || null,
        address: customer.original_address || null,
        contacts,
        latitude: lat,
        longitude: lng,
        badgerData
    };
}

/**
 * Fetch and sync a single dealer's information from Badger Maps on-demand
 * 
 * @param {string} dealerId - Client Dealer ID (e.g. "WI113") or MongoDB ObjectId
 * @returns {Promise<Object>} Updated dealer with contacts
 */
async function syncSingleDealerFromBadger(dealerId) {
    if (!dealerId) throw new Error('Dealer ID is required');
    const rawId = dealerId.trim();

    // 1. Resolve DealerLocation from MongoDB first
    let locDoc = null;
    if (mongoose.Types.ObjectId.isValid(rawId)) {
        locDoc = await DealerLocation.findById(rawId).lean();
    }
    if (!locDoc) {
        locDoc = await DealerLocation.findOne({
            $or: [
                { clientDealerId: rawId.toUpperCase() },
                { dealerId: rawId.toUpperCase() },
                { clientDealerId: rawId },
                { dealerId: rawId }
            ]
        }).lean();
    }

    const candidateCode = (locDoc?.clientDealerId || locDoc?.dealerId || rawId).toUpperCase();
    const cleanDealerName = (locDoc?.dealerName || '').toUpperCase().replace(/-[A-Z0-9]+$/i, '').trim();

    // 2. Fetch customer list from Badger to find matching customer ID
    const customerList = await callBadgerApi('/customers/');
    let matchedCustomerSummary = null;
    let matchMethod = 'None';

    // Check stored badgerId first
    if (locDoc?.badgerData?.badgerId) {
        matchedCustomerSummary = { id: locDoc.badgerData.badgerId, last_name: locDoc.badgerData.accountName || '' };
        matchMethod = `Stored Badger ID #${locDoc.badgerData.badgerId}`;
    }

    // Match by dealer code
    if (!matchedCustomerSummary) {
        for (const c of customerList) {
            const name = (c.last_name || '').toUpperCase();
            if (name.includes(`-${candidateCode}`) || 
                name.includes(` ${candidateCode} `) || 
                name.includes(`(${candidateCode})`) || 
                name.endsWith(`-${candidateCode}`) ||
                name.endsWith(` ${candidateCode}`)
            ) {
                matchedCustomerSummary = c;
                matchMethod = `Dealer code match: ${candidateCode}`;
                break;
            }
        }
    }

    // Match by dealer name similarity
    if (!matchedCustomerSummary && cleanDealerName.length > 3) {
        for (const c of customerList) {
            const name = (c.last_name || '').toUpperCase();
            if (name.includes(cleanDealerName) || (name.length > 3 && cleanDealerName.includes(name.replace(/-[A-Z0-9]+$/i, '').trim()))) {
                matchedCustomerSummary = c;
                matchMethod = `Name match: "${c.last_name || c.full_name}"`;
                break;
            }
        }
    }

    if (!matchedCustomerSummary) {
        throw new Error(`Dealer "${locDoc?.dealerName || candidateCode}" not found in Badger Maps`);
    }

    // 3. Fetch full customer detail
    const customerDetail = await callBadgerApi(`/customers/${matchedCustomerSummary.id}/`);
    const parsed = parseBadgerCustomer(customerDetail);

    const badgerAccountName = customerDetail.full_name || customerDetail.last_name || matchedCustomerSummary.last_name || '';

    // Attach match audit info
    parsed.badgerData.accountName = badgerAccountName;
    parsed.badgerData.matchedCode = candidateCode;
    parsed.badgerData.matchMethod = matchMethod;

    // 4. Update DealerLocation
    const updateFields = {
        'badgerData': parsed.badgerData,
        'contacts': parsed.contacts,
    };

    if (parsed.phone) updateFields.dealerPhoneNumber = parsed.phone;
    if (parsed.latitude) updateFields.latitude = parsed.latitude;
    if (parsed.longitude) updateFields.longitude = parsed.longitude;

    const matchQuery = locDoc?._id
        ? { _id: locDoc._id }
        : { $or: [{ dealerId: candidateCode }, { clientDealerId: candidateCode }] };

    const updatedLoc = await DealerLocation.findOneAndUpdate(
        matchQuery,
        { $set: updateFields },
        { returnDocument: 'after' }
    );

    // 5. Update DealerProfile
    await DealerProfile.findOneAndUpdate(
        { $or: [{ clientDealerId: candidateCode }, ...(updatedLoc ? [{ dealerLocation: updatedLoc._id }] : [])] },
        {
            $set: {
                badgerData: parsed.badgerData,
                contacts: parsed.contacts
            }
        }
    );

    return {
        dealerId: candidateCode,
        dealerName: updatedLoc?.dealerName || locDoc?.dealerName,
        badgerId: matchedCustomerSummary.id,
        badgerAccountName,
        matchMethod,
        matchedCode: candidateCode,
        contacts: parsed.contacts,
        phone: parsed.phone,
        email: parsed.email,
        badgerData: parsed.badgerData
    };
}

/**
 * Background / Network-wide sync of all Badger Maps accounts into MongoDB
 * 
 * @param {Object} options
 * @param {Function} [options.onProgress]
 * @param {number} [options.concurrency=8]
 */
async function syncAllDealersFromBadger({ onProgress = null, concurrency = 8 } = {}) {
    if (syncState.isRunning) {
        return { message: 'Sync already in progress', status: syncState };
    }

    syncState.isRunning = true;
    syncState.startedAt = new Date();
    syncState.completedAt = null;
    syncState.processed = 0;
    syncState.matched = 0;
    syncState.updated = 0;
    syncState.errors = [];
    syncState.lastStatus = 'running';
    syncState.message = 'Fetching customer list from Badger Maps...';

    try {
        // 1. Fetch entire customer index
        const customerList = await callBadgerApi('/customers/');
        syncState.total = customerList.length;
        syncState.message = `Loaded ${customerList.length} accounts from Badger Maps. Processing details...`;

        // 2. Build map of existing DealerLocations for quick matching
        const allLocations = await DealerLocation.find({}).select('_id dealerId clientDealerId dealerName').lean();
        const locMapByDealerId = new Map();
        for (const loc of allLocations) {
            if (loc.dealerId) locMapByDealerId.set(loc.dealerId.toUpperCase(), loc);
            if (loc.clientDealerId) locMapByDealerId.set(loc.clientDealerId.toUpperCase(), loc);
        }

        // 3. Process in batches with concurrency
        const queue = [...customerList];

        async function worker() {
            while (queue.length > 0) {
                const item = queue.shift();
                if (!item) break;

                try {
                    // Fetch full detail for each customer
                    const detail = await callBadgerApi(`/customers/${item.id}/`);
                    const parsed = parseBadgerCustomer(detail);

                    if (parsed && parsed.clientDealerId && locMapByDealerId.has(parsed.clientDealerId)) {
                        const targetLoc = locMapByDealerId.get(parsed.clientDealerId);
                        syncState.matched++;

                        const updateLoc = {
                            badgerData: parsed.badgerData,
                            contacts: parsed.contacts,
                        };
                        if (parsed.phone) updateLoc.dealerPhoneNumber = parsed.phone;
                        if (parsed.latitude) updateLoc.latitude = parsed.latitude;
                        if (parsed.longitude) updateLoc.longitude = parsed.longitude;

                        await DealerLocation.updateOne(
                            { _id: targetLoc._id },
                            { $set: updateLoc }
                        );

                        await DealerProfile.updateOne(
                            { dealerLocation: targetLoc._id },
                            {
                                $set: {
                                    badgerData: parsed.badgerData,
                                    contacts: parsed.contacts
                                }
                            }
                        );

                        syncState.updated++;
                    }
                } catch (err) {
                    syncState.errors.push({ id: item.id, error: err.message });
                } finally {
                    syncState.processed++;
                    if (onProgress && syncState.processed % 50 === 0) {
                        onProgress({ ...syncState });
                    }
                }
            }
        }

        const workers = Array.from({ length: concurrency }, () => worker());
        await Promise.all(workers);

        syncState.isRunning = false;
        syncState.completedAt = new Date();
        syncState.lastStatus = 'completed';
        syncState.message = `Sync completed! Processed ${syncState.processed} accounts. Matched & updated ${syncState.updated} dealers.`;

        if (onProgress) onProgress({ ...syncState });
        return { success: true, status: syncState };

    } catch (err) {
        syncState.isRunning = false;
        syncState.lastStatus = 'error';
        syncState.message = `Sync error: ${err.message}`;
        throw err;
    }
}

/**
 * Helper to resolve DealerLocation and Badger Customer ID from dealerId
 */
async function resolveDealerAndBadgerCustomer(dealerId) {
    if (!dealerId) throw new Error('Dealer ID is required');
    const rawId = String(dealerId).trim();

    // 1. Resolve DealerLocation from MongoDB first
    let locDoc = null;
    if (mongoose.Types.ObjectId.isValid(rawId)) {
        locDoc = await DealerLocation.findById(rawId).lean();
    }
    if (!locDoc) {
        locDoc = await DealerLocation.findOne({
            $or: [
                { clientDealerId: rawId.toUpperCase() },
                { dealerId: rawId.toUpperCase() },
                { clientDealerId: rawId },
                { dealerId: rawId }
            ]
        }).lean();
    }

    const candidateCode = (locDoc?.clientDealerId || locDoc?.dealerId || rawId).toUpperCase();
    const cleanDealerName = (locDoc?.dealerName || '').toUpperCase().replace(/-[A-Z0-9]+$/i, '').trim();

    // 2. Resolve Badger Customer ID
    let badgerId = locDoc?.badgerData?.badgerId;
    let accountName = locDoc?.badgerData?.accountName || locDoc?.dealerName || '';

    if (!badgerId) {
        // Fetch customer list from Badger to match
        const customerList = await callBadgerApi('/customers/');
        let matchedCustomerSummary = null;

        // Match by dealer code
        for (const c of customerList) {
            const name = (c.last_name || '').toUpperCase();
            if (name.includes(`-${candidateCode}`) || 
                name.includes(` ${candidateCode} `) || 
                name.includes(`(${candidateCode})`) || 
                name.endsWith(`-${candidateCode}`) ||
                name.endsWith(` ${candidateCode}`)
            ) {
                matchedCustomerSummary = c;
                break;
            }
        }

        // Match by dealer name similarity
        if (!matchedCustomerSummary && cleanDealerName.length > 3) {
            for (const c of customerList) {
                const name = (c.last_name || '').toUpperCase();
                if (name.includes(cleanDealerName) || (name.length > 3 && cleanDealerName.includes(name.replace(/-[A-Z0-9]+$/i, '').trim()))) {
                    matchedCustomerSummary = c;
                    break;
                }
            }
        }

        if (!matchedCustomerSummary) {
            throw new Error(`Dealer "${locDoc?.dealerName || candidateCode}" not found in Badger Maps`);
        }

        badgerId = matchedCustomerSummary.id;
        accountName = matchedCustomerSummary.last_name || matchedCustomerSummary.full_name || accountName;

        if (locDoc?._id) {
            await DealerLocation.updateOne(
                { _id: locDoc._id },
                { $set: { 'badgerData.badgerId': badgerId, 'badgerData.accountName': accountName } }
            );
        }
    }

    return {
        locDoc,
        candidateCode,
        badgerId,
        accountName
    };
}

/**
 * Fetch a dealer's full Badger activity (appointments + notepad) in one call.
 */
async function getDealerBadgerActivity(dealerId) {
    const { locDoc, candidateCode, badgerId } = await resolveDealerAndBadgerCustomer(dealerId);

    const dealerCodes = [
        candidateCode,
        candidateCode.toUpperCase(),
        locDoc?.clientDealerId,
        locDoc?.dealerId
    ].filter(Boolean);

    // Parallel calls: customer detail + live Badger appointments + MongoDB DealerCommunication history
    const [customerDetail, appointmentResults, commDocs, recentLogs] = await Promise.all([
        callBadgerApi(`/customers/${badgerId}/`).catch(err => {
            console.error(`Failed to fetch customer detail for badgerId ${badgerId}:`, err.message);
            return null;
        }),
        callBadgerApi(`/appointments/?customer_id=${badgerId}&ordering=-log_datetime`).catch(err => {
            console.error(`Failed to fetch appointments for badgerId ${badgerId}:`, err.message);
            return [];
        }),
        DealerCommunication.find({
            sourceSystem: 'badger',
            communicationEventDatetime: { $ne: null },
            $or: [
                { internalRelationshipId2: { $in: dealerCodes } },
                { internalRelationshipId2: new RegExp('^' + candidateCode + '$', 'i') }
            ]
        }).sort({ communicationEventDatetime: -1 }).limit(100).lean().catch(err => {
            console.error(`Failed to fetch DealerCommunication records for ${candidateCode}:`, err.message);
            return [];
        }),
        BadgerUpdateLog.find({ dealerId: candidateCode })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean()
            .catch(() => [])
    ]);

    const rawAppointments = Array.isArray(appointmentResults)
        ? appointmentResults
        : (appointmentResults?.results || []);

    // Filter strictly by customer ID to prevent cross-dealer appointment leak
    const filteredBadgerAppointments = rawAppointments.filter(apt => {
        if (!apt || !apt.id) return false;
        if (apt.customer !== undefined && apt.customer !== null) {
            return String(apt.customer) === String(badgerId);
        }
        return true;
    });

    const badgerAppointments = filteredBadgerAppointments.map(apt => {
        const extra = apt.extra_fields || {};
        const rawRep = apt.created_by || apt.created_by_email || apt.user_name || apt.user?.name || apt.user?.email || customerDetail?.account_owner_name || customerDetail?.account_owner || locDoc?.salesRep;
        const userName = resolveRepName(rawRep) || rawRep || 'Sales Rep';
        return {
            id: apt.id,
            logDatetime: apt.log_datetime || apt.date || apt.created_at || new Date().toISOString(),
            userName,
            disposition: extra['Meeting Disposition'] || apt.disposition || '',
            feedback: extra['Dealer Feedback'] || apt.feedback || '',
            notes: extra['Notes'] || apt.notes || ''
        };
    });

    // Map MongoDB DealerCommunication records (automated ingestion history)
    const mongoCheckins = (commDocs || []).map(c => {
        const rawRep = c.communicationUserFullName || c.communicationUserName || locDoc?.salesRep;
        const userName = resolveRepName(rawRep) || rawRep || 'Sales Rep';
        return {
            id: c.sourceCommunicationId || c._id.toString(),
            logDatetime: c.communicationEventDatetime || c.createdAt || new Date().toISOString(),
            userName,
            disposition: c.communicationResult1 || c.communicationType || 'Field Visit',
            feedback: c.communicationFeedback1 || '',
            notes: c.communicationNotes || ''
        };
    });

    // Merge and deduplicate by appointment ID / sourceCommunicationId
    const seenIds = new Set();
    const allAppointments = [];

    for (const apt of badgerAppointments) {
        const key = String(apt.id);
        if (!seenIds.has(key)) {
            seenIds.add(key);
            allAppointments.push(apt);
        }
    }

    for (const comm of mongoCheckins) {
        const key = String(comm.id);
        if (!seenIds.has(key)) {
            seenIds.add(key);
            allAppointments.push(comm);
        }
    }

    // Sort descending by date (newest first)
    allAppointments.sort((a, b) => {
        const dateA = new Date(a.logDatetime).getTime() || 0;
        const dateB = new Date(b.logDatetime).getTime() || 0;
        return dateB - dateA;
    });

    return {
        dealerId: candidateCode,
        dealerName: locDoc?.dealerName || customerDetail?.last_name || customerDetail?.full_name || candidateCode,
        badgerId,
        accountOwner: customerDetail?.account_owner_name || customerDetail?.account_owner || '',
        notepad: customerDetail?.notes || '',
        appointments: allAppointments,
        recentLogs
    };
}

/**
 * Append a timestamped entry to the dealer's Badger Notepad.
 */
async function updateDealerBadgerNotepad(dealerId, { noteText }, user) {
    if (!noteText || !noteText.trim()) {
        throw new Error('noteText is required');
    }
    const { locDoc, candidateCode, badgerId } = await resolveDealerAndBadgerCustomer(dealerId);

    // Fetch current notes
    const customerDetail = await callBadgerApi(`/customers/${badgerId}/`);
    const currentNotes = customerDetail?.notes || '';

    const author = user?.name || user?.email || 'Sales Rep';
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const entry = `${author} - ${dateStr} ${timeStr} - ${noteText.trim()}`;
    const cleanCurrent = (currentNotes || '').trim();
    const updatedNotes = cleanCurrent ? `${cleanCurrent}\n\n${entry}` : entry;

    await callBadgerApi(`/customers/${badgerId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: updatedNotes })
    });

    const matchQuery = locDoc?._id
        ? { _id: locDoc._id }
        : { $or: [{ dealerId: candidateCode }, { clientDealerId: candidateCode }] };

    await DealerLocation.findOneAndUpdate(matchQuery, { $set: { 'badgerData.notes': updatedNotes } });
    await DealerProfile.findOneAndUpdate(
        { $or: [{ clientDealerId: candidateCode }, ...(locDoc?._id ? [{ dealerLocation: locDoc._id }] : [])] },
        { $set: { 'badgerData.notes': updatedNotes } }
    );

    // Record audit history log
    let updateLog = null;
    try {
        updateLog = await BadgerUpdateLog.create({
            dealerId: candidateCode,
            dealerLocation: locDoc?._id || null,
            badgerId,
            action: 'notepad_update',
            user: {
                id: user?._id || null,
                name: user?.name || user?.email || 'Sales Rep',
                email: user?.email || null
            },
            payload: {
                previousNotepad: currentNotes,
                updatedNotepad: updatedNotes,
                noteText: noteText.trim()
            }
        });
    } catch (logErr) {
        console.error('Failed to write BadgerUpdateLog for notepad update:', logErr.message);
    }

    return { notepad: updatedNotes, logId: updateLog?._id };
}

/**
 * Log a new field visit — Badger first, MongoDB second.
 */
async function createDealerBadgerCheckin(dealerId, { disposition, feedback, notes }, user) {
    const { locDoc, candidateCode, badgerId } = await resolveDealerAndBadgerCustomer(dealerId);

    // Step 1 — Badger Submission (First)
    const logDatetime = new Date().toISOString();
    const appointment = await callBadgerApi('/appointments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            customer: badgerId,
            log_datetime: logDatetime,
            extra_fields: {
                'Meeting Disposition': disposition,
                'Dealer Feedback': feedback,
                'Notes': notes || ''
            }
        })
    });

    if (!appointment?.id) {
        throw new Error('Badger API did not return an appointment ID — aborting MongoDB write');
    }

    const rawUserName = user?.name || user?.email || locDoc?.salesRep || 'Sales Rep';
    const userName = resolveRepName(rawUserName) || rawUserName;
    const userEmail = user?.email || null;
    const dealerName = locDoc?.dealerName || candidateCode;

    // Step 2 — Idempotent MongoDB Upsert (Second)
    const commDoc = await DealerCommunication.findOneAndUpdate(
        { sourceCommunicationId: String(appointment.id) },
        {
            $set: {
                sourceCommunicationId: String(appointment.id),
                sourceSystem: 'badger',
                communicationType: 'Meeting',
                communicationUserFullName: userName,
                communicationUserEmail: userEmail,
                recipientOrganizationName: dealerName,
                internalRelationshipId1: String(badgerId),
                internalRelationshipId2: candidateCode,
                communicationResult1: disposition,
                communicationFeedback1: feedback,
                communicationNotes: notes || null,
                communicationEventDatetime: new Date(appointment.log_datetime || logDatetime),
                lastIngestionDate: new Date()
            }
        },
        { upsert: true, returnDocument: 'after' }
    );

    // Step 3 — Update Recency Cache
    const now = new Date();
    const matchQuery = locDoc?._id
        ? { _id: locDoc._id }
        : { $or: [{ dealerId: candidateCode }, { clientDealerId: candidateCode }] };

    await DealerLocation.findOneAndUpdate(matchQuery, {
        $set: {
            'badgerData.lastCheckinDate': now,
            'badgerData.daysSinceLastCheckin': 0,
            'badgerData.lastSyncedAt': now
        }
    });

    // Record audit history log
    let updateLog = null;
    try {
        updateLog = await BadgerUpdateLog.create({
            dealerId: candidateCode,
            dealerLocation: locDoc?._id || null,
            badgerId,
            action: 'checkin_create',
            user: {
                id: user?._id || null,
                name: userName,
                email: userEmail
            },
            payload: {
                appointmentId: appointment.id,
                disposition,
                feedback,
                checkinNotes: notes || ''
            }
        });
    } catch (logErr) {
        console.error('Failed to write BadgerUpdateLog for check-in:', logErr.message);
    }

    return {
        appointment: {
            id: appointment.id,
            logDatetime: appointment.log_datetime || logDatetime,
            userName,
            disposition,
            feedback,
            notes: notes || ''
        },
        communicationId: commDoc._id,
        logId: updateLog?._id
    };
}

/**
 * Undo a recent manual Notepad update from Source One
 */
async function undoBadgerNotepadUpdate(dealerId, logId = null, user = null) {
    const { locDoc, candidateCode, badgerId } = await resolveDealerAndBadgerCustomer(dealerId);

    const query = {
        dealerId: candidateCode,
        action: 'notepad_update',
        isUndone: false
    };
    if (logId && mongoose.Types.ObjectId.isValid(logId)) {
        query._id = logId;
    }

    const log = await BadgerUpdateLog.findOne(query).sort({ createdAt: -1 });
    if (!log) {
        throw new Error('No reversible notepad update found for this dealer');
    }

    const previousNotepad = log.payload?.previousNotepad ?? '';

    // Revert in Badger Maps
    await callBadgerApi(`/customers/${badgerId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: previousNotepad })
    });

    // Revert local cache
    const matchQuery = locDoc?._id
        ? { _id: locDoc._id }
        : { $or: [{ dealerId: candidateCode }, { clientDealerId: candidateCode }] };

    await DealerLocation.findOneAndUpdate(matchQuery, { $set: { 'badgerData.notes': previousNotepad } });
    await DealerProfile.findOneAndUpdate(
        { $or: [{ clientDealerId: candidateCode }, ...(locDoc?._id ? [{ dealerLocation: locDoc._id }] : [])] },
        { $set: { 'badgerData.notes': previousNotepad } }
    );

    // Mark log as undone
    log.isUndone = true;
    log.undoneAt = new Date();
    log.undoneBy = {
        name: user?.name || user?.email || 'Sales Rep',
        email: user?.email || null
    };
    await log.save();

    return {
        success: true,
        notepad: previousNotepad,
        undoneLogId: log._id
    };
}

/**
 * Undo / delete a check-in created from Source One
 */
async function undoBadgerCheckin(dealerId, appointmentId, user = null) {
    if (!appointmentId) throw new Error('appointmentId is required');
    const { candidateCode } = await resolveDealerAndBadgerCustomer(dealerId);

    const aptNum = Number(appointmentId);

    // 1. Delete from Badger Maps
    try {
        await callBadgerApi(`/appointments/${aptNum}/`, { method: 'DELETE' });
    } catch (err) {
        console.error(`Warning: Failed to delete appointment #${aptNum} in Badger:`, err.message);
    }

    // 2. Remove DealerCommunication record in MongoDB
    await DealerCommunication.deleteOne({ sourceCommunicationId: String(aptNum) });

    // 3. Mark update log as undone
    const log = await BadgerUpdateLog.findOne({
        dealerId: candidateCode,
        action: 'checkin_create',
        'payload.appointmentId': aptNum,
        isUndone: false
    });

    if (log) {
        log.isUndone = true;
        log.undoneAt = new Date();
        log.undoneBy = {
            name: user?.name || user?.email || 'Sales Rep',
            email: user?.email || null
        };
        await log.save();
    }

    return {
        success: true,
        appointmentId: aptNum,
        message: 'Check-in deleted from Badger Maps & Source One'
    };
}

/**
 * Get recent manual update audit logs for a dealer
 */
async function getDealerBadgerAuditLogs(dealerId) {
    const { candidateCode } = await resolveDealerAndBadgerCustomer(dealerId);
    return await BadgerUpdateLog.find({ dealerId: candidateCode })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
}

module.exports = {
    getSyncStatus,
    callBadgerApi,
    parseBadgerCustomer,
    syncSingleDealerFromBadger,
    syncAllDealersFromBadger,
    getDealerBadgerActivity,
    updateDealerBadgerNotepad,
    createDealerBadgerCheckin,
    undoBadgerNotepadUpdate,
    undoBadgerCheckin,
    getDealerBadgerAuditLogs
};
