import { useCallback, useEffect, useRef, useState } from 'react';
import { Aperture, Camera, Check, ChevronDown, Clock3, Download, FolderOpen, Images, Printer, RefreshCw, Settings2, ShieldCheck, Sparkles, Trash2, Wifi, X, Smartphone, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const FRAMES = [
  { id: 'midnight', name: 'Midnight', color: '#a78bfa', background: '#171324' },
  { id: 'champagne', name: 'Champagne', color: '#e6c98e', background: '#201b15' },
  { id: 'neon', name: 'Neon Pop', color: '#5eead4', background: '#10201f' },
  { id: 'classic', name: 'Classic', color: '#f5f5f5', background: '#202124' }
];
const SESSION_SHOTS = 3;

function makeCanvasPhoto(video, frame, label) {
  const canvas = document.createElement('canvas');
  const width = 1200;
  const height = 900;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = frame.background; ctx.fillRect(0, 0, width, height);
  const videoRatio = video.videoWidth / video.videoHeight;
  const targetRatio = width / height;
  let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
  if (videoRatio > targetRatio) { sw = video.videoHeight * targetRatio; sx = (video.videoWidth - sw) / 2; }
  else { sh = video.videoWidth / targetRatio; sy = (video.videoHeight - sh) / 2; }
  ctx.save(); ctx.translate(width, 0); ctx.scale(-1, 1); ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height); ctx.restore();
  ctx.strokeStyle = frame.color; ctx.lineWidth = 24; ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.fillStyle = frame.background; ctx.fillRect(0, height - 76, width, 76);
  ctx.fillStyle = frame.color; ctx.font = '600 28px Arial'; ctx.textAlign = 'center';
  ctx.fillText(label || 'BOOTHFORGE • PHOTO BOOTH', width / 2, height - 29);
  return canvas;
}

async function composeStrip(photos, frame) {
  const canvas = document.createElement('canvas');
  const pad = 44, gap = 24, imageW = 720, imageH = 540, footer = 120;
  canvas.width = imageW + pad * 2;
  canvas.height = pad * 2 + photos.length * imageH + (photos.length - 1) * gap + footer;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = frame.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = frame.color; ctx.lineWidth = 12; ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  const images = await Promise.all(photos.map((photo) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = photo; })));
  images.forEach((img, index) => {
    ctx.drawImage(img, pad, pad + index * (imageH + gap), imageW, imageH);
    ctx.strokeStyle = frame.color; ctx.lineWidth = 5; ctx.strokeRect(pad, pad + index * (imageH + gap), imageW, imageH);
  });
  ctx.fillStyle = frame.color; ctx.textAlign = 'center'; ctx.font = 'bold 30px Arial';
  ctx.fillText('BOOTHFORGE', canvas.width / 2, canvas.height - 68);
  ctx.fillStyle = '#c9c6d0'; ctx.font = '20px Arial';
  ctx.fillText(new Date().toLocaleDateString(), canvas.width / 2, canvas.height - 35);
  return canvas.toDataURL('image/png');
}

export default function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const phoneShotBufferRef = useRef([]);
  const timerRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [frameId, setFrameId] = useState('midnight');
  const [countdown, setCountdown] = useState(3);
  const [autoPrint, setAutoPrint] = useState(true);
  const [shots, setShots] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [count, setCount] = useState(null);
  const [result, setResult] = useState('');
  const [lastSaved, setLastSaved] = useState('');
  const [label, setLabel] = useState('BOOTHFORGE • PHOTO BOOTH');
  const [showSettings, setShowSettings] = useState(false);
  const [gallery, setGallery] = useState([]);
  const [notice, setNotice] = useState('Ready for your next session.');
  const [phoneUrl, setPhoneUrl] = useState('');
  const [guestUrl, setGuestUrl] = useState('');
  const [phoneShots, setPhoneShots] = useState(0);
  const frame = FRAMES.find((f) => f.id === frameId) || FRAMES[0];

  const stopCamera = useCallback(() => {
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('idle');
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((device) => device.kind === 'videoinput');
      setDevices(cams);
      if (!deviceId && cams[0]) setDeviceId(cams[0].deviceId);
    } catch (error) { setCameraError(error.message || 'Could not list cameras.'); }
  }, [deviceId]);

  const startCamera = useCallback(async (selectedId = deviceId) => {
    setCameraError('');
    stopCamera();
    try {
      const video = selectedId ? { deviceId: { exact: selectedId } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { ...((typeof video === 'object') ? video : {}), width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraState('live');
      await refreshDevices();
      setNotice('Camera connected. Ready to capture.');
    } catch (error) {
      setCameraState('error');
      setCameraError(`${error.name || 'Camera error'}: ${error.message || 'Unable to open camera.'} Check Windows camera permissions and close other apps using the camera.`);
    }
  }, [deviceId, refreshDevices, stopCamera]);

  useEffect(() => {
    refreshDevices();
    window.boothAPI?.getNetworkInfo?.().then((info) => setPhoneUrl(info.phoneUrl)).catch(() => {});
    const unsubscribe = window.boothAPI?.onPhonePhoto?.((dataUrl) => {
      const next = [...phoneShotBufferRef.current, dataUrl];
      phoneShotBufferRef.current = next;
      setPhoneShots((count) => count + 1);
      setShots(next);
      if (next.length >= SESSION_SHOTS) {
        phoneShotBufferRef.current = [];
        setShots([]);
        composeStrip(next.slice(0, SESSION_SHOTS), frame).then((strip) => {
          setResult(strip); setGallery((items) => [{ id: Date.now(), image: strip, date: new Date().toLocaleString() }, ...items].slice(0, 12));
          setNotice(autoPrint ? 'Phone photos received. Opening print dialog…' : 'Phone photos received. Save or print the finished strip.');
          if (autoPrint) printPhoto(strip);
        }).catch((error) => setNotice(`Could not compose phone photos: ${error.message}`));
      } else { setNotice(`Phone photo received (${next.length}/${SESSION_SHOTS}). Take ${SESSION_SHOTS - next.length} more photo(s) on your phone.`); }
    });
    return () => { stopCamera(); if (timerRef.current) clearTimeout(timerRef.current); if (unsubscribe) unsubscribe(); };
  }, []); // intentional one-time setup

  useEffect(() => {
    if (cameraState === 'live' && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraState]);

  const beginSession = () => {
    if (cameraState !== 'live') { setNotice('Connect a camera before starting a session.'); return; }
    setShots([]); setResult(''); setCapturing(true); setNotice('Get ready — your photo session is starting.');
    takeShot(0, []);
  };

  const takeShot = (shotIndex, existingShots) => {
    let seconds = countdown;
    setCount(seconds);
    const tick = () => {
      seconds -= 1;
      if (seconds > 0) { setCount(seconds); timerRef.current = setTimeout(tick, 1000); return; }
      setCount('SMILE');
      timerRef.current = setTimeout(() => {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || !video.videoWidth) {
          setCapturing(false); setCount(null); setNotice('Camera is not ready. Please try again.'); return;
        }
        const photo = makeCanvasPhoto(video, frame, label).toDataURL('image/png');
        const next = [...existingShots, photo];
        setShots(next); setCount(null);
        if (shotIndex + 1 < SESSION_SHOTS) {
          setNotice(`Photo ${shotIndex + 1} captured. Get ready for photo ${shotIndex + 2}.`);
          timerRef.current = setTimeout(() => takeShot(shotIndex + 1, next), 650);
        } else {
          composeStrip(next, frame).then((strip) => { setResult(strip); setGallery((prev) => [{ id: Date.now(), image: strip, date: new Date().toLocaleString() }, ...prev].slice(0, 12));
          setCapturing(false); setNotice(autoPrint ? 'Session complete. Opening print dialog…' : 'Session complete. Save or print your photo strip.');
            if (autoPrint) printPhoto(strip);
          }).catch((error) => { setCapturing(false); setNotice(`Could not compose strip: ${error.message}`); });
        }
      }, 450);
    };
    timerRef.current = setTimeout(tick, 1000);
  };

  const cancelSession = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCapturing(false); setCount(null); setShots([]); setNotice('Session cancelled.');
  };

  useEffect(() => {
    if (!result || !window.boothAPI?.publishPhoto) { setGuestUrl(''); return; }
    let cancelled = false;
    window.boothAPI.publishPhoto({ dataUrl: result }).then((published) => { if (!cancelled) setGuestUrl(published.url); }).catch(() => { if (!cancelled) setGuestUrl(''); });
    return () => { cancelled = true; };
  }, [result]);

  const savePhoto = async (image = result) => {
    if (!image) return;
    if (window.boothAPI?.savePhoto) {
      try {
        const response = await window.boothAPI.savePhoto({ dataUrl: image, suggestedName: `boothforge-${Date.now()}.png` });
        if (!response.canceled) { setLastSaved(response.filePath); setNotice(`Saved photo: ${response.filePath}`); }
      } catch (error) { setNotice(`Save failed: ${error.message}`); }
    } else {
      const link = document.createElement('a'); link.href = image; link.download = `boothforge-${Date.now()}.png`; link.click(); setNotice('Photo downloaded.');
    }
  };

  const printPhoto = async (image = result) => {
    if (!image) return;
    if (window.boothAPI?.printPhoto) {
      setNotice('Opening Windows print dialog…');
      try {
        const response = await window.boothAPI.printPhoto({ dataUrl: image });
        setNotice(response.success ? 'Print job sent to the selected printer.' : `Print did not complete: ${response.failureReason || 'Unknown error'}`);
      } catch (error) { setNotice(`Printing failed: ${error.message}`); }
    } else { setNotice('Printing is available in the installed Electron app.'); }
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Aperture size={23}/></div><div><div className="brand-name">BOOTH<span>FORGE</span></div><div className="brand-sub">PHOTO BOOTH STUDIO</div></div></div>
      <div className="top-status"><span className={`status-dot ${cameraState === 'live' ? 'live' : ''}`}></span><span>{cameraState === 'live' ? 'CAMERA CONNECTED' : 'CAMERA NOT CONNECTED'}</span><span className="status-divider"></span><span className="offline"><ShieldCheck size={14}/> OFFLINE READY</span></div>
      <button className="icon-button" title="Settings" onClick={() => setShowSettings((value) => !value)}><Settings2 size={18}/></button>
    </header>

    <main className="workspace">
      <section className="studio-column">
        <div className="section-heading"><div><div className="eyebrow">LIVE STUDIO</div><h1>Capture the moment<span>.</span></h1><p>Make every session feel like an event.</p></div><div className="session-pill"><span className="pulse"></span> SESSION READY</div></div>
        <div className="preview-card">
          <div className="preview-top"><div className="preview-label"><span className="live-dot"></span> LIVE PREVIEW</div><div className="preview-tools"><span>HD</span><span>16:9 SENSOR</span></div></div>
          <div className="viewfinder" style={{ '--frame-color': frame.color, '--frame-bg': frame.background }}>
            <video ref={videoRef} muted playsInline className={cameraState === 'live' ? 'video-live' : 'video-hidden'} />
            {cameraState !== 'live' && <div className="camera-placeholder"><div className="placeholder-icon"><Camera size={34}/></div><h2>Your studio is waiting</h2><p>Connect a webcam or a DSLR that appears as a camera device.</p><button className="primary-button" onClick={() => startCamera()}><Camera size={16}/> Connect camera</button></div>}
            {cameraState === 'live' && <div className="viewfinder-frame"><span></span><span></span><span></span><span></span></div>}
            {count !== null && <div className="countdown-overlay"><div className="countdown-number">{count}</div><div className="countdown-caption">{count === 'SMILE' ? 'CAPTURE!' : 'GET READY'}</div></div>}
            <div className="preview-bottom"><span><span className="tiny-green"></span> {cameraState === 'live' ? 'LIVE FEED' : 'NO SIGNAL'}</span><span>{shots.length} / {SESSION_SHOTS} SHOTS</span></div>
          </div>
          <div className="capture-controls">
            <div className="shot-progress">{[0,1,2].map((n) => <div key={n} className={`shot-dot ${shots.length > n ? 'done' : ''}`}>{shots.length > n ? <Check size={12}/> : n + 1}</div>)}</div>
            {!capturing ? <button className="capture-button" disabled={cameraState !== 'live'} onClick={beginSession}><span className="capture-inner"><Aperture size={22}/></span><span>START PHOTO SESSION</span></button> : <button className="cancel-button" onClick={cancelSession}><X size={16}/> CANCEL SESSION</button>}
            <div className="capture-meta"><Clock3 size={14}/> {countdown}s countdown <span>·</span> {SESSION_SHOTS} shots</div>
          </div>
        </div>
        {cameraError && <div className="error-banner"><X size={16}/><span>{cameraError}</span></div>}
        <div className="notice-line"><span className="notice-icon"><Sparkles size={15}/></span><span>{notice}</span></div>
        <div className="lower-stats"><div className="stat-card"><div className="stat-icon"><Images size={17}/></div><div><strong>{gallery.length.toString().padStart(2, '0')}</strong><span>SESSIONS THIS RUN</span></div></div><div className="stat-card"><div className="stat-icon"><Printer size={17}/></div><div><strong>4 × 6 in</strong><span>PRINT FORMAT</span></div></div><div className="stat-card"><div className="stat-icon"><Wifi size={17}/></div><div><strong>Local</strong><span>NO CLOUD REQUIRED</span></div></div></div>
      </section>

      <aside className="side-column">
        <div className="panel frame-panel"><div className="panel-heading"><div><div className="eyebrow">DESIGN YOUR STRIP</div><h2>Choose a frame</h2></div><Sparkles size={17} className="muted-icon"/></div><p className="panel-desc">A look that matches your event.</p>
          <div className="frame-grid">{FRAMES.map((option) => <button key={option.id} className={`frame-option ${frameId === option.id ? 'selected' : ''}`} onClick={() => setFrameId(option.id)}><div className="frame-thumb" style={{ '--frame-color': option.color, '--frame-bg': option.background }}><div className="mini-photo"></div><div className="mini-photo"></div><div className="mini-photo"></div><div className="mini-caption">BOOTHFORGE</div></div><div className="frame-name">{option.name}{frameId === option.id && <Check size={13}/>}</div></button>)}</div>
          <label className="field-label" htmlFor="label">PHOTO STRIP CAPTION</label><input id="label" className="text-input" value={label} maxLength={42} onChange={(event) => setLabel(event.target.value)} placeholder="Your event name"/>
        </div>
        <div className="panel camera-panel"><div className="panel-heading"><div><div className="eyebrow">HARDWARE</div><h2>Camera setup</h2></div><Camera size={17} className="muted-icon"/></div>
          <label className="field-label" htmlFor="camera-select">VIDEO INPUT</label><div className="select-wrap"><select id="camera-select" value={deviceId} onChange={(event) => { setDeviceId(event.target.value); if (cameraState === 'live') startCamera(event.target.value); }}><option value="">Default camera</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select><ChevronDown size={15}/></div>
          <div className="camera-actions"><button className="secondary-button" onClick={() => refreshDevices()}><RefreshCw size={14}/> Refresh devices</button><button className="secondary-button" onClick={() => cameraState === 'live' ? stopCamera() : startCamera()}>{cameraState === 'live' ? <X size={14}/> : <Camera size={14}/>} {cameraState === 'live' ? 'Disconnect' : 'Connect'}</button></div>
          <div className="hardware-note"><span className="note-bullet"></span><span>USB webcams work directly. Many DSLRs need manufacturer tethering software or a clean HDMI capture card to appear as a video input.</span></div>
        </div>
        <div className="panel phone-panel"><div className="panel-heading"><div><div className="eyebrow">WIRELESS CAMERA</div><h2>Use your phone</h2></div><Smartphone size={17} className="muted-icon"/></div><p className="panel-desc">Connect your phone to the same Wi-Fi, scan this QR code, then take three photos. They will be sent to the booth automatically.</p>{phoneUrl ? <div className="qr-layout"><div className="qr-tile"><QRCodeSVG value={phoneUrl} size={132} bgColor="#ffffff" fgColor="#171320" level="M" includeMargin/></div><div className="qr-details"><strong>Scan to connect</strong><span>{phoneUrl}</span><button className="secondary-button" onClick={() => navigator.clipboard?.writeText(phoneUrl)}><QrCode size={14}/> Copy phone link</button></div></div> : <div className="hardware-note"><span className="note-bullet"></span><span>Phone sharing starts when the desktop app is running.</span></div>}<div className="hardware-note"><span className="note-bullet"></span><span>Phone capture opens the phone camera picker (not a continuous live preview). Keep both devices on the same private Wi-Fi network.</span></div></div>
        <div className="panel output-panel"><div className="panel-heading"><div><div className="eyebrow">SESSION OUTPUT</div><h2>Latest photo strip</h2></div><FolderOpen size={17} className="muted-icon"/></div>
          {result ? <><div className="result-preview"><img src={result} alt="Latest photo strip"/></div><div className="output-actions"><button className="primary-button small" onClick={() => savePhoto()}><Download size={15}/> Save PNG</button><button className="print-button" onClick={() => printPhoto()}><Printer size={15}/> Print</button></div>{guestUrl && <div className="guest-share"><div className="qr-tile guest-qr"><QRCodeSVG value={guestUrl} size={108} bgColor="#ffffff" fgColor="#171320" level="M" includeMargin/></div><div><strong>Guest download QR</strong><p>Guests scan this code on the same Wi-Fi to view and download this photo.</p><button className="secondary-button" onClick={() => navigator.clipboard?.writeText(guestUrl)}><QrCode size={14}/> Copy guest link</button></div></div>}</> : <div className="empty-result"><div className="empty-stack"><div></div><div></div><div></div></div><strong>No finished strip yet</strong><span>Complete a photo session to see your layout here.</span></div>}
          {lastSaved && <button className="saved-path" onClick={() => window.boothAPI?.openFolder(lastSaved.substring(0, lastSaved.lastIndexOf('\\')))}><FolderOpen size={13}/> Open saved folder</button>}
        </div>
        {gallery.length > 0 && <div className="panel gallery-panel"><div className="panel-heading"><div><div className="eyebrow">RECENT</div><h2>Session gallery</h2></div><button className="clear-button" onClick={() => setGallery([])} title="Clear session gallery"><Trash2 size={14}/></button></div><div className="gallery-list">{gallery.map((item) => <button className="gallery-item" key={item.id} onClick={() => setResult(item.image)}><img src={item.image} alt="Previous session"/><span>{item.date}</span><ChevronDown size={14}/></button>)}</div></div>}
      </aside>
    </main>
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><div className="settings-modal" onClick={(event) => event.stopPropagation()}><div className="modal-title"><div><div className="eyebrow">PREFERENCES</div><h2>Studio settings</h2></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={17}/></button></div><label className="field-label" htmlFor="countdown-select">COUNTDOWN LENGTH</label><div className="select-wrap"><select id="countdown-select" value={countdown} onChange={(event) => setCountdown(Number(event.target.value))}><option value={3}>3 seconds</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select><ChevronDown size={15}/></div><label className="auto-print-setting"><input type="checkbox" checked={autoPrint} onChange={(event) => setAutoPrint(event.target.checked)}/><span><strong>Open print dialog after each session</strong><small>Choose printer and confirm each print in Windows.</small></span></label><div className="hardware-note settings-note"><span className="note-bullet"></span><span>The print dialog opens after each session when enabled. Select your printer and paper settings there.</span></div><button className="primary-button full" onClick={() => setShowSettings(false)}><Check size={15}/> Done</button></div></div>}
    <footer className="footer"><span>© 2026 BOOTHFORGE STUDIO</span><span>BUILT FOR REAL-WORLD EVENTS <span className="footer-dot">●</span> VERSION 1.0.0</span></footer>
  </div>;
}
