/**
 * Reorder columns across all 5 dark dealer files and regenerate the rep breakdown.
 * 
 * Target 38 Columns in exact order:
 *  1. Dealer ID
 *  2. Dealer Name
 *  3. Lead Tier
 *  4. Business Status
 *  5. Identity Event
 *  6. DBA
 *  7. State
 *  8. City
 *  9. Address
 * 10. Zip Code
 * 11. Dealer Phone
 * 12. Recommended Action
 * 13. Status Summary
 * 14. Needs Review
 * 15. Review Reason
 * 16. Website Domain
 * 17. Website Live
 * 18. Operating Status
 * 19. Current Banner Name
 * 20. Confidence
 * 21. Primary Contact Name
 * 22. Primary Contact Title
 * 23. Primary Phone Type
 * 24. Primary Contact Phone
 * 25. Primary Email Tier
 * 26. Primary Contact Email
 * 27. Primary Contact Source
 * 28. Contact 2 Name
 * 29. Contact 2 Title
 * 30. Contact 2 Phone
 * 31. Contact 2 Email
 * 32. Contact 2 Source
 * 33. Contact 3 Name
 * 34. Contact 3 Title
 * 35. Contact 3 Phone
 * 36. Contact 3 Email
 * 37. Contact 3 Source
 * 38. Reference URLs
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const { resolveRepName } = require('../config/repConfig');

// Robust RFC 4180 CSV parser
function parseCSV(text) {
  const rows = [];
  let row = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(current);
      current = '';
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
        rows.push(row);
      }
      row = [];
    } else {
      current += char;
    }
  }
  if (current || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

// Robust RFC 4180 CSV serializer
function stringifyCSV(rows) {
  return rows.map(row => {
    return row.map(cell => {
      if (cell === null || cell === undefined) return '';
      const str = String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',');
  }).join('\r\n') + '\r\n';
}

const TARGET_COLUMNS = [
  { header: 'Dealer ID', keys: ['dealer_id', 'dealer id', 'clientdealerid'] },
  { header: 'Dealer Name', keys: ['dealer_name', 'dealer name'] },
  { header: 'Lead Tier', keys: ['lead_tier', 'lead tier'] },
  { header: 'Business Status', keys: ['business_status', 'business status'] },
  { header: 'Identity Event', keys: ['identity_event', 'identity event'] },
  { header: 'DBA', keys: ['dba'] },
  { header: 'State', keys: ['state'] },
  { header: 'City', keys: ['city'] },
  { header: 'Address', keys: ['address', 'dealeraddress'] },
  { header: 'Zip Code', keys: ['zip', 'zip code', 'dealerpostalcode'] },
  { header: 'Dealer Phone', keys: ['dealer_phone', 'dealer phone', 'dealerphonenumber'] },
  { header: 'Recommended Action', keys: ['recommended_action', 'recommended action'] },
  { header: 'Status Summary', keys: ['status_summary', 'status summary'] },
  { header: 'Needs Review', keys: ['needs_review', 'needs review'] },
  { header: 'Review Reason', keys: ['review_reason', 'review reason'] },
  { header: 'Website Domain', keys: ['domain', 'website domain', 'website_domain'] },
  { header: 'Website Live', keys: ['website_live', 'website live'] },
  { header: 'Operating Status', keys: ['operating_status', 'operating status'] },
  { header: 'Current Banner Name', keys: ['current_banner_name', 'current banner name'] },
  { header: 'Confidence', keys: ['confidence'] },
  { header: 'Primary Contact Name', keys: ['contact_1_name', 'primary contact name'] },
  { header: 'Primary Contact Title', keys: ['contact_1_title', 'primary contact title'] },
  { header: 'Primary Phone Type', keys: ['contact_1_phone_type', 'primary phone type'] },
  { header: 'Primary Contact Phone', keys: ['contact_1_phone', 'primary contact phone'] },
  { header: 'Primary Email Tier', keys: ['contact_1_email_tier', 'primary email tier'] },
  { header: 'Primary Contact Email', keys: ['contact_1_email', 'primary contact email'] },
  { header: 'Primary Contact Source', keys: ['contact_1_source', 'primary contact source'] },
  { header: 'Contact 2 Name', keys: ['contact_2_name', 'contact 2 name'] },
  { header: 'Contact 2 Title', keys: ['contact_2_title', 'contact 2 title'] },
  { header: 'Contact 2 Phone', keys: ['contact_2_phone', 'contact 2 phone'] },
  { header: 'Contact 2 Email', keys: ['contact_2_email', 'contact 2 email'] },
  { header: 'Contact 2 Source', keys: ['contact_2_source', 'contact 2 source'] },
  { header: 'Contact 3 Name', keys: ['contact_3_name', 'contact 3 name'] },
  { header: 'Contact 3 Title', keys: ['contact_3_title', 'contact 3 title'] },
  { header: 'Contact 3 Phone', keys: ['contact_3_phone', 'contact 3 phone'] },
  { header: 'Contact 3 Email', keys: ['contact_3_email', 'contact 3 email'] },
  { header: 'Contact 3 Source', keys: ['contact_3_source', 'contact 3 source'] },
  { header: 'Reference URLs', keys: ['reference_urls', 'reference urls'] }
];

const TARGET_HEADERS = TARGET_COLUMNS.map(c => c.header);

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const rootDir = path.join(__dirname, '../../');
  const outputBaseDir = path.join(rootDir, 'dark_dealers_by_rep');

  const inputFiles = [
    'dark_dealers_hard_review_queue.csv',
    'dark_dealers_rep_clean_queue.csv',
    'dark_dealers_rep_ready_master_415.csv',
    'dark_dealers_scrubbed_results_v2.csv',
    'dark_dealers_soft_review_queue.csv'
  ];

  // 1. Build lookup for contact_1_phone_type and contact_1_email_tier
  const metadataLookup = new Map();

  for (const f of ['dark_dealers_rep_ready_master_415.csv', 'dark_dealers_hard_review_queue.csv']) {
    const filePath = path.join(rootDir, f);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const rows = parseCSV(content);
    const header = rows[0].map(h => h.trim().toLowerCase());
    const idIdx = header.indexOf('dealer_id') !== -1 ? header.indexOf('dealer_id') : header.indexOf('dealer id');
    const ptIdx = header.indexOf('contact_1_phone_type') !== -1 ? header.indexOf('contact_1_phone_type') : header.indexOf('primary phone type');
    const etIdx = header.indexOf('contact_1_email_tier') !== -1 ? header.indexOf('contact_1_email_tier') : header.indexOf('primary email tier');

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const dId = (row[idIdx] || '').trim().toUpperCase();
      if (!dId) continue;
      const phoneType = ptIdx >= 0 ? row[ptIdx] : '';
      const emailTier = etIdx >= 0 ? row[etIdx] : '';
      if (!metadataLookup.has(dId) || (!metadataLookup.get(dId).phoneType && phoneType)) {
        metadataLookup.set(dId, { phoneType, emailTier });
      }
    }
  }
  console.log(`Metadata lookup has ${metadataLookup.size} dealers with phone_type/email_tier`);

  // 2. Load DB rep mappings
  const locs = await DealerLocation.find({}).lean();
  const profs = await DealerProfile.find({}).lean();

  const locMap = new Map();
  for (const l of locs) {
    if (l.dealerId) locMap.set(l.dealerId.toUpperCase(), l);
  }
  const profMap = new Map();
  for (const p of profs) {
    if (p.clientDealerId) profMap.set(p.clientDealerId.toUpperCase(), p);
  }

  // Helper to reorder a single row
  function reorderRow(row, headerMap, dId) {
    return TARGET_COLUMNS.map(col => {
      for (const key of col.keys) {
        if (headerMap.has(key)) {
          const val = row[headerMap.get(key)];
          if (val !== undefined && val !== null && val !== '') return val;
        }
      }
      if (col.header === 'Primary Phone Type' && metadataLookup.has(dId)) {
        return metadataLookup.get(dId).phoneType || '';
      }
      if (col.header === 'Primary Email Tier' && metadataLookup.has(dId)) {
        return metadataLookup.get(dId).emailTier || '';
      }
      return '';
    });
  }

  const allKnownReps = new Set();
  const processedFiles = [];

  // 3. Process each file
  for (const fileName of inputFiles) {
    const filePath = path.join(rootDir, fileName);
    const content = fs.readFileSync(filePath, 'utf8');
    const rows = parseCSV(content);
    const origHeader = rows[0];

    const headerMap = new Map();
    origHeader.forEach((h, idx) => {
      headerMap.set(h.trim().toLowerCase(), idx);
    });

    const idIdx = headerMap.get('dealer_id') ?? headerMap.get('dealer id');

    const reorderedRows = [];
    const repRowsMap = new Map();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const dId = (row[idIdx] || '').trim().toUpperCase();
      const loc = locMap.get(dId);
      const prof = profMap.get(dId);

      const rawRep = prof?.assignedRep || loc?.dealerRepresentative || loc?.badgerData?.accountOwner || prof?.badgerData?.accountOwner;
      const rep = resolveRepName(rawRep) || 'Unassigned';
      allKnownReps.add(rep);

      const newRow = reorderRow(row, headerMap, dId);
      reorderedRows.push(newRow);

      if (!repRowsMap.has(rep)) {
        repRowsMap.set(rep, []);
      }
      repRowsMap.get(rep).push(newRow);
    }

    // Sort function for State (index 6), City (index 7), Dealer Name (index 1)
    const sortFn = (a, b) => {
      const stateA = (a[6] || '').trim().toUpperCase();
      const stateB = (b[6] || '').trim().toUpperCase();
      if (stateA !== stateB) return stateA.localeCompare(stateB);

      const cityA = (a[7] || '').trim().toUpperCase();
      const cityB = (b[7] || '').trim().toUpperCase();
      if (cityA !== cityB) return cityA.localeCompare(cityB);

      const nameA = (a[1] || '').trim().toUpperCase();
      const nameB = (b[1] || '').trim().toUpperCase();
      return nameA.localeCompare(nameB);
    };

    reorderedRows.sort(sortFn);

    // Update master root file
    const masterOutRows = [TARGET_HEADERS, ...reorderedRows];
    fs.writeFileSync(filePath, stringifyCSV(masterOutRows), 'utf8');
    console.log(`Updated root file: ${fileName} (${reorderedRows.length} rows, 38 columns)`);

    processedFiles.push({
      fileName,
      totalRows: reorderedRows.length,
      repRowsMap,
      sortFn
    });
  }

  const sortedReps = Array.from(allKnownReps).sort();

  // Create rep subfolders
  for (const rep of sortedReps) {
    const repFolder = path.join(outputBaseDir, rep);
    if (!fs.existsSync(repFolder)) {
      fs.mkdirSync(repFolder, { recursive: true });
    }
  }

  // Summary matrix
  const summaryMatrix = {};
  for (const rep of sortedReps) {
    summaryMatrix[rep] = {
      totalDealers: 0,
      states: new Set(),
      files: {}
    };
  }

  // 4. Output to each rep folder
  for (const fileData of processedFiles) {
    const { fileName, repRowsMap, sortFn, totalRows } = fileData;
    let written = 0;

    for (const rep of sortedReps) {
      const rowsForRep = repRowsMap.get(rep) || [];
      written += rowsForRep.length;
      summaryMatrix[rep].files[fileName] = rowsForRep.length;

      rowsForRep.sort(sortFn);

      rowsForRep.forEach(r => {
        const st = (r[6] || '').trim().toUpperCase(); // State is index 6
        if (st) summaryMatrix[rep].states.add(st);
      });

      const outRows = [TARGET_HEADERS, ...rowsForRep];
      const outFilePath = path.join(outputBaseDir, rep, fileName);
      fs.writeFileSync(outFilePath, stringifyCSV(outRows), 'utf8');
    }

    console.log(`[REP OUTPUT] ${fileName}: Total input ${totalRows} -> Total written ${written} (Match: ${totalRows === written})`);
  }

  // Calculate distinct total dealers per rep across all files
  for (const rep of sortedReps) {
    summaryMatrix[rep].totalDealers = summaryMatrix[rep].files['dark_dealers_scrubbed_results_v2.csv'] || 0;
  }

  // 5. Generate README.md
  let md = '# Dark Dealers by Sales Representative Breakdown\n\n';
  md += `Generated: ${new Date().toISOString().split('T')[0]}\n\n`;
  md += 'All files feature the standardized 38-column layout with dealers grouped and sorted alphabetically by **State**, **City**, and **Dealer Name**.\n\n';

  md += '### Standardized Column Layout (38 Columns)\n';
  md += '`' + TARGET_HEADERS.join('` | `') + '`\n\n';

  md += '## Queue Summary by Sales Representative\n\n';
  md += '| Sales Representative | Master Scrubbed (v2) | Rep Ready Master | Rep Clean Queue | Soft Review Queue | Hard Review Queue | Covered States |\n';
  md += '|:---|:---:|:---:|:---:|:---:|:---:|:---|\n';

  let grandTotalScrubbed = 0;
  let grandTotalReady = 0;
  let grandTotalClean = 0;
  let grandTotalSoft = 0;
  let grandTotalHard = 0;

  for (const rep of sortedReps) {
    const s = summaryMatrix[rep];
    const scrubbed = s.files['dark_dealers_scrubbed_results_v2.csv'] || 0;
    const ready = s.files['dark_dealers_rep_ready_master_415.csv'] || 0;
    const clean = s.files['dark_dealers_rep_clean_queue.csv'] || 0;
    const soft = s.files['dark_dealers_soft_review_queue.csv'] || 0;
    const hard = s.files['dark_dealers_hard_review_queue.csv'] || 0;
    const stateList = Array.from(s.states).sort().join(', ');

    grandTotalScrubbed += scrubbed;
    grandTotalReady += ready;
    grandTotalClean += clean;
    grandTotalSoft += soft;
    grandTotalHard += hard;

    md += `| **[${rep}](./${encodeURIComponent(rep)})** | ${scrubbed} | ${ready} | ${clean} | ${soft} | ${hard} | ${stateList || '—'} |\n`;
  }

  md += `| **TOTAL** | **${grandTotalScrubbed}** | **${grandTotalReady}** | **${grandTotalClean}** | **${grandTotalSoft}** | **${grandTotalHard}** | **All Active Territories** |\n\n`;

  md += '## State Distribution per Sales Representative\n\n';
  for (const rep of sortedReps) {
    const s = summaryMatrix[rep];
    const states = Array.from(s.states).sort();
    md += `### ${rep}\n`;
    md += `- **Master Total**: ${s.totalDealers} dealers\n`;
    md += `- **Territory States**: ${states.join(', ') || 'None'}\n\n`;
  }

  const summaryPath = path.join(outputBaseDir, 'README.md');
  fs.writeFileSync(summaryPath, md, 'utf8');
  console.log(`Summary updated at: ${summaryPath}`);

  // Also replace generate_rep_breakdown.js with this exact logic
  const genScriptPath = path.join(__dirname, 'generate_rep_breakdown.js');
  fs.copyFileSync(__filename, genScriptPath);
  console.log(`Updated ${genScriptPath} with new 38-column logic`);

  await mongoose.disconnect();
  console.log('Complete!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
