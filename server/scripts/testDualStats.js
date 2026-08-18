const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getDealerStatsMap, getNetworkAggregateStats } = require('../services/dealerStatsService');

async function main() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/source_one';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('Connected!');

    const startDate = '2026-07-01';
    const endDate = '2026-07-28';

    console.log(`\nTesting getNetworkAggregateStats for ${startDate} to ${endDate}...`);
    const network = await getNetworkAggregateStats({ startDate, endDate });
    console.log('Network Stats Output:', JSON.stringify(network, null, 2));

    const statsMap = await getDealerStatsMap({ startDate, endDate });
    console.log(`Dealer Stats Map count: ${statsMap.size}`);

    await mongoose.disconnect();
    console.log('Done!');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
