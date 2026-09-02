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

    return await res.json();
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

module.exports = {
    getSyncStatus,
    callBadgerApi,
    parseBadgerCustomer,
    syncSingleDealerFromBadger,
    syncAllDealersFromBadger
};
