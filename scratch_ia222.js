const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });

async function checkIA222() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    console.log('Connected to DB');

    // Check DealerLocation for IA222
    const locs = await db.collection('dealerlocations').find({
        $or: [
            { clientDealerId: /IA222/i },
            { dealerId: /IA222/i },
            { dealerName: /DES MOINES/i }
        ]
    }).toArray();
    console.log('DealerLocations found:', JSON.stringify(locs, null, 2));

    if (locs.length > 0) {
        const loc = locs[0];
        console.log('Location ID:', loc._id, 'clientDealerId:', loc.clientDealerId, 'dealerId:', loc.dealerId);

        // Check Applications
        const appsClient = await db.collection('applications').find({ clientDealerId: loc.clientDealerId }).sort({ applicationDate: -1 }).limit(5).toArray();
        console.log(`Apps by clientDealerId (${loc.clientDealerId}):`, appsClient.length);
        if (appsClient.length > 0) {
            console.log('Sample app:', {
                appId: appsClient[0]._id,
                applicationNumber: appsClient[0].applicationNumber,
                clientDealerId: appsClient[0].clientDealerId,
                dealerId: appsClient[0].dealerId,
                applicationDate: appsClient[0].applicationDate,
                applicantName: appsClient[0].applicantName,
                status: appsClient[0].status
            });
        }

        const appsDealerId = await db.collection('applications').find({
            $or: [
                { clientDealerId: loc.clientDealerId },
                { dealerId: loc.dealerId },
                { clientDealerId: loc.dealerId },
                { dealerId: loc.clientDealerId }
            ]
        }).sort({ applicationDate: -1 }).limit(10).toArray();
        console.log(`Apps by multi-id:`, appsDealerId.length);
        appsDealerId.forEach(a => console.log(' - App:', a.applicationNumber, a.applicationDate, a.clientDealerId, a.dealerId, a.status));
    }

    await mongoose.disconnect();
}

checkIA222().catch(console.error);
