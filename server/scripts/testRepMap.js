const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Application = require('../models/Application');
const DealerLocation = require('../models/DealerLocation');
const { getRepAliasMap, getAllReps } = require('../config/repConfig');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);

  const REP_ALIAS_MAP = getRepAliasMap({ includeInactive: true, includeExcluded: true });
  const allReps = getAllReps();

  console.log('--- REP ALIAS MAP (All Reps) ---');
  
  for (const [key, handles] of Object.entries(REP_ALIAS_MAP)) {
    const handleRegexes = handles.map(h => new RegExp('^' + h + '$', 'i'));
    const appCount = await Application.countDocuments({ dealerRepresentative: { $in: handleRegexes } });
    const locCount = await DealerLocation.countDocuments({ dealerRepresentative: { $in: handleRegexes } });

    // Find the display name and status for this key
    const repEntry = Object.entries(allReps).find(([, config]) => config.handles[0] === key);
    const displayName = repEntry ? repEntry[0] : key;
    const status = repEntry ? repEntry[1].status : 'unknown';
    const statusTag = status === 'active' ? '✓' : status === 'inactive' ? '✗ INACTIVE' : '⊘ EXCLUDED';

    console.log(`[${statusTag}] "${displayName}" (handles: ${handles.join(', ')}) -> ${locCount} locations, ${appCount} apps`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

test();
