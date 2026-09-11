const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const DealerCommunication = require('../models/DealerCommunication');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    const comms = await DealerCommunication.find({
        $or: [
            { internalRelationshipId2: 'TN160' },
            { internalRelationshipId2: 'tn160' }
        ]
    }).lean();

    console.log('Total comms found for TN160 in Mongo:', comms.length);
    for (const c of comms) {
        console.log(JSON.stringify({
            _id: c._id,
            sourceCommunicationId: c.sourceCommunicationId,
            sourceSystem: c.sourceSystem,
            communicationUserName: c.communicationUserName,
            communicationUserFullName: c.communicationUserFullName,
            communicationType: c.communicationType,
            communicationResult1: c.communicationResult1,
            communicationFeedback1: c.communicationFeedback1,
            communicationEventDatetime: c.communicationEventDatetime,
            communicationNotes: c.communicationNotes
        }, null, 2));
    }
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
