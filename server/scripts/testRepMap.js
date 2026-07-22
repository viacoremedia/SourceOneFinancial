const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Application = require('../models/Application');
const DealerLocation = require('../models/DealerLocation');

const REP_NAME_MAP = {
    'bruce': ['edominguez', 'bruce'],
    'george': ['gott', 'george'],
    'janet': ['jharrington1', 'janet'],
    'jeff': ['jweller', 'jeff'],
    'john': ['jsmith', 'john'],
    'pam/ward': ['wstoutimore', 'pam/ward', 'ward'],
    'steve': ['skimble', 'steve'],
    'mandi': ['mschultz1', 'mandi'],
    'dzilberchtein': ['dzilberchtein'],
    'gcoulombe': ['gcoulombe'],
    'jrubi': ['jrubi'],
    'ljablonoski': ['ljablonoski'],
    'pcarter': ['pcarter'],
    'house': ['S1House']
};

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  for (const [name, handles] of Object.entries(REP_NAME_MAP)) {
    const handleRegexes = handles.map(h => new RegExp('^' + h + '$', 'i'));
    const appCount = await Application.countDocuments({ dealerRepresentative: { $in: handleRegexes } });
    const locCount = await DealerLocation.countDocuments({ dealerRepresentative: { $in: handleRegexes } });
    console.log(`Rep: "${name}" (handles: ${handles.join(', ')}) -> ${locCount} locations, ${appCount} apps`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

test();
