const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const { resolveRepName } = require('../config/repConfig');

async function test() {
  console.log('Starting check_dealers.js...');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected to DB');

  const files = [
    'dark_dealers_hard_review_queue.csv',
    'dark_dealers_rep_clean_queue.csv',
    'dark_dealers_rep_ready_master_415.csv',
    'dark_dealers_scrubbed_results_v2.csv',
    'dark_dealers_soft_review_queue.csv'
  ];

  const allDealerIds = new Set();
  for (const f of files) {
    const filePath = path.join(__dirname, '../../', f);
    if (!fs.existsSync(filePath)) {
      console.log('File not found:', filePath);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
      const match = lines[i].match(/^([^,]+)/);
      if (match && match[1] && match[1] !== 'dealer_id') {
        allDealerIds.add(match[1].trim().toUpperCase());
      }
    }
  }

  console.log('Total unique dealer_ids across files:', allDealerIds.size);

  const ids = Array.from(allDealerIds);
  const locs = await DealerLocation.find({ dealerId: { $in: ids } }).lean();
  const profs = await DealerProfile.find({ clientDealerId: { $in: ids } }).lean();

  console.log('Found in DealerLocation:', locs.length);
  console.log('Found in DealerProfile:', profs.length);

  const locMap = new Map(locs.map(l => [l.dealerId, l]));
  const profMap = new Map(profs.map(p => [p.clientDealerId, p]));

  let repStats = {
    profAssignedRep: 0,
    locDealerRep: 0,
    badgerOwner: 0,
    either: 0,
    neither: 0
  };

  const repCounts = {};
  const unassigned = [];

  for (const id of ids) {
    const loc = locMap.get(id);
    const prof = profMap.get(id);

    const pRep = prof?.assignedRep;
    const lRep = loc?.dealerRepresentative;
    const bRep = loc?.badgerData?.accountOwner || prof?.badgerData?.accountOwner;

    if (pRep) repStats.profAssignedRep++;
    if (lRep) repStats.locDealerRep++;
    if (bRep) repStats.badgerOwner++;

    const chosen = pRep || lRep || bRep;
    if (chosen) {
      repStats.either++;
      const resolved = resolveRepName(chosen) || chosen;
      repCounts[resolved] = (repCounts[resolved] || 0) + 1;
    } else {
      repStats.neither++;
      unassigned.push({ id, name: loc?.dealerName, state: loc?.dealerState || loc?.statePrefix });
    }
  }

  console.log('Rep stats:', JSON.stringify(repStats, null, 2));
  console.log('Rep counts:', JSON.stringify(repCounts, null, 2));
  console.log('Unassigned sample (up to 10):', JSON.stringify(unassigned.slice(0, 10), null, 2));

  await mongoose.disconnect();
  console.log('Done.');
}

test().catch(err => {
  console.error('Error in check_dealers:', err);
  process.exit(1);
});
