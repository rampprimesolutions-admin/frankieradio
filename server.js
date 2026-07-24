const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
// DATOS PARA CONECTAR A SHOUTCAST (FRANKIE RADIO: CANAL 1 - BALADAS EN ESPAÑOL)
// const SERVER_IP = '104.237.151.158';
// const SERVER_PORT = '8012';

// DATOS PARA CONECTAR A LAPTOP (RICKY SERVER: SWYH)
const SERVER_IP = '100.103.128.75';
const SERVER_PORT = '5901';
const SID = '1';

// Configuración de Telegram
const TELEGRAM_BOT_TOKEN = '8756077868:AAFgELBxxXbkaAiL31JI1l-C5-qjLXbZaO0'; // Asegúrate de que esté tu token
const TELEGRAM_CHAT_ID = '7321748802'; // Asegúrate de que esté tu chat ID

// const CURRENT_SONG_URL = `http://${SERVER_IP}:${SERVER_PORT}/currentsong?sid=${SID}`;
const CURRENT_SONG_URL = `http://${SERVER_IP}:${SERVER_PORT}/currentsong`;
//const STATS_URL = `http://${SERVER_IP}:${SERVER_PORT}/stats?sid=${SID}`;
const STATS_URL = `http://${SERVER_IP}:${SERVER_PORT}/stats`;
const STREAM_URL = `http://${SERVER_IP}:${SERVER_PORT}/stream/swyh.mp3`; // URL del audio

let currentMetadata = { title: 'Música ininterrumpida', artist: 'Desconocido', full: 'Cargando...' };

// =============================================
// LIMPIEZA DE METADATOS
// =============================================
function cleanMetadata(rawTitle) {
    let full = rawTitle.trim();
    let artist = 'Desconocido';
    let title = full;
    if (title.includes(' - ')) {
        const parts = title.split(' - ', 2);
        artist = parts[0].trim();
        title = parts[1].trim();
    } else if (title.includes(' – ')) {
        const parts = title.split(' – ', 2);
        artist = parts[0].trim();
        title = parts[1].trim();
    }
    const cleanString = (str) => {
        return str.replace(/\[.*?\]/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    };
    artist = cleanString(artist);
    title = cleanString(title);
    if (!title) title = full;
    return { artist, title, full };
}

// =============================================
// CAPTURA DE METADATOS
// =============================================
function fetchMetadataFromStats() {
    const urlWithBuster = CURRENT_SONG_URL + '&_t=' + Date.now();
    http.get(urlWithBuster, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 200 && data.trim()) {
                const rawTitle = data.trim();
                if (rawTitle && rawTitle !== currentMetadata.full) {
                    const cleaned = cleanMetadata(rawTitle);
                    currentMetadata = cleaned;
                    console.log(`🎵 ✅ ${cleaned.artist} - ${cleaned.title}`);
                }
            } else {
                fetchMetadataFromStatsHTML();
            }
        });
    }).on('error', () => { fetchMetadataFromStatsHTML(); });
}

function fetchMetadataFromStatsHTML() {
    const urlWithBuster = STATS_URL + '&_t=' + Date.now();
    http.get(urlWithBuster, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 200) {
                const match = data.match(/Playing Now:\s*<a[^>]*>([^<]+)<\/a>/i);
                let rawTitle = match && match[1] ? match[1].trim() : '';
                if (!rawTitle) {
                    const titleMatch = data.match(/<title>(.*?)<\/title>/);
                    rawTitle = titleMatch ? titleMatch[1].trim() : '';
                }
                if (rawTitle && rawTitle !== currentMetadata.full) {
                    const cleaned = cleanMetadata(rawTitle);
                    currentMetadata = cleaned;
                    console.log(`🎵 ✅ ${cleaned.artist} - ${cleaned.title}`);
                }
            }
        });
    }).on('error', () => {});
}

// =============================================
// FUNCIÓN PARA ENVIAR A TELEGRAM
// =============================================
function sendToTelegram(name, song, callback) {
    const message = `🎧 *¡Nuevo pedido musical!*\n\n👤 Nombre: ${name}\n🎵 Canción: ${song}`;
    const postData = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'Markdown' });
    const options = {
        hostname: 'api.telegram.org', port: 443, path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => { callback(null, res.statusCode === 200); });
    });
    req.on('error', (err) => { callback(err, false); });
    req.write(postData);
    req.end();
}

// =============================================
// SERVIDOR WEB
// =============================================
const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // 🆕 PROXY DE AUDIO: Cuando el navegador pida /stream, reenviamos a la IP real
    if (pathname === '/stream/swyh.mp3') {
        console.log('🎧 Cliente solicitando audio...');
        // Hacemos la petición al servidor de USA
        const proxyReq = http.get(STREAM_URL, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res); // Reenviamos el audio al navegador
        });
        proxyReq.on('error', (err) => {
            console.error('Error al conectar con el stream:', err);
            res.writeHead(502);
            res.end('Error conectando al stream');
        });
        return;
    }

    // RUTA PARA PEDIR CANCIONES
    if (pathname === '/api/request' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { name, song } = JSON.parse(body);
                sendToTelegram(name, song, (err, success) => {
                    if (err) {
                        console.error('Error al enviar a Telegram:', err.message);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Error al enviar a Telegram' }));
                    } else {
                        console.log(`📨 Pedido enviado a Telegram: ${name} - ${song}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Pedido enviado a Telegram' }));
                    }
                });
            } catch (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ success: false, message: 'JSON inválido' }));
            }
        });
        return;
    }

    // RUTA DE METADATOS
    if (pathname === '/api/metadata') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(currentMetadata));
        return;
    }

    // SERVIR ARCHIVOS ESTÁTICOS
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('404 - Archivo no encontrado');
            return;
        }
        const ext = path.extname(filePath);
        const contentType = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/plain';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`🎧 Frankie Radio V1.0 corriendo en puerto ${PORT}`);
    fetchMetadataFromStats();
    setInterval(fetchMetadataFromStats, 3000);
});