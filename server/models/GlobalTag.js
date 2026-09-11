const mongoose = require('mongoose');

const globalTagSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    color: {
        type: String,
        default: '#38bdf8'
    },
    description: {
        type: String,
        default: ''
    },
    createdBy: {
        type: String,
        default: 'system'
    }
}, { timestamps: true });

// Case-insensitive unique index
globalTagSchema.index({ name: 1 }, { collation: { locale: 'en', strength: 2 }, unique: true });

module.exports = mongoose.models.GlobalTag || mongoose.model('GlobalTag', globalTagSchema);
