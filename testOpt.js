const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, 'server/.env') });
const analyticsRoutes = require('./server/routes/analytics');

const app = express();
app.use('/api/analytics', analyticsRoutes);

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const server = app.listen(3097, async () => {
    console.time('Bruce Query');
    const resBruce = await fetch('http://localhost:3097/api/analytics/historical/mom?rep=Bruce').then(r => r.json());
    console.timeEnd('Bruce Query');

    console.time('George Query');
    const resGeorge = await fetch('http://localhost:3097/api/analytics/historical/mom?rep=George').then(r => r.json());
    console.timeEnd('George Query');

    console.log('--- DIRECT EXPRESS TEST RESULTS ---');
    console.log('Bruce (edominguez) Jul 2026 Apps:', resBruce.months?.[resBruce.months.length - 1]?.stats?.apps, 'Active Dealers:', resBruce.months?.[resBruce.months.length - 1]?.cohorts?.active);
    console.log('George (gott) Jul 2026 Apps:', resGeorge.months?.[resGeorge.months.length - 1]?.stats?.apps, 'Active Dealers:', resGeorge.months?.[resGeorge.months.length - 1]?.cohorts?.active);

    server.close();
    await mongoose.disconnect();
    process.exit(0);
  });
}
test();
