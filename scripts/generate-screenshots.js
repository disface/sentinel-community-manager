const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();

const mode = process.env.SCM_SCREEN_MODE || 'main';
const outputDir = path.join(__dirname, '..', 'docs', 'screenshots');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    frame: true,
    backgroundColor: '#0a0d14',
    webPreferences: {
      preload: path.join(__dirname, 'mock-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
    }
  });

  win.webContents.on('console-message', (_, level, message) => {
    console.log('[Renderer Log]:', message);
  });
  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('[did-fail-load]:', desc);
  });

  const htmlPath = path.join(__dirname, '..', 'dist', 'index.html');
  await win.loadFile(htmlPath);

  // Allow React to mount and load initial state
  await new Promise(r => setTimeout(r, 1800));

  if (mode === 'main') {
    // Select first conversation to display full chat view
    await win.webContents.executeJavaScript(`
      const conv = document.querySelector('[data-peer-id="101"]') || document.querySelectorAll('div[class*="cursor-pointer"]')[0];
      if (conv) conv.click();
    `).catch(() => {});
    await new Promise(r => setTimeout(r, 1200));
  }

  const img = await win.webContents.capturePage();
  const filename = mode === 'onboarding' ? 'screenshot-onboarding.png' : 'screenshot-main.png';
  const targetPath = path.join(outputDir, filename);

  fs.writeFileSync(targetPath, img.toPNG());
  console.log(`[Screenshot] Successfully captured ${filename} (${img.toPNG().length} bytes) to ${targetPath}`);

  app.quit();
});
