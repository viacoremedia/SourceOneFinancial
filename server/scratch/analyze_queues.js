const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const { resolveRepName } = require('../config/repConfig');

// Simple robust CSV line parser handling quotes
function parseCSV(text) {
  const lines = [];
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
        lines.push(row);
      }
      row = [];
    } else {
      current += char;
    }
  }
  if (current || row.length > 0) {
    row.push(current);
    lines.push(row);
  }
  return lines;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const files = [
    'dark_dealers_hard_review_queue.csv',
    'dark_dealers_rep_clean_queue.csv',
    'dark_dealers_rep_ready_master_415.csv',
    'dark_dealers_scrubbed_results_v2.csv',
    'dark_dealers_soft_review_queue.csv'
  ];

  // Fetch all dealer info from DB
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

  console.log(`DB has ${locMap.size} locations, ${profMap.size} profiles`);

  for (const f of files) {
    const filePath = path.join(__dirname, '../../', f);
    const content = fs.readFileSync(filePath, 'utf8');
    const rows = parseCSV(content);
    const header = rows[0];
    const idIdx = header.indexOf('dealer_id');
    const stateIdx = header.indexOf('state');

    console.log(`\n=== File: ${f} (${rows.length - 1} data rows) ===`);
    console.log(`dealer_id idx: ${idIdx}, state idx: ${stateIdx}`);

    const repDistribution = {};
    let missingRep = 0;
    let missingDB = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const dId = (row[idIdx] || '').trim().toUpperCase();
      const loc = locMap.get(dId);
      const prof = profMap.get(dId);

      if (!loc && !prof) {
        missingDB++;
      }

      const rawRep = prof?.assignedRep || loc?.dealerRepresentative || loc?.badgerData?.accountOwner || prof?.badgerData?.accountOwner;
      const rep = resolveRepName(rawRep);

      if (!rep) {
        missingRep++;
        console.log(`  Missing rep for dealer: ${dId}, name: ${row[1]}`);
      } else {
        repDistribution[rep] = (repDistribution[rep] || 0) + 1;
      }
    }

    console.log(`Missing DB: ${missingDB}, Missing Rep: ${missingRep}`);
    console.log('Rep breakdown:');
    for (const [rep, count] of Object.entries(repDistribution).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${rep}: ${count}`);
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
