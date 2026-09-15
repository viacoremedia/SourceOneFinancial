const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const DealerLocation = require('../models/DealerLocation');

const ROOT_DIR = path.join(__dirname, '../../');

const FILE_1 = path.join(ROOT_DIR, 'Boatmart Active Dealers Completed CGPT 08.12.26.xlsx');
const FILE_2 = path.join(ROOT_DIR, 'Boatmart active dealers 8-12-26.xlsx');
const FILE_3 = path.join(ROOT_DIR, 'Trader Interactive Dealer List against Stat Survey Data 08.13.26.csv');

const OUTPUT_FILE = path.join(ROOT_DIR, 'Trader & Boatmart Dealer Lists - S1 Signed Matching.xlsx');

const STOP_WORDS = new Set([
    'rv', 'rvs', 'marine', 'marina', 'marinas', 'boat', 'boats', 'boating',
    'powersports', 'power', 'sports', 'auto', 'automotive', 'yacht', 'yachts',
    'sales', 'service', 'services', 'group', 'dealership', 'dealers', 'dealer',
    'inc', 'llc', 'co', 'corp', 'corporation', 'center', 'centre', 'outdoors',
    'racing', 'enterprises', 'holdings', 'company', 'ltd', 'and', 'the', 'of',
    'north', 'south', 'east', 'west', 'llp', 'motors', 'motor', 'superstore',
    'superstores', 'store', 'stores', 'world', 'depot', 'outlet'
]);

const GENERIC_WORDS = new Set([
    'blue', 'water', 'bend', 'marine', 'action', 'first', 'star', 'sun', 'ocean',
    'lake', 'river', 'bay', 'coast', 'coastal', 'valley', 'mountain', 'eagle',
    'summit', 'premier', 'champion', 'heritage', 'liberty', 'freedom', 'dynamic',
    'elite', 'precision', 'advantage', 'pro', 'express', 'direct', 'national',
    'united', 'american', 'central', 'supreme', 'triumph', 'apex', 'pacific',
    'atlantic', 'southern', 'northern', 'western', 'eastern', 'tri', 'state',
    'all', 'star', 'century', 'falcon', 'crossroads', 'horizon', 'pioneer'
]);

function cleanName(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractCoreBrandTokens(str, city = '', state = '') {
    const cleaned = cleanName(str);
    if (!cleaned) return [];

    const cityWords = new Set(cleanName(city).split(' ').filter(Boolean));
    const stateWord = (state || '').toLowerCase().trim();

    return cleaned.split(' ')
        .filter(t => t.length >= 2)
        .filter(t => !STOP_WORDS.has(t))
        .filter(t => !cityWords.has(t))
        .filter(t => t !== stateWord)
        .filter(t => !/^[a-z]{1,3}\d{2,4}$/.test(t)); // strip dealer IDs like fl118, ok142, mo218
}

function getCoreBrandKey(str, city = '', state = '') {
    return extractCoreBrandTokens(str, city, state).sort().join(' ');
}

function cleanDigits(str) {
    if (!str) return '';
    return String(str).replace(/\D/g, '');
}

function cleanStreet(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\b(suite|ste|unit|bldg|building|apt|floor|fl|p\.?o\.?\s*box|#)\b.*$/g, ' ')
        .replace(/\b(street|st)\b/g, 'st')
        .replace(/\b(road|rd)\b/g, 'rd')
        .replace(/\b(avenue|ave)\b/g, 'ave')
        .replace(/\b(boulevard|blvd)\b/g, 'blvd')
        .replace(/\b(highway|hwy)\b/g, 'hwy')
        .replace(/\b(parkway|pkwy)\b/g, 'pkwy')
        .replace(/\b(drive|dr)\b/g, 'dr')
        .replace(/\b(lane|ln)\b/g, 'ln')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractStreetNumber(str) {
    if (!str) return null;
    const m = String(str).match(/^\s*(\d+)/);
    return m ? m[1] : null;
}

// Build index of S1 dealers
async function loadAndIndexS1Dealers() {
    const s1Dealers = await DealerLocation.find({})
        .select('_id dealerId clientDealerId dealerName dba dealerAddress dealerCity dealerState statePrefix dealerPostalCode dealerPhoneNumber systemStatus isActive')
        .lean();

    console.log(`[TraderBoatmartMatcher] Loaded ${s1Dealers.length} S1 dealers from MongoDB`);

    const s1ByPhone = new Map();
    const s1ByZip = new Map();
    const s1ByState = new Map();
    const s1ByBrandInState = new Map(); // key: `${state}:${brandKey}`
    const s1ByBrandNational = new Map(); // key: brandKey

    for (const d of s1Dealers) {
        const state = (d.statePrefix || d.dealerState || '').toUpperCase().trim();
        const city = (d.dealerCity || '').toLowerCase().trim();

        // Phone index
        const phone = cleanDigits(d.dealerPhoneNumber);
        if (phone && phone.length >= 10) {
            s1ByPhone.set(phone.slice(-10), d);
        }

        // Zip index (5 digits)
        const zip = cleanDigits(d.dealerPostalCode).slice(0, 5);
        if (zip && zip.length === 5) {
            if (!s1ByZip.has(zip)) s1ByZip.set(zip, []);
            s1ByZip.get(zip).push(d);
        }

        // State index
        if (state) {
            if (!s1ByState.has(state)) s1ByState.set(state, []);
            s1ByState.get(state).push(d);
        }

        // Core brand keys (from dealerName and dba)
        const brandKeys = new Set();
        const b1 = getCoreBrandKey(d.dealerName, city, state);
        if (b1) brandKeys.add(b1);
        if (d.dba) {
            const b2 = getCoreBrandKey(d.dba, city, state);
            if (b2) brandKeys.add(b2);
        }

        for (const bk of brandKeys) {
            if (state) {
                const stateKey = `${state}:${bk}`;
                if (!s1ByBrandInState.has(stateKey)) s1ByBrandInState.set(stateKey, []);
                s1ByBrandInState.get(stateKey).push(d);
            }
            if (!s1ByBrandNational.has(bk)) s1ByBrandNational.set(bk, []);
            s1ByBrandNational.get(bk).push(d);
        }
    }

    return { s1Dealers, s1ByPhone, s1ByZip, s1ByState, s1ByBrandInState, s1ByBrandNational };
}

// Strict multi-tier matcher with ZERO false positives
function findMatch(target, indexes) {
    const { s1Dealers, s1ByPhone, s1ByZip, s1ByState, s1ByBrandInState, s1ByBrandNational } = indexes;

    const zip = cleanDigits(target.zip).slice(0, 5);
    const state = (target.state || '').toUpperCase().trim();
    const city = (target.city || '').toLowerCase().trim();
    const address = cleanStreet(target.address);
    const streetNum = extractStreetNumber(target.address);
    const phone = cleanDigits(target.phone).slice(-10);

    // Candidate names
    const rawNames = [target.name, target.dba, target.parentName].filter(Boolean);

    // Extract branch suffix if present, e.g. "BlackBeard Marine - Branson" -> branch = "branson"
    let branchHint = '';
    for (const nm of rawNames) {
        const m = nm.match(/[-–—]\s*([A-Za-z0-9\s]+)$/);
        if (m) {
            const candidate = cleanName(m[1]);
            // check if candidate looks like a city/location
            if (candidate && !STOP_WORDS.has(candidate)) {
                branchHint = candidate;
                break;
            }
        }
    }

    // Pass 1: Phone match (Highest confidence - 100%)
    if (phone && phone.length === 10 && s1ByPhone.has(phone)) {
        return { matched: s1ByPhone.get(phone), method: 'Phone Match' };
    }

    // Collect all brand token variations
    const brandTokenSets = rawNames.map(nm => extractCoreBrandTokens(nm, city || branchHint, state)).filter(tokens => tokens.length > 0);
    if (brandTokenSets.length === 0) {
        return { matched: null, method: 'No Match' };
    }

    // Helper: Checks if two token arrays have an authentic brand match
    function areBrandTokensMatching(tTokens, candTokens) {
        if (!tTokens.length || !candTokens.length) return false;
        // Check exact match
        if (tTokens.join(' ') === candTokens.join(' ')) return true;
        // If single token, must be identical and not generic
        if (tTokens.length === 1 && candTokens.length === 1) {
            return tTokens[0] === candTokens[0] && !GENERIC_WORDS.has(tTokens[0]);
        }
        // If multiple tokens, at least 2 tokens must match
        const intersection = tTokens.filter(t => candTokens.includes(t));
        return intersection.length >= 2 || (intersection.length === 1 && tTokens.length === 1 && candTokens.length <= 2 && !GENERIC_WORDS.has(intersection[0]));
    }

    // Pass 2: Zip Code Match (Zip must match AND brand tokens must match)
    if (zip && zip.length === 5 && s1ByZip.has(zip)) {
        const candidates = s1ByZip.get(zip);
        for (const cand of candidates) {
            const candCity = (cand.dealerCity || '').toLowerCase().trim();
            const candTokens = extractCoreBrandTokens(cand.dealerName, candCity, cand.statePrefix);
            const candDbaTokens = cand.dba ? extractCoreBrandTokens(cand.dba, candCity, cand.statePrefix) : [];

            for (const tTokens of brandTokenSets) {
                if (areBrandTokensMatching(tTokens, candTokens) || areBrandTokensMatching(tTokens, candDbaTokens)) {
                    return { matched: cand, method: 'Zip Code + Brand Match' };
                }

                // If street number matches AND at least 1 brand token matches
                if (streetNum && extractStreetNumber(cand.dealerAddress) === streetNum) {
                    const hasTokenOverlap = tTokens.some(t => candTokens.includes(t) || candDbaTokens.includes(t));
                    if (hasTokenOverlap) {
                        return { matched: cand, method: 'Zip Code + Street Address Match' };
                    }
                }
            }
        }
    }

    // Pass 3: State + City + Brand Match
    // If state and city are provided, candidate MUST be in that state AND city
    if (state && s1ByState.has(state)) {
        const stateCandidates = s1ByState.get(state);

        if (city) {
            const cityCandidates = stateCandidates.filter(c => {
                const cCity = (c.dealerCity || '').toLowerCase().trim();
                return cCity && (cCity === city || cCity.includes(city) || city.includes(cCity));
            });

            for (const cand of cityCandidates) {
                const candCity = (cand.dealerCity || '').toLowerCase().trim();
                const candTokens = extractCoreBrandTokens(cand.dealerName, candCity, cand.statePrefix);
                const candDbaTokens = cand.dba ? extractCoreBrandTokens(cand.dba, candCity, cand.statePrefix) : [];

                for (const tTokens of brandTokenSets) {
                    if (areBrandTokensMatching(tTokens, candTokens) || areBrandTokensMatching(tTokens, candDbaTokens)) {
                        return { matched: cand, method: 'State + City + Brand Match' };
                    }

                    // If street number matches AND street name matches AND brand not conflicting
                    if (streetNum && extractStreetNumber(cand.dealerAddress) === streetNum) {
                        const candAddr = cleanStreet(cand.dealerAddress);
                        if (address && (candAddr.includes(address) || address.includes(candAddr))) {
                            if (tTokens.some(t => candTokens.includes(t) || candDbaTokens.includes(t))) {
                                return { matched: cand, method: 'State + City + Address Match' };
                            }
                        }
                    }
                }
            }
        }

        // Pass 4: State + Exact Brand Match
        // STRICT RULE: If target specified a city (e.g. "Ocala" or "Punta Gorda") and the S1 dealer is in a completely different city (e.g. "Pinellas Park"),
        // DO NOT match because that rooftop is NOT enrolled in S1!
        for (const tTokens of brandTokenSets) {
            const brandKey = tTokens.sort().join(' ');
            const stateKey = `${state}:${brandKey}`;
            if (s1ByBrandInState.has(stateKey)) {
                const matches = s1ByBrandInState.get(stateKey);

                // If branch hint matches S1 dealer city or name
                if (branchHint) {
                    const branchMatch = matches.find(m => {
                        const mCity = (m.dealerCity || '').toLowerCase();
                        const mName = cleanName(m.dealerName);
                        return mCity.includes(branchHint) || mName.includes(branchHint);
                    });
                    if (branchMatch) return { matched: branchMatch, method: 'State + Branch Name Match' };
                }

                // If target city is specified, ONLY match if S1 dealer city matches target city!
                if (city) {
                    const cityMatch = matches.find(m => {
                        const mCity = (m.dealerCity || '').toLowerCase();
                        return mCity === city || mCity.includes(city) || city.includes(mCity);
                    });
                    if (cityMatch) return { matched: cityMatch, method: 'State + City + Exact Brand' };
                    // If no city match in this state, rooftop is NOT enrolled -> return No Match
                } else if (matches.length === 1 && !GENERIC_WORDS.has(brandKey)) {
                    // Target has NO city specified, and exactly 1 dealer of this brand in the state
                    return { matched: matches[0], method: 'State + Unique Brand Match' };
                }
            }
        }
    }

    // Pass 5: National Brand Match with Branch Location Hint
    // (e.g. "BlackBeard Marine - Branson" -> matches "Blackbeard Marine Branson-MO218" in Branson West, MO)
    if (branchHint) {
        for (const tTokens of brandTokenSets) {
            const brandKey = tTokens.sort().join(' ');
            if (s1ByBrandNational.has(brandKey)) {
                const matches = s1ByBrandNational.get(brandKey);
                const branchMatch = matches.find(m => {
                    const mCity = (m.dealerCity || '').toLowerCase();
                    const mName = cleanName(m.dealerName);
                    return mCity.includes(branchHint) || mName.includes(branchHint);
                });
                if (branchMatch) {
                    return { matched: branchMatch, method: 'National Brand + Branch Match' };
                }
            }
        }
    }

    // Pass 6: Pure National Brand Match (VERY CONSERVATIVE)
    // ONLY allowed if target has NO city, NO state, NO address, NO branch specified,
    // AND brand is unique across entire nation, AND contains ZERO generic words!
    if (!state && !city && !address && !branchHint) {
        for (const tTokens of brandTokenSets) {
            // Reject if any token is a generic word (e.g. blue, water, lake, sun, etc.)
            if (tTokens.some(t => GENERIC_WORDS.has(t))) continue;

            if (tTokens.length >= 2 || (tTokens.length === 1 && tTokens[0].length >= 8)) {
                const brandKey = tTokens.sort().join(' ');
                if (!GENERIC_WORDS.has(brandKey) && s1ByBrandNational.has(brandKey)) {
                    const matches = s1ByBrandNational.get(brandKey);
                    if (matches.length === 1) {
                        return { matched: matches[0], method: 'National Unique Brand Match' };
                    }
                }
            }
        }
    }

    return { matched: null, method: 'No Match' };
}

async function processAllFiles() {
    console.log('[TraderBoatmartMatcher] Starting comprehensive matching...');
    const indexes = await loadAndIndexS1Dealers();

    const outputWb = XLSX.utils.book_new();
    const resultsSummary = {};

    // ─────────────────────────────────────────────────────────
    // TAB 1: Boatmart Active Dealers Completed CGPT
    // ─────────────────────────────────────────────────────────
    console.log('[TraderBoatmartMatcher] Processing File 1: Boatmart Active Dealers Completed CGPT...');
    const wb1 = XLSX.readFile(FILE_1);
    const ws1 = wb1.Sheets[wb1.SheetNames[0]];
    const rows1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });

    // Rows 0 is empty padding, Row 1 is header
    const header1 = [...(rows1[1] || [])];
    // Add new columns
    const addedCols = [
        'Signed with S1?',
        'S1 Dealer ID',
        'Matched S1 Name',
        'S1 City',
        'S1 State',
        'S1 Status',
        'Match Method'
    ];
    const outHeader1 = [...header1, ...addedCols];

    const outRows1 = [
        rows1[0] || [], // original title/padding row
        outHeader1
    ];

    let matchCount1 = 0;
    let totalDataRows1 = 0;

    // We build a map of Account Name -> matched S1 result from File 1 so File 2 can also use it
    const accountNameToMatchMap = new Map();

    for (let i = 2; i < rows1.length; i++) {
        const row = rows1[i];
        if (!row || row.length === 0 || (!row[1] && !row[6])) continue;
        totalDataRows1++;

        const accountName = String(row[1] || '').trim();
        const parentName = String(row[3] || '').trim();
        const dba = String(row[6] || '').trim();
        const address = String(row[7] || '').trim();
        const city = String(row[8] || '').trim();
        const state = String(row[9] || '').trim();
        const zip = String(row[10] || '').trim();

        const target = {
            name: dba || accountName,
            parentName,
            dba,
            address,
            city,
            state,
            zip,
            phone: ''
        };

        const { matched, method } = findMatch(target, indexes);

        if (matched) {
            matchCount1++;
            accountNameToMatchMap.set(accountName.toLowerCase(), { matched, method });
        }

        const isSigned = Boolean(matched);
        const s1Id = matched ? (matched.clientDealerId || matched.dealerId || '') : '';
        const s1Name = matched ? (matched.dealerName || '') : '';
        const s1City = matched ? (matched.dealerCity || '') : '';
        const s1State = matched ? (matched.statePrefix || matched.dealerState || '') : '';
        const s1Status = matched ? (matched.systemStatus || (matched.isActive === false ? 'inactive' : 'active')) : '';

        outRows1.push([
            ...row,
            isSigned ? 'Yes' : 'No',
            s1Id,
            s1Name,
            s1City,
            s1State,
            s1Status,
            method
        ]);
    }

    const outWs1 = XLSX.utils.aoa_to_sheet(outRows1);
    XLSX.utils.book_append_sheet(outputWb, outWs1, 'Boatmart Completed CGPT');
    resultsSummary.file1 = {
        totalRows: totalDataRows1,
        signedCount: matchCount1,
        notSignedCount: totalDataRows1 - matchCount1,
        signedPct: `${((matchCount1 / totalDataRows1) * 100).toFixed(1)}%`
    };

    // ─────────────────────────────────────────────────────────
    // TAB 2: Boatmart active dealers 8-12-26
    // ─────────────────────────────────────────────────────────
    console.log('[TraderBoatmartMatcher] Processing File 2: Boatmart active dealers...');
    const wb2 = XLSX.readFile(FILE_2);
    const ws2 = wb2.Sheets[wb2.SheetNames[0]];
    const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });

    const header2 = [...(rows2[1] || [])];
    const outHeader2 = [...header2, ...addedCols];
    const outRows2 = [
        rows2[0] || [],
        outHeader2
    ];

    let matchCount2 = 0;
    let totalDataRows2 = 0;

    for (let i = 2; i < rows2.length; i++) {
        const row = rows2[i];
        if (!row || row.length === 0 || !row[1]) continue;
        totalDataRows2++;

        const accountName = String(row[1] || '').trim();
        const parentName = String(row[3] || '').trim();
        const dba = String(row[6] || '').trim();
        const address = String(row[7] || '').trim();
        const city = String(row[8] || '').trim();
        const state = String(row[9] || '').trim();
        const zip = String(row[10] || '').trim();

        let matched = null;
        let method = 'No Match';

        // Check if File 1 had a verified match for this exact account
        if (accountNameToMatchMap.has(accountName.toLowerCase())) {
            const cached = accountNameToMatchMap.get(accountName.toLowerCase());
            matched = cached.matched;
            method = cached.method;
        } else {
            const target = {
                name: dba || accountName,
                parentName,
                dba,
                address,
                city,
                state,
                zip,
                phone: ''
            };
            const res = findMatch(target, indexes);
            matched = res.matched;
            method = res.method;
        }

        if (matched) matchCount2++;

        const isSigned = Boolean(matched);
        const s1Id = matched ? (matched.clientDealerId || matched.dealerId || '') : '';
        const s1Name = matched ? (matched.dealerName || '') : '';
        const s1City = matched ? (matched.dealerCity || '') : '';
        const s1State = matched ? (matched.statePrefix || matched.dealerState || '') : '';
        const s1Status = matched ? (matched.systemStatus || (matched.isActive === false ? 'inactive' : 'active')) : '';

        outRows2.push([
            ...row,
            isSigned ? 'Yes' : 'No',
            s1Id,
            s1Name,
            s1City,
            s1State,
            s1Status,
            method
        ]);
    }

    const outWs2 = XLSX.utils.aoa_to_sheet(outRows2);
    XLSX.utils.book_append_sheet(outputWb, outWs2, 'Boatmart Active Dealers');
    resultsSummary.file2 = {
        totalRows: totalDataRows2,
        signedCount: matchCount2,
        notSignedCount: totalDataRows2 - matchCount2,
        signedPct: `${((matchCount2 / totalDataRows2) * 100).toFixed(1)}%`
    };

    // ─────────────────────────────────────────────────────────
    // TAB 3: Trader Interactive Dealer List
    // ─────────────────────────────────────────────────────────
    console.log('[TraderBoatmartMatcher] Processing File 3: Trader Interactive Dealer List...');
    const wb3 = XLSX.readFile(FILE_3);
    const ws3 = wb3.Sheets[wb3.SheetNames[0]];
    const rows3 = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: '' });

    // Headers are row 0: Account Name  ↑, Address, City, State, ZIP Code, ConfidenceScore, MatchedUnits
    const header3 = [...(rows3[0] || [])];
    const outHeader3 = [...header3, ...addedCols];
    const outRows3 = [outHeader3];

    let matchCount3 = 0;
    let totalDataRows3 = 0;

    for (let i = 1; i < rows3.length; i++) {
        const row = rows3[i];
        if (!row || row.length === 0 || !row[0]) continue;
        totalDataRows3++;

        const name = String(row[0] || '').trim();
        const address = String(row[1] || '').trim();
        const city = String(row[2] || '').trim();
        const state = String(row[3] || '').trim();
        const zip = String(row[4] || '').trim();

        const target = {
            name,
            parentName: '',
            dba: '',
            address,
            city,
            state,
            zip,
            phone: ''
        };

        const { matched, method } = findMatch(target, indexes);

        if (matched) matchCount3++;

        const isSigned = Boolean(matched);
        const s1Id = matched ? (matched.clientDealerId || matched.dealerId || '') : '';
        const s1Name = matched ? (matched.dealerName || '') : '';
        const s1City = matched ? (matched.dealerCity || '') : '';
        const s1State = matched ? (matched.statePrefix || matched.dealerState || '') : '';
        const s1Status = matched ? (matched.systemStatus || (matched.isActive === false ? 'inactive' : 'active')) : '';

        outRows3.push([
            ...row,
            isSigned ? 'Yes' : 'No',
            s1Id,
            s1Name,
            s1City,
            s1State,
            s1Status,
            method
        ]);
    }

    const outWs3 = XLSX.utils.aoa_to_sheet(outRows3);
    XLSX.utils.book_append_sheet(outputWb, outWs3, 'Trader Interactive Dealers');
    resultsSummary.file3 = {
        totalRows: totalDataRows3,
        signedCount: matchCount3,
        notSignedCount: totalDataRows3 - matchCount3,
        signedPct: `${((matchCount3 / totalDataRows3) * 100).toFixed(1)}%`
    };

    // Write final multi-tab Excel file
    XLSX.writeFile(outputWb, OUTPUT_FILE);
    console.log(`[TraderBoatmartMatcher] Successfully created merged workbook: ${OUTPUT_FILE}`);

    return {
        success: true,
        outputFile: OUTPUT_FILE,
        outputFileName: path.basename(OUTPUT_FILE),
        summary: resultsSummary
    };
}

async function inspectFiles() {
    const wb = XLSX.readFile(OUTPUT_FILE);
    const ws1 = wb.Sheets['Boatmart Completed CGPT'];
    const rows1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });

    const checkedRows = [];
    for (let i = 58; i <= 68; i++) {
        const r = rows1[i];
        if (!r) continue;
        checkedRows.push({
            rowIdx: i + 1,
            accountName: r[1],
            dba: r[6],
            city: r[8],
            state: r[9],
            signed: r[r.length - 7],
            s1Id: r[r.length - 6],
            s1Name: r[r.length - 5],
            s1City: r[r.length - 4],
            method: r[r.length - 1]
        });
    }

    return { checkedRows };
}

module.exports = { inspectFiles, processAllFiles };
