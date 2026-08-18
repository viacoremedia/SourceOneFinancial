const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });
const Application = require('../models/Application');

async function inspect() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const statuses = await Application.distinct('status');
    console.log('\n--- DISTINCT STATUSES ---');
    console.log(statuses);

    const lenders = await Application.distinct('lender');
    console.log('\n--- DISTINCT LENDERS ---');
    console.log(lenders);

    const sampleApps = await Application.find({ underwriter: { $ne: null, $nin: ['', 'N/A'] } })
        .select('underwriter status lender applicationDate')
        .limit(20)
        .lean();
    console.log('\n--- SAMPLE UNDERWRITER APPS ---');
    console.log(sampleApps);

    // Group by status
    const statusCounts = await Application.aggregate([
        { $match: { underwriter: { $ne: null, $nin: ['', 'N/A'] } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    console.log('\n--- STATUS COUNTS FOR UNDERWRITER APPS ---');
    console.log(statusCounts);

    await mongoose.disconnect();
}

inspect().catch(console.error);
