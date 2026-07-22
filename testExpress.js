const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const analyticsRoutes = require('./server/routes/analytics');

const app = express();
app.use('/api/analytics', analyticsRoutes);

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const server = app.listen(3099, async () => {
    const resBruce = await fetch('http://localhost:3099/api/analytics/historical/mom?rep=Bruce').then(r => r.json());
    const resGeorge = await fetch('http://localhost:3099/api/analytics/historical/mom?rep=George').then(r => r.json());
    
    console.log('--- DIRECT EXPRESS TEST ---');
    console.log('Bruce Jul 2026 Apps:', resBruce.months?.[resBruce.months.length - 1]?.stats?.apps, 'Active Dealers:', resBruce.months?.[resBruce.months.length - 1]?.cohorts?.active);
    console.log('George Jul 2026 Apps:', resGeorge.months?.[resGeorge.months.length - 1]?.stats?.apps, 'Active Dealers:', resGeorge.months?.[resGeorge.months.length - 1]?.cohorts?.active);
    
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  });
}
test();
