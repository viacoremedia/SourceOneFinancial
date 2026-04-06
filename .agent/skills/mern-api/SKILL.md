---
name: MERN API Patterns
description: Express.js / Mongoose backend patterns for SaaS applications — route organization, service layer, auth middleware, error handling, cron jobs, and caching
---

# MERN API Skill

This skill provides deep knowledge of backend API patterns used in MERN stack
SaaS applications. All patterns are battle-tested from production systems.

## Route Organization

### Folder-Per-Feature Pattern
Routes are organized by feature domain:
```
server/routes/
├── auth/index.js
├── leads/index.js
├── reports/index.js
├── experiments/index.js
├── go_high_level/routes/index.js
└── webhooks/index.js
```

### Standard Route File Structure
```javascript
const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');

// Apply auth to ALL routes in this file
router.use(auth);

// GET — list/read operations
router.get('/', async (req, res) => {
  try {
    // Call service layer, never do business logic here
    const data = await someService.getAll(req.user.companyId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('GET /resource error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch data' });
  }
});

// POST — create operations
router.post('/', async (req, res) => { /* ... */ });

module.exports = router;
```

### Mixed Public/Protected Routes
For files with both public and protected endpoints (e.g., auth routes):
```javascript
// Public — no middleware
router.post('/login', loginHandler);
router.post('/register', registerHandler);

// Protected — middleware on specific routes
router.get('/me', auth, meHandler);
router.put('/profile', auth, profileHandler);
```

### Deeply Nested Routes
For subdirectories, adjust the require path:
```javascript
// At server/routes/go_high_level/routes/index.js
const auth = require('../../../middleware/auth'); // 3 levels deep
```

## Service Layer

The service layer is **mandatory**. Route handlers MUST NOT contain business logic
or call external APIs directly.

### Pattern
```javascript
// server/services/ghlService.js
const { createClient } = require('@gohighlevel/api-client');
const Bottleneck = require('bottleneck');

const limiter = new Bottleneck({ maxConcurrent: 2, minTime: 500 });

class GHLService {
  constructor() {
    this.client = createClient({ /* config */ });
  }

  async getContacts(locationId) {
    if (process.env.ISOLATED_MODE === 'true') {
      return this._getMockContacts();
    }
    return limiter.schedule(() => this.client.contacts.list({ locationId }));
  }

  _getMockContacts() {
    // Return mock data for safe development
  }
}

module.exports = new GHLService();
```

### Key Conventions
- One service file per integration domain
- Services handle: API communication, rate limiting, error recovery, data transformation
- ALL new service methods MUST include an `ISOLATED_MODE` guard
- Services are singletons (instantiated at module level)

## Authentication Middleware

### JWT Auth Pattern
```javascript
// server/middleware/auth.js
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
```

### Role-Based Authorization
```javascript
// server/middleware/authorize.js
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    next();
  };
};

// Usage in routes:
router.delete('/:id', auth, authorize('admin'), deleteHandler);
```

## Mongoose Model Patterns

### Schema Definition
```javascript
const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'contacted', 'quoted', 'booked', 'lost'],
    required: true,
    default: 'pending'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // ...
}, { timestamps: true });

module.exports = mongoose.model('Lead', LeadSchema);
```

### Critical Pitfalls
1. **Enum validation is silent** — Mongoose drops invalid enum values without error.
   Always test with invalid values.
2. **Different models, different default statuses** — `BookedDesign` uses `'pending'`,
   `BookedProject` uses `'active'`. Never assume.
3. **Non-schema fields are silently ignored** — Passing `clientName` to a model that
   doesn't have that field will NOT error but the data will NOT be saved.
4. **Population pitfalls** — Always specify which fields to populate. Unpopulated
   ObjectId refs will render as raw IDs in the frontend.

## Cron & Job Patterns

```javascript
// Job status tracking
const JobSchema = new mongoose.Schema({
  type: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  errorReason: String,
  startedAt: Date,
  completedAt: Date,
}, { timestamps: true });
```

### Conventions
- Cron handlers MUST be idempotent
- Always update `status` and `completedAt` on completion
- Log `errorReason` on failure (truncated, never full stack trace)
- Use Secret Headers to protect internal worker endpoints

## Caching Pattern

```javascript
// server/models/Cache.js — TTL-based caching
const CacheSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  data: mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, required: true },
});

// TTL configuration by data type:
// Dashboard widgets: 5 min
// Report data: 30 min
// User preferences: 60 min
```

## Error Response Standards

ALL error responses use this format:
```json
{ "success": false, "message": "Human-readable error description" }
```

| Code | When to Use |
|------|-------------|
| 401 | No token, expired token, invalid token |
| 403 | Valid token but insufficient role permissions |
| 409 | Duplicate resource, state conflict |
| 422 | Validation failure (bad data shape) |
| 500 | Unexpected server error (log the full error internally) |
