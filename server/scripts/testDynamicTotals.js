const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const analyticsRoutes = require('../routes/analytics');

const app = express();
app.use('/api/analytics', analyticsRoutes);

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const server = app.listen(3093, async () => {
    const johnAll = await fetch('http://localhost:3093/api/analytics/executive-summary?rep=John').then(r => r.json());
    const johnActive = await fetch('http://localhost:3093/api/analytics/executive-summary?rep=John&status=active').then(r => r.json());
    const john30d = await fetch('http://localhost:3093/api/analytics/executive-summary?rep=John&status=30d_inactive').then(r => r.json());

    console.log('--- DYNAMIC TOTALS TEST RESULTS ---');
    console.log('John All Apps:', johnAll.totals?.apps, 'Booked Volume:', johnAll.totals?.bookedDollars);
    console.log('John ACTIVE Apps:', johnActive.totals?.apps, 'Booked Volume:', johnActive.totals?.bookedDollars);
    console.log('John 30d INACTIVE Apps:', john30d.totals?.apps, 'Booked Volume:', john30d.totals?.bookedDollars);

    server.close();
    await mongoose.disconnect();
    process.exit(0);
  });
}
test();
