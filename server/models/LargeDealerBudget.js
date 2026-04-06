const mongoose = require('mongoose');

/**
 * LargeDealerBudget Schema
 * 
 * Budget for large dealer groups / FSPs that operate separately from
 * the state/rep budget (Fun Town, Silver, EPIC, IFG, Large Dealer Groups, FSPs).
 * Parsed from Section 2 of the budget CSV (lines 64+).
 * 
 * @example
 *   { year: 2026, groupName: "Fun Town (Core)", category: "large_dealer",
 *     lenderOriginations: { 1: 0, ... }, sourceOneOriginations: { 1: 2929968, ... } }
 */
const largeDealerBudgetSchema = new mongoose.Schema({
    year: {
        type: Number,
        required: true,
    },
    groupName: {
        type: String,
        required: true,
        trim: true,
    },
    category: {
        type: String,
        enum: ['large_dealer', 'fsp', 'silver'],
        default: 'large_dealer',
    },
    epicPercentage: {
        type: Number,  // e.g. 0.95 for EPIC's 95%
        default: null,
    },
    lenderOriginations: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
        6: { type: Number, default: 0 },
        7: { type: Number, default: 0 },
        8: { type: Number, default: 0 },
        9: { type: Number, default: 0 },
        10: { type: Number, default: 0 },
        11: { type: Number, default: 0 },
        12: { type: Number, default: 0 },
    },
    sourceOneOriginations: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
        6: { type: Number, default: 0 },
        7: { type: Number, default: 0 },
        8: { type: Number, default: 0 },
        9: { type: Number, default: 0 },
        10: { type: Number, default: 0 },
        11: { type: Number, default: 0 },
        12: { type: Number, default: 0 },
    },
    totalOriginations: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 },
        6: { type: Number, default: 0 },
        7: { type: Number, default: 0 },
        8: { type: Number, default: 0 },
        9: { type: Number, default: 0 },
        10: { type: Number, default: 0 },
        11: { type: Number, default: 0 },
        12: { type: Number, default: 0 },
    },
    annualTotal: {
        type: Number,
        default: 0,
    },
});

largeDealerBudgetSchema.index({ year: 1, groupName: 1 }, { unique: true });

module.exports = mongoose.model('LargeDealerBudget', largeDealerBudgetSchema);
