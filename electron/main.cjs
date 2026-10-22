const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const https = require('node:https');
const selfsigned = require('selfsigned');
const os = require('node:os');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');

let mainWindow;
let lanServer;
const sharedPhotos = new Map();
const LAN_PORT = 4318;
let latestPhoneFrame = '';
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
async function startLanServer() {
  const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }];
  for (const entries of Object.values(os.networkInterfaces())) for (const item of entries || []) { if (item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.')) altNames.push({ type: 7, ip: item.address }); }
  const certPair = await selfsigned.generate([{ name: 'commonName', value: 'BoothForge Local Camera' }], { days: 3650, keySize: 2048, extensions: [{ name: 'subjectAltName', altNames }] });
  lanServer = https.createServer({ key: certPair.private, cert: certPair.cert }, async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/phone') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(phonePage());
    }
    if (req.method === 'POST' && url.pathname === '/api/phone-frame') {
      let body = ''; req.setEncoding('utf8');
      req.on('data', chunk => { body += chunk; if (body.length > 2 * 1024 * 1024) req.destroy(); });
      req.on('end', () => { try { const parsed = JSON.parse(body); if (typeof parsed.dataUrl !== 'string' || !/^data:image\/(jpeg|webp|png);base64,/.test(parsed.dataUrl)) return sendJson(res, 400, { error: 'Invalid camera frame.' }); latestPhoneFrame = parsed.dataUrl; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('booth:phone-frame', latestPhoneFrame); sendJson(res, 200, { ok: true }); } catch { sendJson(res, 400, { error: 'Invalid camera frame.' }); } });
      return;
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
          sendJson(res, 200, { id, url: `https://${getLanAddress()}:${LAN_PORT}/guest/${id}` });
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
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta charset="utf-8"><meta name="theme-color" content="#111118"><title>BoothForge Phone Webcam</title><style>*{box-sizing:border-box}body{margin:0;background:#111118;color:#f6f3fb;font:16px system-ui;padding:18px}.card{max-width:560px;margin:0 auto;background:#1c1b24;border:1px solid #383441;border-radius:22px;padding:20px}h1{font-size:24px;margin:0 0 8px}.mark{color:#b49aff;font-weight:900;letter-spacing:2px;margin-bottom:20px}p{color:#bcb6c9;line-height:1.5}.button{display:block;width:100%;padding:15px;border:0;border-radius:12px;background:#a78bfa;color:#171320;font-weight:850;font-size:16px;text-align:center;margin-top:12px}button{cursor:pointer}video{width:100%;display:block;background:#08080b;border-radius:12px;margin-top:14px;max-height:58vh;object-fit:contain}.status{margin-top:14px;padding:12px;border-radius:10px;background:#292532;color:#d9d0f3;font-size:14px}.tip{font-size:13px}.secondary{background:#35313f;color:#f6f3fb}</style></head><body><main class="card"><div class="mark">BOOTHFORGE · WIRELESS WEBCAM</div><h1>Use your phone as a webcam</h1><p>Keep your phone and booth PC on the same Wi-Fi. Tap Connect camera and allow camera permission. Keep this page open to send a live preview to BoothForge.</p><video id="preview" autoplay muted playsinline></video><button class="button" id="connect">Connect phone camera</button><button class="button secondary" id="stop">Stop camera</button><input id="photo" type="file" accept="image/*" capture="environment" style="display:none"><label class="button secondary" for="photo">Fallback: take and send one photo</label><div class="status" id="status">Waiting to connect…</div><p class="tip">If the browser shows a certificate warning, continue only if the address exactly matches the one displayed by BoothForge and you are on your trusted private Wi-Fi. Some phones may block camera access to a locally generated certificate; if so, use the existing Take a photo workflow instead.</p><canvas id="frame" hidden></canvas></main><script>const video=document.getElementById('preview'),status=document.getElementById('status'),canvas=document.getElementById('frame'),photoInput=document.getElementById('photo');let stream=null,active=false;photoInput.addEventListener('change',async()=>{const file=photoInput.files&&photoInput.files[0];if(!file)return;try{const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});const response=await fetch('/api/phone-capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})});if(!response.ok)throw new Error('Upload failed');status.textContent='Photo sent to BoothForge.'}catch(e){status.textContent='Could not send photo: '+e.message}photoInput.value='';});document.getElementById('connect').onclick=async()=>{try{status.textContent='Requesting camera permission…';stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});video.srcObject=stream;await video.play();active=true;status.textContent='Camera connected. Live frames are being sent to BoothForge.';sendFrames();}catch(e){status.textContent='Camera could not start: '+e.message+'. Check browser camera permission and the certificate warning.'}};document.getElementById('stop').onclick=()=>{active=false;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;status.textContent='Camera stopped.'};async function sendFrames(){while(active&&stream){if(video.videoWidth){canvas.width=Math.min(video.videoWidth,960);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);try{const response=await fetch('/api/phone-frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl:canvas.toDataURL('image/jpeg',0.65)})});if(!response.ok)throw new Error('Upload failed')}catch(e){status.textContent='Connection lost. Keep both devices on the same Wi-Fi.';active=false;break}}await new Promise(r=>setTimeout(r,250))}}</script></body></html>`;
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


ipcMain.handle('booth:get-network-info', async () => ({ phoneUrl: `https://${getLanAddress()}:${LAN_PORT}/phone`, ip: getLanAddress(), port: LAN_PORT }));
ipcMain.handle('booth:publish-photo', async (_event, { dataUrl }) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('Invalid photo data.');
  const id = crypto.randomBytes(8).toString('hex');
  sharedPhotos.set(id, dataUrl);
  return { id, url: `https://${getLanAddress()}:${LAN_PORT}/guest/${id}` };
});
