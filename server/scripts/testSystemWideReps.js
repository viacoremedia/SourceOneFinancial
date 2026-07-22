const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const analyticsRoutes = require('../routes/analytics');

const app = express();
app.use('/api/analytics', analyticsRoutes);

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const server = app.listen(3095, async () => {
    console.log('--- TESTING SYSTEM-WIDE REP FILTERING ---');
    
    // 1. Executive summary for Jeff
    const execJeff = await fetch('http://localhost:3095/api/analytics/executive-summary?rep=Jeff').then(r => r.json());
    console.log('Executive Summary (Jeff) Apps:', execJeff.totals?.apps, 'Booked Volume:', execJeff.totals?.bookedDollars);

    // 2. Groups for Jeff
    const groupsJeff = await fetch('http://localhost:3095/api/analytics/groups?rep=Jeff').then(r => r.json());
    console.log('Dealer Groups (Jeff) Count:', groupsJeff.count, 'First group:', groupsJeff.groups?.[0]?.name);

    // 3. Small dealers for Jeff
    const smallJeff = await fetch('http://localhost:3095/api/analytics/dealers/small?rep=Jeff&scope=all').then(r => r.json());
    console.log('Dealer Locations (Jeff) Count:', smallJeff.count, 'First location:', smallJeff.dealers?.[0]?.dealerName);

    server.close();
    await mongoose.disconnect();
    process.exit(0);
  });
}
test();
