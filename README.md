# BoothForge Photo Booth

An original-brand, offline-first Windows photo booth starter built with Electron, React and Vite. It includes live camera preview, a 3-shot countdown session, four frame themes, photo-strip composition, PNG saving, a recent-session gallery and a Windows print dialog.

> This is a practical starter project, not a feature-complete replacement for commercial photo booth software. Test with your camera and printer before using it at a paid event.

## Requirements

- Windows 10/11 (64-bit recommended)
- Node.js 20 LTS or newer (npm included)
- A webcam, or a DSLR that Windows exposes as a video input
- A printer installed in Windows for printing

## Run it in development

1. Install Node.js from <https://nodejs.org/>.
2. Extract this ZIP to a writable folder, for example `C:\Projects\BoothForge`.
3. Open PowerShell in that folder.
4. Install packages:

   ```powershell
   npm install
   ```

5. Start the app:

   ```powershell
   npm run dev
   ```

The Vite development server starts and Electron opens the desktop app. The first run may take a few minutes while npm downloads dependencies.

## Build a Windows installer

Run in PowerShell on Windows:

```powershell
npm install
npm run dist:win
```

The installer should be created under `release\BoothForge-Setup-1.0.0.exe`. Windows packaging is best performed on Windows itself. Code signing is not configured, so SmartScreen may show an unknown-publisher warning during testing.

## First session

1. Click **Connect camera** and allow camera access if Windows asks.
2. Choose a camera from **Camera setup**. Click **Refresh devices** if you connect one after opening the app.
3. Pick a frame and edit the photo-strip caption.
4. Click **Start Photo Session**. The app captures three photos using the selected countdown.
5. Use **Save PNG** to choose where to save the finished strip.
6. By default, the Windows print dialog opens automatically after the session. Select the printer and check paper size/orientation before confirming. Turn this off in Studio settings if you prefer manual printing. You can also use **Print** on the latest strip.

Photos are composed locally in the renderer. The app does not upload images to a server.

## DSLR support notes

The current version supports cameras that appear to Windows/Electron as a standard video input (for example, a USB webcam or a DSLR connected through a compatible HDMI capture card). Some DSLR models can appear through the manufacturer's webcam utility. Native tethered capture, remote shutter control, camera-specific live-view controls, and direct SDK integration are **not included** yet; those require a model-specific integration and testing against the camera manufacturer's SDK/license terms.

## Printing notes

The print action opens the Windows print dialog and lays out the composed strip on a 4 × 6 inch page. Automatic printing means the dialog opens after a session; a person still confirms the job in Windows. Choose a compatible printer, paper, borderless option and scaling in the dialog. Driver settings vary by printer. This version does not silently send jobs to a printer, maintain a print queue, or guarantee exact physical dimensions across every driver.

## Project structure

```text
boothforge/
  electron/
    main.cjs       # Window creation, file saving, print IPC
    preload.cjs    # Narrow, context-isolated desktop API
  src/
    App.jsx        # Photo booth workflow and UI
    main.jsx       # React entry point
    styles.css     # Dark professional interface
  index.html
  package.json
  vite.config.js
```

## Troubleshooting

- **Camera list is empty:** Connect the camera, click Refresh devices, and check Windows Settings → Privacy & security → Camera. Close Zoom/Teams/other apps that may own the camera.
- **Black preview:** Try another video input, unplug/reconnect the camera, then restart the app. HDMI capture cards may need their own driver.
- **DSLR not listed:** Install the manufacturer's webcam/tethering utility or use a compatible HDMI capture card. Native USB tethering is not implemented in this starter.
- **No print or wrong crop:** Verify the Windows printer test page first, then select 4 × 6 inch paper and review scaling/borderless settings in the print dialog.
- **npm install errors:** Install a current Node.js LTS version and retry `npm install`. If Windows reports a locked file, close the app and retry from a local folder.

## GitHub

Create a new empty GitHub repository, extract the ZIP, then run:

```powershell
git init
git add .
git commit -m "Initial BoothForge photo booth app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the repository URL with your own. `node_modules/`, `dist/`, and `release/` should not be committed; use the included `.gitignore`.

## Phone webcam over the same Wi-Fi

BoothForge starts a local HTTPS camera/sharing server on port `4318` while the desktop app is open. The phone can act as a live camera source inside BoothForge (it is not registered as a system-wide Windows webcam).

1. Connect the booth PC and phone to the same private Wi-Fi network.
2. In BoothForge, open **Use your phone** and scan the QR code.
3. If your phone shows a certificate warning, continue only if the address exactly matches the one displayed by BoothForge and you are on your own trusted Wi-Fi. The certificate is generated locally by the app and is not publicly trusted.
4. Tap **Connect camera** on the phone page and allow camera permission.
5. Back on the PC, click **Use phone as webcam**. The live preview should appear in the BoothForge viewfinder. Keep the phone page open and screen awake while capturing.

The phone sends compressed preview frames over the local network; this is a practical low-latency preview rather than a high-bitrate professional camera feed. Camera access depends on the phone browser allowing `getUserMedia()` on the locally generated HTTPS certificate. Some iOS/Android browser versions or managed devices may refuse it; in that case use the phone's **Take a photo** workflow or a dedicated virtual-webcam app. The phone camera works as a BoothForge input, not as a webcam for other Windows apps. Windows Firewall may ask to allow private-network access. Do not port-forward this port to the internet.

## Guest QR download

After a photo strip is created, the app publishes a local download page and shows a **Guest download QR** beneath the result. Guests scan it on the same Wi-Fi to view and download the PNG. The sharing server runs only while BoothForge is open, and links are intended for people on the same trusted local network. Keep the PC and phone on a private network; do not port-forward port `4318` to the internet. Windows Firewall may ask permission to allow the app on private networks.

Guest photos are kept in the app's in-memory share list for the current run. Closing BoothForge ends the local sharing server, so QR links stop working after the app closes.

## Custom strip designer

The design panel lets you choose between a vertical strip and a two-column grid, and set the number of photos per session from 1 to 6. These choices apply to both the built-in camera and the phone camera upload workflow.

- **Background artwork:** Upload a JPG, PNG, or WebP image. It is drawn behind the photo slots on the final strip. High-resolution artwork is recommended; the image is cropped to fill the canvas.
- **Photo frame overlay:** Upload a transparent PNG or WebP frame designed for the photo slot aspect ratio. The frame is drawn over each captured photo. Use transparency in the center so the photo remains visible.
- **Caption:** Edit the caption field above the design controls; it appears at the bottom of the finished strip.

Uploaded artwork and freeform holder positions are currently kept in app memory for the current run; re-upload artwork and recreate the layout after restarting BoothForge. The custom canvas supports up to 12 draggable photo holders. The holder count controls the capture count; each photo is center-cropped into its corresponding holder when the final strip is composed.


## Custom layout templates and canvas orientation

In **Design Your Strip**, choose **Portrait (2:3)** or **Landscape (3:2)** under Canvas Orientation. The exported PNG is rendered at 900 × 1350 px for portrait or 1350 × 900 px for landscape. Photo holders retain percentage-based positions when switching orientation, so you can rearrange them to fit the new canvas.

To reuse a design, enter a template name and choose **Save layout**. Use **Load saved layout** to restore its orientation, photo-holder positions and sizes, caption, frame style, background artwork, and photo-frame overlay. Saved templates are stored locally in this Windows user profile using browser local storage; they do not sync to other computers. Large uploaded images can exceed the local storage limit, so use reasonably sized artwork files.
