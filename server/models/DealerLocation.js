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

    // ── Fields from OMNI Dealer Information Table ──
    // All optional — populated when dealer_information CSV is ingested

    // Identifiers
    clientDealerId: { type: String, trim: true, default: null },
    globalId: { type: String, trim: true, default: null },

    // Business names
    dba: { type: String, trim: true, default: null },
    dealerGroupName: { type: String, trim: true, default: null },
    region: { type: String, trim: true, default: null },

    // Location
    dealerAddress: { type: String, trim: true, default: null },
    dealerCity: { type: String, trim: true, default: null },
    dealerState: { type: String, trim: true, default: null },
    dealerPostalCode: { type: String, trim: true, default: null },
    county: { type: String, trim: true, default: null },

    // Contact
    dealerPhoneNumber: { type: String, trim: true, default: null },
    dealerFaxNumber: { type: String, trim: true, default: null },

    // Lifecycle dates
    enrollmentDate: { type: Date, default: null },
    activatedDate: { type: Date, default: null },
    deactivatedDate: { type: Date, default: null },
    dealerAgreementDate: { type: Date, default: null },
    dealerLicenseExpiration: { type: Date, default: null },
    terminationDate: { type: Date, default: null },

    // Active status from OMNI
    isActive: { type: Boolean, default: null },

    // Dealer capabilities
    collateralType: { type: String, trim: true, default: null },
    dealerRepresentative: { type: String, trim: true, default: null },
    documentDelivery: { type: String, trim: true, default: null },
    bookout: { type: String, trim: true, default: null },

    // Platform flags
    isActiveForDealerTrack: { type: Boolean, default: null },
    isActiveForRouteOne: { type: Boolean, default: null },
    isEsignAllowed: { type: Boolean, default: null },
    isFundingReserveHold: { type: Boolean, default: null },
    isBmoDealer: { type: Boolean, default: null },
    isMedallionDealer: { type: Boolean, default: null },
    isActiveForRouteOneCanada: { type: Boolean, default: null },
    isActiveForCreditLane: { type: Boolean, default: null },
    isActiveForCudl: { type: Boolean, default: null },
    isSourceOneOnly: { type: Boolean, default: null },
    isFsbDealer: { type: Boolean, default: null },
    isSalesTaxRequired: { type: Boolean, default: null },
    isMultiDecisionEnabled: { type: Boolean, default: null },

    // Metadata
    lastInfoIngestionDate: { type: Date, default: null },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

/**
 * Auto-extract and normalize statePrefix from dealerId before validation.
 * Handles: TX400→TX, SCA161→CA (Southern CA), EFL123→FL (EPIC prefix).
 */
dealerLocationSchema.pre('validate', function () {
    if (this.dealerId && (!this.statePrefix || this.isModified('dealerId'))) {
        const match = this.dealerId.match(/^([A-Z]+)/i);
        let prefix = match ? match[1].toUpperCase() : '';

        // Normalize 3-letter codes
        if (prefix === 'SCA' || prefix === 'NCA') prefix = 'CA';
        else if (prefix.length === 3 && prefix.startsWith('E')) prefix = prefix.substring(1);

        this.statePrefix = prefix || null;
    }
});

dealerLocationSchema.index({ dealerId: 1 }, { unique: true });
dealerLocationSchema.index({ dealerGroup: 1 });
dealerLocationSchema.index({ statePrefix: 1 });

module.exports = mongoose.model('DealerLocation', dealerLocationSchema);
