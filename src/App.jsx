import { useCallback, useEffect, useRef, useState } from 'react';
import { Aperture, Camera, Check, ChevronDown, Clock3, Download, FolderOpen, Images, Printer, RefreshCw, Settings2, ShieldCheck, Sparkles, Trash2, Wifi, X, Smartphone, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const FRAMES = [
  { id: 'midnight', name: 'Midnight', color: '#a78bfa', background: '#171324' },
  { id: 'champagne', name: 'Champagne', color: '#e6c98e', background: '#201b15' },
  { id: 'neon', name: 'Neon Pop', color: '#5eead4', background: '#10201f' },
  { id: 'classic', name: 'Classic', color: '#f5f5f5', background: '#202124' }
];
const DEFAULT_SESSION_SHOTS = 3;

function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
function readImageFile(file, onLoad) { if (!file) return; if (!file.type.startsWith('image/')) return; const reader = new FileReader(); reader.onload = () => onLoad(String(reader.result)); reader.readAsDataURL(file); }

function makeCanvasPhoto(video, frame, label) {
  const canvas = document.createElement('canvas');
  const width = 1200;
  const height = 900;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = frame.background; ctx.fillRect(0, 0, width, height);
  const sourceWidth = video.videoWidth || video.naturalWidth;
  const sourceHeight = video.videoHeight || video.naturalHeight;
  const videoRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight;
  if (videoRatio > targetRatio) { sw = video.videoHeight * targetRatio; sx = (video.videoWidth - sw) / 2; }
  else { sh = video.videoWidth / targetRatio; sy = (video.videoHeight - sh) / 2; }
  ctx.save(); ctx.translate(width, 0); ctx.scale(-1, 1); ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height); ctx.restore();
  ctx.strokeStyle = frame.color; ctx.lineWidth = 24; ctx.strokeRect(16, 16, width - 32, height - 32);
  ctx.fillStyle = frame.background; ctx.fillRect(0, height - 76, width, 76);
  ctx.fillStyle = frame.color; ctx.font = '600 28px Arial'; ctx.textAlign = 'center';
  ctx.fillText(label || 'BOOTHFORGE • PHOTO BOOTH', width / 2, height - 29);
  return canvas;
}

async function composeStrip(photos, frame, design = {}) {
  // Percentage coordinates scale to the selected portrait or landscape canvas.
  const canvas = document.createElement('canvas');
  const landscape = design.orientation === 'landscape';
  canvas.width = landscape ? 1350 : 900; canvas.height = landscape ? 900 : 1350;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = frame.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (design.backgroundImage) {
    const bg = await loadImage(design.backgroundImage);
    const scale = Math.max(canvas.width / bg.width, canvas.height / bg.height);
    const bw = bg.width * scale, bh = bg.height * scale;
    ctx.drawImage(bg, (canvas.width - bw) / 2, (canvas.height - bh) / 2, bw, bh);
    ctx.fillStyle = 'rgba(10,8,15,0.08)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.strokeStyle = frame.color; ctx.lineWidth = 12; ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  const images = await Promise.all(photos.map(loadImage));
  const overlay = design.photoFrame ? await loadImage(design.photoFrame) : null;
  const holders = Array.isArray(design.holders) && design.holders.length ? design.holders : [
    { x: 12, y: 5, w: 76, h: 25 }, { x: 12, y: 36, w: 76, h: 25 }, { x: 12, y: 67, w: 76, h: 25 }
  ];
  holders.forEach((holder, index) => {
    if (!images.length) return;
    const x = holder.x / 100 * canvas.width, y = holder.y / 100 * canvas.height;
    const w = holder.w / 100 * canvas.width, h = holder.h / 100 * canvas.height;
    const img = images[index % images.length];
    // Fill each custom holder with a center-cropped photo.
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale, sh = h / scale;
    const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    if (overlay) ctx.drawImage(overlay, x, y, w, h);
    ctx.restore();
    if (!overlay) { ctx.strokeStyle = frame.color; ctx.lineWidth = 6; ctx.strokeRect(x, y, w, h); }
  });
  ctx.fillStyle = frame.color; ctx.textAlign = 'center'; ctx.font = 'bold 30px Arial';
  ctx.fillText(design.caption || 'BOOTHFORGE', canvas.width / 2, canvas.height - 48);
  return canvas.toDataURL('image/png');
}

const DEFAULT_HOLDERS = [
  { id: 1, x: 12, y: 5, w: 76, h: 25 },
  { id: 2, x: 12, y: 36, w: 76, h: 25 },
  { id: 3, x: 12, y: 67, w: 76, h: 25 }
];

export default function App() {
  const videoRef = useRef(null);
  const phoneImageRef = useRef(null);
  const phoneModeRef = useRef(false);
  const streamRef = useRef(null);
  const phoneShotBufferRef = useRef([]);
  const timerRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [frameId, setFrameId] = useState('midnight');
  const [sessionShots, setSessionShots] = useState(DEFAULT_SESSION_SHOTS);
  const [holders, setHolders] = useState(DEFAULT_HOLDERS);
  const [orientation, setOrientation] = useState('portrait');
  const [layoutName, setLayoutName] = useState('My event layout');
  const [savedLayouts, setSavedLayouts] = useState(() => { try { return JSON.parse(localStorage.getItem('boothforge-layouts') || '[]'); } catch { return []; } });
  const [selectedSavedLayout, setSelectedSavedLayout] = useState('');
  const [selectedHolderId, setSelectedHolderId] = useState(1);
  const [draggingHolder, setDraggingHolder] = useState(null);
  const designCanvasRef = useRef(null);
  const dragOriginRef = useRef(null);
  const [backgroundImage, setBackgroundImage] = useState('');
  const [photoFrameImage, setPhotoFrameImage] = useState('');
  const sessionShotsRef = useRef(DEFAULT_SESSION_SHOTS);
  const designRef = useRef({});
  const frameRef = useRef(FRAMES[0]);
  const autoPrintRef = useRef(true);
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
  const [phoneFrame, setPhoneFrame] = useState('');
  const [guestUrl, setGuestUrl] = useState('');
  const [phoneShots, setPhoneShots] = useState(0);
  const frame = FRAMES.find((f) => f.id === frameId) || FRAMES[0];
  useEffect(() => { sessionShotsRef.current = sessionShots; frameRef.current = frame; autoPrintRef.current = autoPrint; designRef.current = { holders, backgroundImage, photoFrame: photoFrameImage, caption: label, orientation }; }, [sessionShots, holders, backgroundImage, photoFrameImage, label, frame, autoPrint, orientation]);

  useEffect(() => {
    if (!draggingHolder) return;
    const onMove = (event) => {
      const canvas = designCanvasRef.current;
      const origin = dragOriginRef.current;
      if (!canvas || !origin) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (event.clientX - origin.clientX) / rect.width * 100;
      const dy = (event.clientY - origin.clientY) / rect.height * 100;
      setHolders((items) => items.map((item) => item.id === draggingHolder ? {
        ...item,
        x: Math.max(0, Math.min(100 - item.w, origin.x + dx)),
        y: Math.max(0, Math.min(100 - item.h, origin.y + dy))
      } : item));
    };
    const onUp = () => { setDraggingHolder(null); dragOriginRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [draggingHolder]);

  const addPhotoHolder = () => {
    if (holders.length >= 12) { setNotice('A custom strip can have up to 12 photo holders.'); return; }
    const id = Math.max(0, ...holders.map((item) => item.id)) + 1;
    const offset = (holders.length * 7) % 48;
    const next = [...holders, { id, x: 20 + offset / 3, y: 10 + offset, w: 60, h: 18 }];
    setHolders(next); setSelectedHolderId(id); setSessionShots(next.length);
    setNotice(`Added photo holder ${next.length}. Drag it into position and resize it below.`);
  };
  const removePhotoHolder = () => {
    if (holders.length <= 1) { setNotice('Keep at least one photo holder in your design.'); return; }
    const next = holders.filter((item) => item.id !== selectedHolderId);
    setHolders(next); setSelectedHolderId(next[0].id); setSessionShots(next.length);
    setNotice('Photo holder removed. Capture count updated to match your layout.');
  };
  const updateSelectedHolder = (key, value) => setHolders((items) => items.map((item) => item.id === selectedHolderId ? { ...item, [key]: value, x: key === 'w' ? Math.min(item.x, 100 - value) : item.x, y: key === 'h' ? Math.min(item.y, 100 - value) : item.y } : item));
  const startHolderDrag = (event, holder) => {
    event.preventDefault(); setSelectedHolderId(holder.id); setDraggingHolder(holder.id);
    dragOriginRef.current = { clientX: event.clientX, clientY: event.clientY, x: holder.x, y: holder.y };
  };

  const saveCustomLayout = () => {
    const name = layoutName.trim() || `Custom layout ${savedLayouts.length + 1}`;
    const entry = { id: `${Date.now()}`, name, orientation, holders, backgroundImage, photoFrameImage, caption: label, frameId };
    const next = [...savedLayouts.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), entry];
    setSavedLayouts(next); setSelectedSavedLayout(entry.id);
    try { localStorage.setItem('boothforge-layouts', JSON.stringify(next)); setNotice(`Saved “${name}” as a reusable layout.`); }
    catch { setNotice('Could not save this layout. The uploaded artwork may be too large for browser storage. Try smaller image files.'); }
  };
  const loadCustomLayout = (id) => {
    const entry = savedLayouts.find((item) => item.id === id);
    if (!entry) return;
    setLayoutName(entry.name); setOrientation(entry.orientation || 'portrait'); setHolders(entry.holders || DEFAULT_HOLDERS);
    setBackgroundImage(entry.backgroundImage || ''); setPhotoFrameImage(entry.photoFrameImage || ''); setLabel(entry.caption || '');
    setFrameId(entry.frameId || 'midnight'); setSessionShots((entry.holders || DEFAULT_HOLDERS).length);
    setSelectedHolderId((entry.holders || DEFAULT_HOLDERS)[0]?.id || 1); setSelectedSavedLayout(id);
    setNotice(`Loaded “${entry.name}”. You can edit it and save your changes.`);
  };
  const deleteCustomLayout = () => {
    const next = savedLayouts.filter((item) => item.id !== selectedSavedLayout);
    setSavedLayouts(next); localStorage.setItem('boothforge-layouts', JSON.stringify(next)); setSelectedSavedLayout('');
    setNotice('Saved layout deleted.');
  };
  const changeOrientation = (value) => {
    setOrientation(value);
    setNotice(`Canvas set to ${value}. Photo holders keep their relative positions; adjust them to fit the new canvas.`);
  };

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
    phoneModeRef.current = false;
    setPhoneFrame('');
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
    const unsubscribeFrame = window.boothAPI?.onPhoneFrame?.((dataUrl) => {
      if (phoneModeRef.current) { setPhoneFrame(dataUrl); setCameraState('phone-live'); }
    });
    const unsubscribe = window.boothAPI?.onPhonePhoto?.((dataUrl) => {
      const next = [...phoneShotBufferRef.current, dataUrl];
      phoneShotBufferRef.current = next;
      setPhoneShots((count) => count + 1);
      setShots(next);
      if (next.length >= sessionShotsRef.current) {
        phoneShotBufferRef.current = [];
        setShots([]);
        composeStrip(next.slice(0, sessionShotsRef.current), frameRef.current, designRef.current).then((strip) => {
          setResult(strip); setGallery((items) => [{ id: Date.now(), image: strip, date: new Date().toLocaleString() }, ...items].slice(0, 12));
          setNotice(autoPrintRef.current ? 'Phone photos received. Opening print dialog…' : 'Phone photos received. Save or print the finished strip.');
          if (autoPrintRef.current) printPhoto(strip);
        }).catch((error) => setNotice(`Could not compose phone photos: ${error.message}`));
      } else { setNotice(`Phone photo received (${next.length}/${sessionShotsRef.current}). Take ${sessionShotsRef.current - next.length} more photo(s) on your phone.`); }
    });
    return () => { stopCamera(); if (timerRef.current) clearTimeout(timerRef.current); if (unsubscribe) unsubscribe(); if (unsubscribeFrame) unsubscribeFrame(); };
  }, []); // intentional one-time setup

  useEffect(() => {
    if (cameraState === 'live' && videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraState]);

  const connectPhoneCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    phoneModeRef.current = true;
    setCameraError('');
    setCameraState('phone-connecting');
    setNotice('Scan the Phone Webcam QR code and tap Connect phone camera on your phone.');
  };
  const disconnectPhoneCamera = () => { phoneModeRef.current = false; setCameraState('idle'); setNotice('Phone camera disconnected.'); };

  const beginSession = () => {
    if (!['live', 'phone-live'].includes(cameraState)) { setNotice('Connect a camera before starting a session.'); return; }
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
        const video = phoneModeRef.current ? phoneImageRef.current : videoRef.current;
        const sourceWidth = video && (video.videoWidth || video.naturalWidth);
        if (!video || (!phoneModeRef.current && video.readyState < 2) || !sourceWidth) {
          setCapturing(false); setCount(null); setNotice('Camera is not ready. Please try again.'); return;
        }
        const photo = makeCanvasPhoto(video, frame, label).toDataURL('image/png');
        const next = [...existingShots, photo];
        setShots(next); setCount(null);
        if (shotIndex + 1 < sessionShots) {
          setNotice(`Photo ${shotIndex + 1} captured. Get ready for photo ${shotIndex + 2}.`);
          timerRef.current = setTimeout(() => takeShot(shotIndex + 1, next), 650);
        } else {
          composeStrip(next, frame, { holders, backgroundImage, photoFrame: photoFrameImage, caption: label, orientation }).then((strip) => { setResult(strip); setGallery((prev) => [{ id: Date.now(), image: strip, date: new Date().toLocaleString() }, ...prev].slice(0, 12));
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
      <div className="top-status"><span className={`status-dot ${['live','phone-live'].includes(cameraState) ? 'live' : ''}`}></span><span>{cameraState === 'live' ? 'CAMERA CONNECTED' : cameraState === 'phone-live' ? 'PHONE WEBCAM CONNECTED' : 'CAMERA NOT CONNECTED'}</span><span className="status-divider"></span><span className="offline"><ShieldCheck size={14}/> OFFLINE READY</span></div>
      <button className="icon-button" title="Settings" onClick={() => setShowSettings((value) => !value)}><Settings2 size={18}/></button>
    </header>

    <main className="workspace">
      <section className="studio-column">
        <div className="section-heading"><div><div className="eyebrow">LIVE STUDIO</div><h1>Capture the moment<span>.</span></h1><p>Make every session feel like an event.</p></div><div className="session-pill"><span className="pulse"></span> SESSION READY</div></div>
        <div className="preview-card">
          <div className="preview-top"><div className="preview-label"><span className="live-dot"></span> LIVE PREVIEW</div><div className="preview-tools"><span>HD</span><span>16:9 SENSOR</span></div></div>
          <div className="viewfinder" style={{ '--frame-color': frame.color, '--frame-bg': frame.background }}>
            <video ref={videoRef} muted playsInline className={cameraState === 'live' ? 'video-live' : 'video-hidden'} />
            {cameraState === 'phone-live' && phoneFrame && <img ref={phoneImageRef} src={phoneFrame} alt="Phone webcam live preview" className="video-live phone-video-live" />}
            {!['live','phone-live'].includes(cameraState) && <div className="camera-placeholder"><div className="placeholder-icon"><Camera size={34}/></div><h2>Your studio is waiting</h2><p>Connect a webcam or a DSLR that appears as a camera device.</p><button className="primary-button" onClick={() => startCamera()}><Camera size={16}/> Connect camera</button></div>}
            {['live','phone-live'].includes(cameraState) && <div className="viewfinder-frame"><span></span><span></span><span></span><span></span></div>}
            {count !== null && <div className="countdown-overlay"><div className="countdown-number">{count}</div><div className="countdown-caption">{count === 'SMILE' ? 'CAPTURE!' : 'GET READY'}</div></div>}
            <div className="preview-bottom"><span><span className="tiny-green"></span> {['live','phone-live'].includes(cameraState) ? (cameraState === 'phone-live' ? 'PHONE LIVE FEED' : 'LIVE FEED') : 'NO SIGNAL'}</span><span>{shots.length} / {sessionShots} SHOTS</span></div>
          </div>
          <div className="capture-controls">
            <div className="shot-progress">{Array.from({ length: sessionShots }, (_, n) => n).map((n) => <div key={n} className={`shot-dot ${shots.length > n ? 'done' : ''}`}>{shots.length > n ? <Check size={12}/> : n + 1}</div>)}</div>
            {!capturing ? <button className="capture-button" disabled={!['live','phone-live'].includes(cameraState)} onClick={beginSession}><span className="capture-inner"><Aperture size={22}/></span><span>START PHOTO SESSION</span></button> : <button className="cancel-button" onClick={cancelSession}><X size={16}/> CANCEL SESSION</button>}
            <div className="capture-meta"><Clock3 size={14}/> {countdown}s countdown <span>·</span> {sessionShots} shots</div>
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
          <div className="custom-layout-toolbar"><div><strong>FREEFORM PHOTO LAYOUT</strong><small>Drag each holder anywhere on the canvas. Select a holder to resize it.</small></div><button className="upload-button" onClick={addPhotoHolder}>＋ Add holder</button></div>
          <div className="canvas-setup-row">
            <div className="canvas-orientation"><label className="field-label" htmlFor="canvas-orientation">CANVAS ORIENTATION</label><select id="canvas-orientation" className="text-input" value={orientation} onChange={(event) => changeOrientation(event.target.value)}><option value="portrait">Portrait · 2:3</option><option value="landscape">Landscape · 3:2</option></select></div>
            <div className="canvas-size-note">{orientation === 'portrait' ? '900 × 1350 px' : '1350 × 900 px'}<small>Export resolution</small></div>
          </div>
          <div className="saved-layout-tools">
            <label className="field-label" htmlFor="layout-name">LAYOUT TEMPLATE NAME</label>
            <div className="saved-layout-name-row"><input id="layout-name" className="text-input" value={layoutName} onChange={(event) => setLayoutName(event.target.value)} placeholder="Wedding booth layout"/><button className="upload-button" onClick={saveCustomLayout}>Save layout</button></div>
            <div className="saved-layout-load-row"><select className="text-input" value={selectedSavedLayout} onChange={(event) => loadCustomLayout(event.target.value)}><option value="">Load saved layout…</option>{savedLayouts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.orientation || 'portrait'}</option>)}</select><button className="clear-design" disabled={!selectedSavedLayout} onClick={deleteCustomLayout} title="Delete selected saved layout"><Trash2 size={14}/></button></div>
            <small className="design-help">Layouts are saved on this computer, including uploaded background and frame artwork.</small>
          </div>
          <div className="layout-editor-wrap"><div className="layout-editor" ref={designCanvasRef} style={{ aspectRatio: orientation === 'portrait' ? '2 / 3' : '3 / 2', width: orientation === 'portrait' ? 'min(100%, 260px)' : '100%', maxWidth: orientation === 'landscape' ? '390px' : '260px', backgroundColor: frame.background, backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none', '--holder-color': frame.color }}>

            {holders.map((holder, index) => <button key={holder.id} className={`layout-holder ${selectedHolderId === holder.id ? 'selected' : ''}`} style={{ left: `${holder.x}%`, top: `${holder.y}%`, width: `${holder.w}%`, height: `${holder.h}%`, '--holder-color': frame.color }} onPointerDown={(event) => startHolderDrag(event, holder)} title={`Drag photo holder ${index + 1}`}><span>{index + 1}</span><small>PHOTO</small></button>)}
            <div className="layout-caption-preview">{label || 'EVENT CAPTION'}</div>
          </div></div>
          <div className="holder-tools"><div className="holder-tools-heading"><strong>Selected holder #{Math.max(1, holders.findIndex((item) => item.id === selectedHolderId) + 1)}</strong><button className="clear-design" onClick={removePhotoHolder} title="Remove selected holder"><Trash2 size={14}/></button></div>
          </div>
          <div className="design-controls">
            <div className="design-control"><label className="field-label" htmlFor="holder-width">HOLDER WIDTH · {Math.round(holders.find((item) => item.id === selectedHolderId)?.w || 60)}%</label><input id="holder-width" type="range" min="12" max="100" value={holders.find((item) => item.id === selectedHolderId)?.w || 60} onChange={(event) => updateSelectedHolder('w', Number(event.target.value))}/></div>
            <div className="design-control"><label className="field-label" htmlFor="holder-height">HOLDER HEIGHT · {Math.round(holders.find((item) => item.id === selectedHolderId)?.h || 20)}%</label><input id="holder-height" type="range" min="8" max="55" value={holders.find((item) => item.id === selectedHolderId)?.h || 20} onChange={(event) => updateSelectedHolder('h', Number(event.target.value))}/></div>
          </div>
          <p className="design-help">The number of photo holders controls how many photos the booth captures. Overlap holders for creative collages, or arrange them as a strip, grid, diagonal, or any custom composition.</p>
          <div className="upload-designs">
            <div className="upload-design-row"><div><strong>Background artwork</strong><small>{backgroundImage ? 'Custom background loaded' : 'Upload a JPG or PNG behind the strip'}</small></div><label className="upload-button" htmlFor="background-upload"><FolderOpen size={14}/> {backgroundImage ? 'Change' : 'Upload'}<input id="background-upload" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => readImageFile(event.target.files?.[0], setBackgroundImage)}/></label>{backgroundImage && <button className="clear-design" onClick={() => setBackgroundImage('')} title="Remove background"><X size={14}/></button>}</div>
            <div className="upload-design-row"><div><strong>Photo frame overlay</strong><small>{photoFrameImage ? 'Transparent frame loaded' : 'Upload a transparent PNG frame'}</small></div><label className="upload-button" htmlFor="frame-upload"><FolderOpen size={14}/> {photoFrameImage ? 'Change' : 'Upload'}<input id="frame-upload" type="file" accept="image/png,image/webp" onChange={(event) => readImageFile(event.target.files?.[0], setPhotoFrameImage)}/></label>{photoFrameImage && <button className="clear-design" onClick={() => setPhotoFrameImage('')} title="Remove frame"><X size={14}/></button>}</div>
            <p className="design-help">Use a transparent PNG for frames so the photo shows through. Uploaded designs are applied to new strips and phone-camera sessions.</p>
          </div>
        </div>
        <div className="panel camera-panel"><div className="panel-heading"><div><div className="eyebrow">HARDWARE</div><h2>Camera setup</h2></div><Camera size={17} className="muted-icon"/></div>
          <label className="field-label" htmlFor="camera-select">VIDEO INPUT</label><div className="select-wrap"><select id="camera-select" value={deviceId} onChange={(event) => { setDeviceId(event.target.value); if (cameraState === 'live') startCamera(event.target.value); }}><option value="">Default camera</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select><ChevronDown size={15}/></div>
          <div className="camera-actions"><button className="secondary-button" onClick={() => refreshDevices()}><RefreshCw size={14}/> Refresh devices</button><button className="secondary-button" onClick={() => cameraState === 'live' ? stopCamera() : startCamera()}>{cameraState === 'live' ? <X size={14}/> : <Camera size={14}/>} {cameraState === 'live' ? 'Disconnect' : 'Connect'}</button></div>
          <div className="hardware-note"><span className="note-bullet"></span><span>USB webcams work directly. Many DSLRs need manufacturer tethering software or a clean HDMI capture card to appear as a video input.</span></div>
        </div>
        <div className="panel phone-panel"><div className="panel-heading"><div><div className="eyebrow">WIRELESS CAMERA</div><h2>Use your phone</h2></div><Smartphone size={17} className="muted-icon"/></div><p className="panel-desc">Scan this QR code on the same Wi-Fi to use your phone as a live wireless camera inside BoothForge.</p>{phoneUrl ? <div className="qr-layout"><div className="qr-tile"><QRCodeSVG value={phoneUrl} size={132} bgColor="#ffffff" fgColor="#171320" level="M" includeMargin/></div><div className="qr-details"><strong>Scan to connect</strong><span>{phoneUrl}</span><button className="secondary-button" onClick={() => navigator.clipboard?.writeText(phoneUrl)}><QrCode size={14}/> Copy phone link</button></div></div> : <div className="hardware-note"><span className="note-bullet"></span><span>Phone sharing starts when the desktop app is running.</span></div>}<div className="camera-actions phone-webcam-actions"><button className="primary-button" onClick={connectPhoneCamera}><Smartphone size={15}/> Use phone as webcam</button><button className="secondary-button" onClick={disconnectPhoneCamera} disabled={!phoneModeRef.current}><X size={14}/> Disconnect phone</button></div><div className="hardware-note"><span className="note-bullet"></span><span>For live video, accept the phone browser's local certificate warning if shown, then tap Connect phone camera and allow camera permission. If your phone blocks local HTTPS camera access, the existing Take a photo workflow remains available.</span></div></div>
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
