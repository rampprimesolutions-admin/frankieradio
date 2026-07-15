const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const SERVER_IP = '104.237.151.158';
const SERVER_PORT = '8012';
const SID = '1';

// 🔴 CONFIGURACIÓN DE TELEGRAM 🔴
const TELEGRAM_BOT_TOKEN = '8756077868:AAFgELBxxXbkaAiL31JI1l-C5-qjLXbZaO0'; // Pega tu token aquí
const TELEGRAM_CHAT_ID = '7321748802'; // Pega tu chat ID aquí

const CURRENT_SONG_URL = `http://${SERVER_IP}:${SERVER_PORT}/currentsong?sid=${SID}`;
const STATS_URL = `http://${SERVER_IP}:${SERVER_PORT}/stats?sid=${SID}`;

let currentMetadata = { 
    title: 'Música ininterrumpida', 
    artist: 'Desconocido', 
    full: 'Cargando...' 
};

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
        return str.replace(/\[.*?\]/g, '')
                  .replace(/_/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
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
    }).on('error', () => {
        fetchMetadataFromStatsHTML();
    });
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
// SERVIDOR WEB
// =============================================
const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // 🆕 RUTA PARA PEDIR CANCIONES (POST)
    if (pathname === '/api/request' && method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { name, song } = JSON.parse(body);
                
                // Enviar a Telegram
                const message = `🎧 *¡Nuevo pedido musical!*\n\n👤 Nombre: ${name}\n🎵 Canción: ${song}`;
                const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
                
                const tgRes = await fetch(tgUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: message,
                        parse_mode: 'Markdown'
                    })
                });

                if (tgRes.ok) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Pedido enviado a Telegram' }));
                } else {
                    throw new Error('Error al enviar a Telegram');
                }
            } catch (err) {
                console.error('Error en /api/request:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Error interno' }));
            }
        });
        return;
    }

    // 🆕 RUTA DE METADATOS (GET)
    if (pathname === '/api/metadata') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(currentMetadata));
        return;
    }

    // Servir archivos estáticos
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
        const contentType = ext === '.html' ? 'text/html' : 
                           ext === '.css' ? 'text/css' : 
                           ext === '.js' ? 'text/javascript' : 
                           'text/plain';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`🎧 Frankie Radio V1.0 corriendo en: http://localhost:${PORT}`);
    fetchMetadataFromStats();
    setInterval(fetchMetadataFromStats, 3000);
});