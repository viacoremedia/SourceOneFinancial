const mongoose = require('mongoose');

/**
 * DealerLocation Schema
 * 
 * Represents an individual dealer location identified by a unique dealer ID
 * (e.g. TX400, SCA161, EFL123). Each location optionally belongs to a
 * DealerGroup — single-location ("small") dealers have dealerGroup: null.
 * 
 * The statePrefix is auto-extracted from the dealerId (the alphabetic prefix).
 * 
 * @example
 *   { dealerId: "TX400", dealerName: "FUN TOWN RV CONROE", statePrefix: "TX",
 *     dealerGroup: ObjectId("...") }
 * @example
 *   { dealerId: "AR101", dealerName: "CRABTREE RV CENTER INC", statePrefix: "AR",
 *     dealerGroup: null }  // small dealer — no group
 */
const dealerLocationSchema = new mongoose.Schema({
    dealerId: {
        type: String,
        required: [true, 'Dealer ID is required'],
        unique: true,
        uppercase: true,
        trim: true
    },
    dealerName: {
        type: String,
        required: [true, 'Dealer name is required'],
        trim: true
    },
    dealerGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DealerGroup',
        default: null
    },
    statePrefix: {
        type: String,
        trim: true,
        uppercase: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

/**
 * Auto-extract statePrefix from dealerId before validation.
 * Matches the leading alphabetic characters (e.g. TX from TX400, SCA from SCA161).
 */
dealerLocationSchema.pre('validate', function () {
    if (this.dealerId && (!this.statePrefix || this.isModified('dealerId'))) {
        const match = this.dealerId.match(/^([A-Z]+)/i);
        this.statePrefix = match ? match[1].toUpperCase() : '';
    }
});

dealerLocationSchema.index({ dealerId: 1 }, { unique: true });
dealerLocationSchema.index({ dealerGroup: 1 });
dealerLocationSchema.index({ statePrefix: 1 });

module.exports = mongoose.model('DealerLocation', dealerLocationSchema);
