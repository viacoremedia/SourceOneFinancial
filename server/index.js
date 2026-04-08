require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const webhookRoutes = require('./webhook/routes');
const analyticsRoutes = require('./routes/analytics');
const reportRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth');
const { requireAuth } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Capture raw body for multipart requests BEFORE other parsers.
// On Vercel, the request stream is pre-consumed by the runtime.
// This ensures we have the raw body as a Buffer for busboy to parse.
app.use(express.raw({
    type: (req) => {
        const ct = req.headers['content-type'] || '';
        return ct.includes('multipart/form-data') || ct.includes('application/octet-stream');
    },
    limit: '50mb'
}));

// Handle plain text payloads (in case data is sent as raw text/csv)
app.use(express.text({ type: ['text/*'], limit: '50mb' }));

// Parse incoming JSON requests and put the parsed data in req.body.
app.use(express.json({ limit: '50mb' }));
// Parse incoming requests with urlencoded payloads and put the parsed data in req.body.
app.use(express.urlencoded({ extended: true }));

// Global cache for connection (per serverless invocation)
let cached = global.mongoose;
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

// Lazy connect function with optimized options for serverless.
async function dbConnect() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 300000,
            minPoolSize: 1,
            maxPoolSize: 5,
        };

        cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then((mongooseInstance) => {
            console.log("DATABASE CONNECTED");
            return mongooseInstance;
        }).catch((e) => {
            // Clear cached promise so next request retries instead of using failed promise
            cached.promise = null;
            console.error("DB Connection Error:", e.message);
            throw e;
        });
    }

    cached.conn = await cached.promise;
    return cached.conn;
}

// Middleware to ensure DB connection for routes that need it
const ensureDbConnected = async (req, res, next) => {
    try {
        await dbConnect();
        next();
    } catch (error) {
        console.error("DB Connection Failed in Middleware:", error);
        res.status(500).send({ Message: "Database connection failed", Success: false });
    }
};

// Updated pingDb to use the new connect (no need for manual reconnect/check)
async function pingDb() {
    await dbConnect(); // Ensures connected
    await mongoose.connection.db.admin().ping();
    console.log("DB ping executed successfully");
}

app.get("/ping-db", async (req, res) => {
    try {
        await pingDb();
        res.send({ Message: "DB ping successful", Success: true });
    } catch (error) {
        console.error("DB Ping Error:", error);
        res.status(500).send({ Message: "DB ping failed", Success: false });
    }
});


app.use(ensureDbConnected)

// Use webhook routes (NO auth required)
app.use('/webhook', webhookRoutes);

// Use auth routes (NO auth required — login/invite endpoints)
app.use('/auth', authRoutes);

// ── Auth gate — everything below requires a valid JWT ──
app.use(requireAuth);

// Use analytics routes (PROTECTED)
app.use('/analytics', analyticsRoutes);

// Use report routes (PROTECTED)
app.use('/reports', reportRoutes);

// 404 handler for undefined routes
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `The endpoint '${req.url}' does not exist.`,
        details: 'Please check your URL. The available endpoint is POST /webhook'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);

    // Friendly error specifically for malformed JSON
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Invalid JSON payload provided.',
            details: 'Please ensure your JSON is properly formatted.'
        });
    }

    res.status(500).json({
        success: false,
        error: 'Server Error',
        message: 'An unexpected error occurred on the server.',
        details: err.message
    });
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

module.exports = app;