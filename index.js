require('dotenv').config();
const express = require('express');
const cors = require('cors');
const webhookRoutes = require('./webhook/routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Parse incoming JSON requests and put the parsed data in req.body.
app.use(express.json());
// Parse incoming requests with urlencoded payloads and put the parsed data in req.body.
app.use(express.urlencoded({ extended: true }));

// Use webhook routes
app.use('/webhook', webhookRoutes);

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