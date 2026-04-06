const mongoose = require('mongoose');

/**
 * DealerGroup Schema
 * 
 * Represents an auto-detected dealer brand that operates multiple locations.
 * Groups are discovered by extracting the brand name from DEALER NAME during
 * CSV ingestion. Single-location ("small") dealers do NOT get a group.
 * 
 * @example
 *   { name: "Blue Compass RV", slug: "blue-compass-rv", dealerCount: 23 }
 */
const dealerGroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Dealer group name is required'],
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true,
        trim: true
    },
    dealerCount: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

/**
 * Auto-generate slug from name before validation.
 * Converts to lowercase, replaces non-alphanumeric chars with hyphens,
 * and collapses multiple hyphens.
 */
dealerGroupSchema.pre('validate', function () {
    if (this.name && (!this.slug || this.isModified('name'))) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/-{2,}/g, '-');
    }
});

dealerGroupSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('DealerGroup', dealerGroupSchema);
