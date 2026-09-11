const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { resolveRepName } = require('../config/repConfig');

async function test() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    const fs = require('fs');
    const apts = JSON.parse(fs.readFileSync(path.join(__dirname, 'tn160_apts.json'), 'utf8'));

    const DealerCommunication = require('../models/DealerCommunication');
    const commDocs = await DealerCommunication.find({
        sourceSystem: 'badger',
        communicationEventDatetime: { $ne: null },
        internalRelationshipId2: 'TN160'
    }).lean();

    console.log('Badger API apts count:', apts.length);
    console.log('Mongo badger comms count:', commDocs.length);

    apts.forEach(apt => {
        const rawRep = apt.created_by || apt.created_by_email || apt.user_name;
        console.log(`Badger Apt ${apt.id}: raw="${rawRep}" -> resolved="${resolveRepName(rawRep)}"`);
    });

    commDocs.forEach(c => {
        const rawRep = c.communicationUserFullName || c.communicationUserName;
        console.log(`Mongo Comm ${c.sourceCommunicationId}: raw="${rawRep}" -> resolved="${resolveRepName(rawRep)}"`);
    });

    await mongoose.disconnect();
}

test().catch(e => { console.error(e); process.exit(1); });
