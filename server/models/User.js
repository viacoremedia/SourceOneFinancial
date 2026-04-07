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
        enum: ['employee', 'admin', 'super_admin'],
        default: 'employee',
    },
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
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ inviteToken: 1 });

module.exports = mongoose.model('User', userSchema);
