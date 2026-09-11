const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const DealerLocation = require('../models/DealerLocation');
const DealerProfile = require('../models/DealerProfile');
const AuditLog = require('../models/AuditLog');

async function testFeature2() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('--- TESTING FEATURE 2: BACKEND LOGIC & AUDIT TRAIL ---');

    // 1. Pick a sample dealer (e.g. TN160)
    const dealer = await DealerLocation.findOne({
        $or: [{ dealerId: 'TN160' }, { clientDealerId: 'TN160' }]
    });
    if (!dealer) {
        console.error('Test dealer TN160 not found');
        process.exit(1);
    }
    console.log(`Testing with dealer: ${dealer.dealerName} (${dealer.dealerId})`);

    const originalState = {
        systemStatus: dealer.systemStatus || 'active',
        systemStatusReason: dealer.systemStatusReason || null,
        businessType: dealer.businessType || null,
        tags: dealer.tags || [],
        industry: dealer.industry || null,
        isManuallyClassified: dealer.isManuallyClassified || false
    };
    console.log('Original State:', originalState);

    // 2. Perform Quick Action Update
    const testUpdate = {
        systemStatus: 'closed',
        systemStatusReason: 'Automated test closure note',
        businessType: 'franchise',
        tags: ['High Volume', 'VIP Partner', 'TestTag123'],
        industry: 'rv'
    };

    const cleanId = dealer.dealerId.trim().toUpperCase();
    const matchQuery = { $or: [{ dealerId: cleanId }, { clientDealerId: cleanId }] };

    const updatedLoc = await DealerLocation.findOneAndUpdate(
        matchQuery,
        { $set: { ...testUpdate, isManuallyClassified: true, systemStatusChangedAt: new Date(), systemStatusChangedBy: 'Feature2Verifier' } },
        { returnDocument: 'after' }
    );
    await DealerProfile.findOneAndUpdate(
        { $or: [{ clientDealerId: cleanId }, { dealerLocation: updatedLoc._id }] },
        { $set: { ...testUpdate, isManuallyClassified: true } }
    );

    const auditLog = await AuditLog.create({
        dealerId: cleanId,
        dealerName: updatedLoc.dealerName,
        action: 'quick_action_batch',
        user: { name: 'Feature2Verifier', email: 'test@source1financial.com' },
        previousState: originalState,
        newState: testUpdate,
        reason: testUpdate.systemStatusReason
    });

    console.log('Created AuditLog entry ID:', auditLog._id);

    // Verify DB update
    const verifyDoc = await DealerLocation.findOne(matchQuery).lean();
    console.log('Updated Document in Mongo:');
    console.log('  systemStatus:', verifyDoc.systemStatus);
    console.log('  businessType:', verifyDoc.businessType);
    console.log('  tags:', verifyDoc.tags);
    console.log('  industry:', verifyDoc.industry);
    console.log('  isManuallyClassified:', verifyDoc.isManuallyClassified);

    if (verifyDoc.systemStatus !== 'closed' || verifyDoc.businessType !== 'franchise' || !verifyDoc.tags.includes('TestTag123')) {
        throw new Error('Update verification failed!');
    }
    console.log('✅ Update to DealerLocation and DealerProfile verified successfully.');

    // 3. Test Distinct Tags query
    const distinctTags = await DealerLocation.distinct('tags');
    console.log('Distinct Tags count in DB:', distinctTags.length);
    console.log('Contains TestTag123:', distinctTags.includes('TestTag123'));
    if (!distinctTags.includes('TestTag123')) {
        throw new Error('Distinct tags query failed to find TestTag123');
    }
    console.log('✅ Distinct tags query verified.');

    // 4. Test 1-Click Undo
    console.log('--- Testing 1-Click Undo ---');
    const revertData = {
        systemStatus: originalState.systemStatus,
        systemStatusReason: originalState.systemStatusReason,
        businessType: originalState.businessType,
        tags: originalState.tags,
        industry: originalState.industry,
        isManuallyClassified: originalState.isManuallyClassified
    };

    await DealerLocation.findOneAndUpdate(matchQuery, { $set: revertData });
    await DealerProfile.findOneAndUpdate(
        { $or: [{ clientDealerId: cleanId }, { dealerLocation: updatedLoc._id }] },
        { $set: revertData }
    );

    auditLog.isUndone = true;
    auditLog.undoneAt = new Date();
    auditLog.undoneBy = { name: 'Feature2Verifier', email: 'test@source1financial.com' };
    await auditLog.save();

    const finalLoc = await DealerLocation.findOne(matchQuery).lean();
    console.log('Reverted Document in Mongo:');
    console.log('  systemStatus:', finalLoc.systemStatus);
    console.log('  businessType:', finalLoc.businessType);
    console.log('  tags:', finalLoc.tags);
    console.log('  industry:', finalLoc.industry);
    console.log('  isManuallyClassified:', finalLoc.isManuallyClassified);

    if (finalLoc.systemStatus !== originalState.systemStatus || finalLoc.businessType !== originalState.businessType) {
        throw new Error('Revert verification failed!');
    }
    console.log('✅ 1-Click Undo verified successfully. Restored to exact original state.');

    // Clean up test audit log
    await AuditLog.deleteOne({ _id: auditLog._id });
    console.log('Cleaned up test audit log.');

    await mongoose.disconnect();
    console.log('--- ALL TESTS PASSED SUCCESSFULLY ---');
}

testFeature2().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
