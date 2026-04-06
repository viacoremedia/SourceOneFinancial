require('dotenv').config();
const mongoose = require('mongoose');
const DG = require('../models/DealerGroup');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const groups = await DG.find({}).select('name slug dealerCount').sort({ name: 1 }).lean();
  
  // Find duplicates by normalized name
  const seen = {};
  for (const g of groups) {
    const key = g.name.toLowerCase().replace(/[^a-z]/g, '');
    if (!seen[key]) seen[key] = [];
    seen[key].push(g);
  }
  
  for (const [, v] of Object.entries(seen)) {
    if (v.length > 1) {
      console.log('DUPLICATE:');
      v.forEach(x => console.log(`  "${x.name}" (${x.dealerCount} locations) id: ${x._id}`));
    }
  }
  
  process.exit();
});
