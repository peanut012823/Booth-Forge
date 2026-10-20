const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');

let mainWindow;
let lanServer;
const sharedPhotos = new Map();
const LAN_PORT = 4317;
const isDev = !app.isPackaged;


function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const item of entries || []) {
      if (item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.')) return item.address;
    }
  }
  return '127.0.0.1';
}
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function startLanServer() {
  lanServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/phone') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(phonePage());
    }
    if (req.method === 'POST' && url.pathname === '/api/phone-capture') {
      let body = ''; req.setEncoding('utf8');
      req.on('data', chunk => { body += chunk; if (body.length > 24 * 1024 * 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(parsed.dataUrl)) return sendJson(res, 400, { error: 'Please send a photo image.' });
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('booth:phone-photo', parsed.dataUrl);
          sendJson(res, 200, { ok: true, message: 'Photo sent to BoothForge.' });
        } catch { sendJson(res, 400, { error: 'Invalid upload.' }); }
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/publish') {
      let body = ''; req.setEncoding('utf8');
      req.on('data', chunk => { body += chunk; if (body.length > 32 * 1024 * 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (typeof parsed.dataUrl !== 'string' || !parsed.dataUrl.startsWith('data:image/png;base64,')) return sendJson(res, 400, { error: 'Invalid photo.' });
          const id = crypto.randomBytes(8).toString('hex');
          sharedPhotos.set(id, parsed.dataUrl);
          sendJson(res, 200, { id, url: `http://${getLanAddress()}:${LAN_PORT}/guest/${id}` });
        } catch { sendJson(res, 400, { error: 'Invalid request.' }); }
      });
      return;
    }
    const guestMatch = url.pathname.match(/^\/guest\/([a-f0-9]+)$/);
    if (req.method === 'GET' && guestMatch) {
      const dataUrl = sharedPhotos.get(guestMatch[1]);
      if (!dataUrl) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('This photo link is unavailable.'); }
      const image = dataUrl.replace(/^data:image\/png;base64,/, '');
      const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Your BoothForge photo</title><style>body{margin:0;background:#111118;color:#f5f3fa;font:16px system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}.card{max-width:560px;width:100%;text-align:center;background:#1c1b24;border:1px solid #383441;border-radius:22px;padding:20px;box-sizing:border-box}img{width:100%;height:auto;border-radius:12px;display:block;margin:16px 0}a{display:block;background:#a78bfa;color:#171320;text-decoration:none;font-weight:800;padding:14px;border-radius:12px}p{color:#bdb8c9;font-size:14px}</style></head><body><main class="card"><h1>Your photo is ready</h1><p>Save your BoothForge photo to your phone.</p><img alt="Your photo booth picture" src="data:image/png;base64,${image}"><a download="boothforge-photo.png" href="data:image/png;base64,${image}">Download photo</a><p>If the download doesn't start, long-press the photo and choose Save Image.</p></main></body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
  });
  lanServer.on('error', (error) => console.error('BoothForge local sharing server:', error.message));
  lanServer.listen(LAN_PORT, '0.0.0.0');
}
function phonePage() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta charset="utf-8"><meta name="theme-color" content="#111118"><title>BoothForge Phone Camera</title><style>*{box-sizing:border-box}body{margin:0;background:#111118;color:#f6f3fb;font:16px system-ui;padding:22px}.card{max-width:520px;margin:0 auto;background:#1c1b24;border:1px solid #383441;border-radius:22px;padding:22px}h1{font-size:25px;margin:0 0 8px}p{color:#bcb6c9;line-height:1.5}.mark{color:#b49aff;font-weight:900;letter-spacing:2px;margin-bottom:24px}.button{display:block;width:100%;padding:15px;border:0;border-radius:12px;background:#a78bfa;color:#171320;font-weight:850;font-size:16px;text-align:center;margin-top:16px}input{display:none}.status{margin-top:14px;padding:12px;border-radius:10px;background:#292532;color:#d9d0f3;font-size:14px}.tip{font-size:13px}</style></head><body><main class="card"><div class="mark">BOOTHFORGE · PHONE CAMERA</div><h1>Send photos to the booth</h1><p>Connect your phone and the booth computer to the same Wi-Fi. Tap below, take a photo, and use the camera's confirmation button to send it to BoothForge. Take three photos for a full strip.</p><input id="camera" type="file" accept="image/*" capture="environment"><label class="button" for="camera">Take a photo</label><div class="status" id="status">Waiting for your first photo…</div><p class="tip">This page uses your phone's built-in camera picker, which works on local Wi-Fi without installing an app. It does not provide a continuous live preview.</p></main><script>const input=document.getElementById('camera'),status=document.getElementById('status');input.addEventListener('change',async()=>{const file=input.files&&input.files[0];if(!file)return;status.textContent='Sending photo to the booth…';try{const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});const response=await fetch('/api/phone-capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Upload failed');status.textContent='Photo sent! You can take another photo.';}catch(e){status.textContent='Could not send photo: '+e.message+' Check that both devices are on the same Wi-Fi.'}input.value='';});</script></body></html>`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#101114',
    title: 'BoothForge Photo Booth',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (isDev) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  startLanServer();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (lanServer) lanServer.close(); });

ipcMain.handle('booth:get-save-directory', async () => app.getPath('pictures'));
ipcMain.handle('booth:save-photo', async (_event, { dataUrl, suggestedName }) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new Error('Invalid image data.');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save photo',
    defaultPath: path.join(app.getPath('pictures'), 'BoothForge', suggestedName || `booth-${Date.now()}.png`),
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  await fs.writeFile(result.filePath, Buffer.from(base64, 'base64'));
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('booth:print-photo', async (_event, { dataUrl }) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new Error('Invalid image data.');
  const printWindow = new BrowserWindow({
    show: false,
    width: 600,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; size: 4in 6in; }
    * { box-sizing: border-box; } html,body { margin:0; padding:0; width:4in; height:6in; background:#fff; }
    img { display:block; width:100%; height:100%; object-fit:contain; }
    @media print { html,body { width:4in;height:6in; } }
    </style></head><body><img id="photo" src="${dataUrl}"></body></html>`;
  await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await printWindow.webContents.executeJavaScript("new Promise(resolve => { const img = document.getElementById('photo'); if (img.complete) resolve(true); else { img.onload = () => resolve(true); img.onerror = () => resolve(false); } })");
  return await new Promise((resolve) => {
    printWindow.webContents.print({ silent: false, printBackground: true, margins: { marginType: 'none' } }, (success, failureReason) => {
      printWindow.close();
      resolve({ success, failureReason: success ? null : (failureReason || 'Print dialog did not complete.') });
    });
  });
});

ipcMain.handle('booth:open-folder', async (_event, folderPath) => {
  if (typeof folderPath !== 'string') return false;
  const result = await shell.openPath(folderPath);
  return result === '';
});


ipcMain.handle('booth:get-network-info', async () => ({ phoneUrl: `http://${getLanAddress()}:${LAN_PORT}/phone`, ip: getLanAddress(), port: LAN_PORT }));
ipcMain.handle('booth:publish-photo', async (_event, { dataUrl }) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('Invalid photo data.');
  const id = crypto.randomBytes(8).toString('hex');
  sharedPhotos.set(id, dataUrl);
  return { id, url: `http://${getLanAddress()}:${LAN_PORT}/guest/${id}` };
});
