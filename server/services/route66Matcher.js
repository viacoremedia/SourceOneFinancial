const XLSX = require('xlsx');
const path = require('path');
const DealerLocation = require('../models/DealerLocation');

function cleanName(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\b(rv|rvs|inc|llc|co|corp|center|centre|sales|service|group|dealership|dealers|motors|auto|marine|outdoors)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanDigits(str) {
    if (!str) return '';
    return String(str).replace(/\D/g, '');
}

async function matchRoute66Dealers() {
    const filePath = path.join(__dirname, '../../2026 ROUTE 66 Dealer List.xlsx');
    console.log('[Route66Matcher] Loading file:', filePath);

    const wb = XLSX.readFile(filePath);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Read raw 2D array
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    console.log(`[Route66Matcher] Loaded ${rawRows.length} raw rows from Excel`);

    // Row 0 is Title, Row 1 is Headers, Row 2+ are Dealers
    // Header columns: [0: DEALERSHIP, 1: FIRST, 2: LAST, 3: ADDRESS, 4: CITY, 5: STATE, 6: ZIP CODE, 7: PHONE]
    const titleRow = rawRows[0] || [];
    const headerRow = ['DEALERSHIP', 'FIRST', 'LAST', 'ADDRESS', 'CITY', 'STATE', 'ZIP CODE', 'PHONE', 'Signed with S1?', 'S1 Dealer ID', 'Matched S1 Name', 'Match Method'];

    // Fetch all active/signed S1 dealers from MongoDB
    const s1Dealers = await DealerLocation.find({}).select('_id dealerId clientDealerId dealerName dealerCity dealerState statePrefix dealerZip dealerPostalCode dealerPhoneNumber systemStatus').lean();
    console.log(`[Route66Matcher] Loaded ${s1Dealers.length} S1 dealers from MongoDB`);

    // Index S1 dealers for fast multi-pass matching
    const s1ByPhone = new Map();
    const s1ByZip = new Map();
    const s1ByState = new Map();

    for (const d of s1Dealers) {
        const state = (d.statePrefix || d.dealerState || '').toUpperCase().trim();
        if (state) {
            if (!s1ByState.has(state)) s1ByState.set(state, []);
            s1ByState.get(state).push(d);
        }

        const zip = cleanDigits(d.dealerPostalCode || d.dealerZip || '').slice(0, 5);
        if (zip && zip.length === 5) {
            if (!s1ByZip.has(zip)) s1ByZip.set(zip, []);
            s1ByZip.get(zip).push(d);
        }

        const phone = cleanDigits(d.dealerPhoneNumber);
        if (phone && phone.length >= 10) {
            s1ByPhone.set(phone.slice(-10), d);
        }
    }

    let matchCount = 0;
    const outputRows = [
        headerRow // Clean header row at row 0
    ];
    const matchResults = [];

    // Process each dealer row (starting at index 2 of original sheet, or if index 1 was header)
    const dataStartIdx = (rawRows[1] && String(rawRows[1][0]).toUpperCase().includes('DEALERSHIP')) ? 2 : 1;

    for (let i = dataStartIdx; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !row[0] || String(row[0]).trim() === '' || String(row[0]).toUpperCase().includes('DEALERSHIP')) {
            continue;
        }

        const dealership = String(row[0] || '').trim();
        const firstName = String(row[1] || '').trim();
        const lastName = String(row[2] || '').trim();
        const address = String(row[3] || '').trim();
        const city = String(row[4] || '').trim();
        const state = String(row[5] || '').toUpperCase().trim();
        const rawZip = String(row[6] || '').trim();
        const zip = cleanDigits(rawZip).padStart(5, '0').slice(0, 5);
        const phone = cleanDigits(row[7]).slice(-10);

        const cleanRName = cleanName(dealership);
        const rTokens = cleanRName.split(' ').filter(t => t.length > 2);

        let matched = null;
        let matchReason = '';

        // Pass 1: Phone match
        if (phone && s1ByPhone.has(phone)) {
            matched = s1ByPhone.get(phone);
            matchReason = 'Phone Match';
        }

        // Pass 2: Zip code + name token overlap
        if (!matched && zip && s1ByZip.has(zip)) {
            const candidates = s1ByZip.get(zip);
            for (const cand of candidates) {
                const candClean = cleanName(cand.dealerName);
                if (candClean === cleanRName || rTokens.some(t => candClean.includes(t))) {
                    matched = cand;
                    matchReason = 'Zip Code + Name Match';
                    break;
                }
            }
            if (!matched && candidates.length === 1) {
                matched = candidates[0];
                matchReason = 'Unique Zip Match';
            }
        }

        // Pass 3: State + City / Name Token Match
        const stateCandidates = (state && s1ByState.has(state)) ? s1ByState.get(state) : [];
        if (!matched && stateCandidates.length > 0) {
            for (const cand of stateCandidates) {
                const candClean = cleanName(cand.dealerName);
                if (candClean === cleanRName) {
                    matched = cand;
                    matchReason = 'State + Exact Clean Name';
                    break;
                }
            }

            if (!matched && rTokens.length > 0) {
                for (const cand of stateCandidates) {
                    const candClean = cleanName(cand.dealerName);
                    const candTokens = candClean.split(' ').filter(t => t.length > 2);
                    const candCity = (cand.dealerCity || '').toLowerCase().trim();

                    const tokenMatches = rTokens.filter(t => candTokens.includes(t));
                    const cityMatch = city && candCity && (candCity.includes(city.toLowerCase()) || city.toLowerCase().includes(candCity));

                    if (tokenMatches.length >= 2 || (tokenMatches.length >= 1 && cityMatch)) {
                        matched = cand;
                        matchReason = cityMatch ? 'State + City + Token Match' : 'State + Multi-Token Match';
                        break;
                    }
                }
            }
        }

        // Pass 4: Fallback across all dealers for exact name match
        if (!matched && cleanRName.length > 4) {
            for (const cand of s1Dealers) {
                const candClean = cleanName(cand.dealerName);
                if (candClean === cleanRName) {
                    matched = cand;
                    matchReason = 'National Exact Name Match';
                    break;
                }
            }
        }

        if (matched) {
            matchCount++;
        }

        const isSigned = Boolean(matched);
        const s1Id = matched ? (matched.clientDealerId || matched.dealerId || '') : '';
        const s1Name = matched ? matched.dealerName : '';
        const s1Status = matched ? (matched.systemStatus || 'active') : '';

        // Push row to output spreadsheet
        outputRows.push([
            dealership, firstName, lastName, address, city, state, rawZip,
            String(row[7] || ''),
            isSigned ? 'Yes' : 'No',
            s1Id,
            s1Name,
            matchReason || ''
        ]);

        // Push to results array for summary
        matchResults.push({
            dealership,
            city,
            state,
            zip,
            signed: isSigned ? 'Yes' : 'No',
            s1Id,
            s1Name,
            matchReason: matchReason || 'No Match'
        });
    }

    // Write results to a SEPARATE file — never overwrite the original
    const newWs = XLSX.utils.aoa_to_sheet(outputRows);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, 'Route 66 Matched');

    const matchedCopyPath = path.join(__dirname, '../../2026 ROUTE 66 Dealer List (Matched).xlsx');
    XLSX.writeFile(newWb, matchedCopyPath);

    console.log(`[Route66Matcher] Complete: ${matchCount}/${matchResults.length} dealers matched with S1.`);

    return {
        success: true,
        totalRoute66Dealers: matchResults.length,
        signedCount: matchCount,
        notSignedCount: matchResults.length - matchCount,
        matchRate: `${((matchCount / matchResults.length) * 100).toFixed(1)}%`,
        filePath,
        matchedCopyPath,
        samples: matchResults.filter(r => r.signed === 'Yes').slice(0, 20),
        unmatchedSamples: matchResults.filter(r => r.signed === 'No').slice(0, 5)
    };
}

module.exports = { matchRoute66Dealers };
