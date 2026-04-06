const mongoose = require('mongoose');

/**
 * SalesBudget Schema
 * 
 * One document per (year, rep, state) — stores monthly origination budget targets.
 * Parsed from the "2026 Sales Budget" CSV, Section 1 (State/Rep rows).
 * 
 * Links to DealerLocation via statePrefix → state, enabling:
 *   Location → SalesBudget.state → SalesBudget.rep → budget pool
 * 
 * @example
 *   { year: 2026, rep: "Bruce", state: "IA", growthTarget: 0.128,
 *     marketShare: 0.60, monthlyBudgets: { 1: 189792, ... }, annualTotal: 4597854 }
 */
const salesBudgetSchema = new mongoose.Schema({
    year: {
        type: Number,
        required: true,
    },
    rep: {
        type: String,
        required: true,
        trim: true,
    },
    state: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
    },
    growthTarget: {
        type: Number,  // decimal (e.g. 0.128 = 12.8%)
        default: null,
    },
    marketShare: {
        type: Number,  // decimal (e.g. 0.60 = 60%)
        default: null,
    },
    monthlyBudgets: {
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

salesBudgetSchema.index({ year: 1, state: 1 });
salesBudgetSchema.index({ year: 1, rep: 1 });
salesBudgetSchema.index({ year: 1, rep: 1, state: 1 }, { unique: true });

module.exports = mongoose.model('SalesBudget', salesBudgetSchema);
