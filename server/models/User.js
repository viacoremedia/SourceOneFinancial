const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    passwordHash: {
        type: String,
        default: null, // null until invite accepted
    },
    name: {
        type: String,
        trim: true,
        default: '',
    },
    role: {
        type: String,
        enum: ['employee', 'admin', 'super_admin', 'inside_rep'],
        default: 'employee',
    },
    assignedRep: {
        type: String,
        trim: true,
        default: null,
    },
    // For inside reps: dealers excluded from their portfolio view & calculations
    excludedDealers: [{
        type: String,
        uppercase: true,
        trim: true,
    }],
    status: {
        type: String,
        enum: ['invited', 'active', 'disabled'],
        default: 'invited',
    },
    inviteToken: {
        type: String,
        default: null,
    },
    inviteExpiresAt: {
        type: Date,
        default: null,
    },
    resetPasswordToken: {
        type: String,
        default: null,
    },
    resetPasswordExpiresAt: {
        type: Date,
        default: null,
    },
    lastLoginAt: {
        type: Date,
        default: null,
    },
    lastActiveAt: {
        type: Date,
        default: null,
    },
    loginCount: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

userSchema.index({ inviteToken: 1 });
userSchema.index({ resetPasswordToken: 1 });

module.exports = mongoose.model('User', userSchema);
