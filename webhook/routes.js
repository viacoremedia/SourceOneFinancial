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
// It will populate req.files with the file data and req.body with the text data.
router.post('/', upload.any(), (req, res) => {
    try {
        console.log('--- Webhook Received ---');
        console.log('Body data:', req.body);
        console.log('Files received:', req.files);
        console.log('------------------------');

        res.status(200).json({ 
            success: true, 
            message: 'Webhook processed successfully',
            dataReceived: req.body,
            filesReceived: req.files ? req.files.length : 0
        });
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;
