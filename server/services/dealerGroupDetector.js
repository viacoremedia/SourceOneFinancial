/**
 * Dealer Group Detector Service
 * 
 * Extracts brand/group names from dealer names and manages the DealerGroup /
 * DealerLocation upsert lifecycle. Groups are only created for brands that have
 * 2+ locations — single-location ("small") dealers get dealerGroup: null.
 * 
 * @module services/dealerGroupDetector
 */

const DealerGroup = require('../models/DealerGroup');
const DealerLocation = require('../models/DealerLocation');

/**
 * Extract the brand/group name from a dealer name by stripping location
 * suffixes, state codes, and dealer IDs.
 * 
 * Real-world examples from the data:
 *   "Blue Compass RV - Charlotte - NC153"     → "BLUE COMPASS RV"
 *   "FUN TOWN RV CONROE -TX400"               → "FUN TOWN RV"
 *   "La Mesa RV Center - San Diego - SCA161"   → "LA MESA RV CENTER"
 *   "CRABTREE RV CENTER INC - AR101"           → "CRABTREE RV CENTER INC"
 *   "Pete's RV Center - Chesapeake - VA113"    → "PETE'S RV CENTER"
 * 
 * @param {string} dealerName - Full dealer name from CSV
 * @param {string} dealerId - Dealer ID (e.g. "TX400")
 * @returns {string} Extracted and normalized brand/group name (uppercased)
 */
function extractGroupName(dealerName, dealerId) {
    if (!dealerName) return '';

    let name = dealerName.trim();

    // 1. Remove the dealer ID suffix (e.g. "- TX400", "-TX400", " -TX400")
    const idEscaped = dealerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idPattern = new RegExp(`\\s*-?\\s*${idEscaped}\\s*$`, 'i');
    name = name.replace(idPattern, '').trim();

    // 2. Split by " - " (the separator between brand, city, state)
    //    Take only the first segment as the brand name
    const parts = name.split(/\s+-\s+/);
    if (parts.length > 1) {
        name = parts[0].trim();
    }

    // 3. Clean up trailing dashes and whitespace
    name = name.replace(/\s*-\s*$/, '').trim();

    // 4. Normalize: uppercase for consistent grouping
    name = name.toUpperCase();

    // 5. Strip common suffixes that vary between locations of the same brand
    //    e.g. "FUN TOWN RV CONROE" vs "FUN TOWN RV HOUSTON LLC"
    //    We strip known city names and business suffixes from the END
    name = name
        .replace(/\s+(LLC|INC\.?|CORP\.?|LTD\.?|CO\.?)\s*$/i, '')
        .trim();

    // 6. Apply known group aliases to prevent re-creating merged duplicates
    return GROUP_ALIASES[name] || name;
}

/**
 * Known duplicate group names mapped to their canonical name.
 * Prevents the detector from re-creating groups we've already merged.
 */
const GROUP_ALIASES = {
    'BLUE COMPASS': 'BLUE COMPASS RV',
    'BOBBY COMBS RV CENTER': 'BOBBY COMBS RV',
    'CAMPERS INN RV': 'CAMPERS INN',
    'GENERAL RV CENTER': 'GENERAL RV',
    'INTERNATIONAL RV,': 'INTERNATIONAL RV WORLD',
    'RV COUNTRY WASHINGTON,': 'RV COUNTRY ARIZONA,',
};

/**
 * Normalize a group name for display (title case).
 * 
 * @param {string} upperName - Uppercased group name
 * @returns {string} Title-cased name for storage
 */
function toDisplayName(upperName) {
    return upperName
        .toLowerCase()
        .replace(/(?:^|\s)\S/g, c => c.toUpperCase())
        .replace(/\bRv\b/g, 'RV')
        .replace(/\bLlc\b/g, 'LLC')
        .replace(/\bInc\b/g, 'Inc')
        .replace(/\b&\b/g, '&');
}

/**
 * Resolve a batch of dealer rows into DealerLocation and DealerGroup documents.
 * 
 * Strategy:
 * 1. Extract group names from all rows (case-normalized)
 * 2. Count how many unique dealer IDs map to each group name
 * 3. Only create DealerGroup docs for names with 2+ locations
 * 4. Upsert all DealerLocation docs (linking to group if applicable)
 * 
 * @param {Object[]} rows - Parsed CSV rows with 'DEALER ID' and 'DEALER NAME' keys
 * @returns {Promise<{ dealerMap: Map, newDealers: number, newGroups: number }>}
 */
async function resolveDealerBatch(rows) {
    const startTime = Date.now();

    // Step 1: Extract group names and build a normalized name → dealerIds mapping
    const groupNameToDealerIds = new Map(); // key = UPPERCASE normalized name
    const dealerIdToRow = new Map();
    const dealerIdToGroupKey = new Map(); // dealerId → uppercase key

    for (const row of rows) {
        const dealerId = (row['DEALER ID'] || '').trim().toUpperCase();
        const dealerName = (row['DEALER NAME'] || '').trim();

        if (!dealerId) continue;

        dealerIdToRow.set(dealerId, { dealerId, dealerName });

        const groupKey = extractGroupName(dealerName, dealerId); // already uppercase
        if (groupKey) {
            dealerIdToGroupKey.set(dealerId, groupKey);
            if (!groupNameToDealerIds.has(groupKey)) {
                groupNameToDealerIds.set(groupKey, new Set());
            }
            groupNameToDealerIds.get(groupKey).add(dealerId);
        }
    }

    // Step 2: Identify which group names have 2+ locations (multi-location brands)
    const multiLocationGroups = new Map();
    for (const [groupKey, dealerIds] of groupNameToDealerIds) {
        if (dealerIds.size >= 2) {
            multiLocationGroups.set(groupKey, dealerIds);
        }
    }

    // Step 3: Upsert DealerGroup docs for multi-location brands only
    let newGroups = 0;
    const groupKeyToDoc = new Map(); // uppercase key → DealerGroup doc

    // Fetch existing groups — match by slug (derived from uppercase name)
    const existingGroups = await DealerGroup.find({}).lean();
    for (const g of existingGroups) {
        groupKeyToDoc.set(g.name.toUpperCase(), g);
    }

    // Create missing groups
    for (const [groupKey, dealerIds] of multiLocationGroups) {
        if (!groupKeyToDoc.has(groupKey)) {
            const displayName = toDisplayName(groupKey);
            const slug = displayName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .replace(/-{2,}/g, '-');
            try {
                const group = await DealerGroup.findOneAndUpdate(
                    { name: displayName },
                    { $set: { name: displayName, slug }, $setOnInsert: { dealerCount: 0 } },
                    { upsert: true, returnDocument: 'after', lean: true }
                );
                groupKeyToDoc.set(groupKey, group);
                newGroups++;
            } catch (err) {
                if (err.code === 11000) {
                    // Could be slug collision — try finding by slug instead
                    const existing = await DealerGroup.findOne({ slug }).lean();
                    if (existing) groupKeyToDoc.set(groupKey, existing);
                } else {
                    throw err;
                }
            }
        }
    }

    // Step 4: Build dealerId → groupId mapping
    const dealerIdToGroupId = new Map();
    for (const [groupKey, dealerIds] of multiLocationGroups) {
        const group = groupKeyToDoc.get(groupKey);
        if (group) {
            for (const dealerId of dealerIds) {
                dealerIdToGroupId.set(dealerId, group._id);
            }
        }
    }

    // Step 5: Upsert all DealerLocation docs
    let newDealers = 0;
    const result = new Map();

    // Fetch existing locations in one query
    const allDealerIds = Array.from(dealerIdToRow.keys());
    const existingLocations = await DealerLocation.find({
        dealerId: { $in: allDealerIds }
    }).lean();
    const existingLocationMap = new Map();
    for (const loc of existingLocations) {
        existingLocationMap.set(loc.dealerId, loc);
    }

    // Process each dealer
    const bulkOps = [];
    for (const [dealerId, rowData] of dealerIdToRow) {
        const groupId = dealerIdToGroupId.get(dealerId) || null;
        const existing = existingLocationMap.get(dealerId);

        if (existing) {
            result.set(dealerId, {
                dealerLocationId: existing._id,
                dealerGroupId: groupId || existing.dealerGroup || null
            });

            // Update group assignment if it changed (new group detected, or group removed)
            if (groupId && String(existing.dealerGroup) !== String(groupId)) {
                bulkOps.push({
                    updateOne: {
                        filter: { dealerId },
                        update: { $set: { dealerGroup: groupId, dealerName: rowData.dealerName } }
                    }
                });
            }
        } else {
            try {
                const location = await DealerLocation.findOneAndUpdate(
                    { dealerId },
                    {
                        $set: {
                            dealerName: rowData.dealerName,
                            dealerGroup: groupId
                        }
                    },
                    { upsert: true, returnDocument: 'after', lean: true }
                );
                result.set(dealerId, {
                    dealerLocationId: location._id,
                    dealerGroupId: groupId
                });
                newDealers++;
            } catch (err) {
                if (err.code === 11000) {
                    const existing = await DealerLocation.findOne({ dealerId }).lean();
                    if (existing) {
                        result.set(dealerId, {
                            dealerLocationId: existing._id,
                            dealerGroupId: existing.dealerGroup || groupId
                        });
                    }
                } else {
                    throw err;
                }
            }
        }
    }

    // Execute bulk updates for existing dealers that got a new group
    if (bulkOps.length > 0) {
        await DealerLocation.bulkWrite(bulkOps, { ordered: false });
    }

    // Step 6: Update dealer counts on groups
    for (const [groupKey, dealerIds] of multiLocationGroups) {
        const group = groupKeyToDoc.get(groupKey);
        if (group) {
            await DealerGroup.updateOne(
                { _id: group._id },
                { $set: { dealerCount: dealerIds.size } }
            );
        }
    }

    console.log(`  dealerGroupDetector: resolved ${result.size} dealers in ${Date.now() - startTime}ms (${newDealers} new dealers, ${newGroups} new groups, ${multiLocationGroups.size} multi-location groups)`);

    return { dealerMap: result, newDealers, newGroups };
}

module.exports = {
    extractGroupName,
    resolveDealerBatch
};
