const express = require('express');
const multer = require('multer');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Setup multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); 
    },
    filename: (req, file, cb) => {
        // Keep the original filename or modify it to be unique
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// The 'upload.any()' middleware will accept any files that come over the wire.
// We invoke it manually inside the route to catch any multer-specific errors.
router.post('/', (req, res) => {
    upload.any()(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading (e.g. file too large).
            return res.status(400).json({
                success: false,
                error: 'File Upload Error',
                message: err.message,
                details: 'Please ensure you are sending the correct files and not exceeding size limits.'
            });
        } else if (err) {
            // An unknown error occurred when uploading.
            return res.status(400).json({
                success: false,
                error: 'Invalid Request',
                message: err.message || 'There was an issue parsing your request data.',
                details: 'Make sure your request is formatted as multipart/form-data correctly.'
            });
        }

        // Everything went fine.
        try {
            console.log('--- Webhook Received ---');
            console.log('Body data:', req.body);
            console.log('Files received:', req.files);
            console.log('------------------------');

            // Quick check if body or files are empty
            if (Object.keys(req.body || {}).length === 0 && (!req.files || req.files.length === 0)) {
                return res.status(400).json({
                    success: false,
                    error: 'Empty Payload',
                    message: 'No data or files were provided in the request.',
                    details: 'Please provide some form data or attach files to this webhook payload.'
                });
            }

            res.status(200).json({ 
                success: true, 
                message: 'Webhook processed successfully',
                dataReceived: req.body,
                filesReceived: req.files ? req.files.length : 0
            });
        } catch (error) {
            console.error('Error processing webhook:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal Server Error',
                message: 'Something went wrong while processing your webhook payload.',
                details: 'Please try again later or contact support if the issue persists.'
            });
        }
    });
});

module.exports = router;
