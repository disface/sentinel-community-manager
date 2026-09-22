import { app, BrowserWindow, Tray, Menu, Notification, ipcMain, dialog, shell, powerMonitor, nativeImage, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { StoreService } from './store-service';
import { VkService } from './vk-service';
import { ActivityEvent, AppConfig, QuickTemplate, VKMessage } from './types';

// Встроенная высококонтрастная иконка трея (щит Sentinel в сине-индиго оттенке)
const TRAY_ICON_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA10lEQVR4nO2XSQ7CMAxFbasrLkKPyA3giL0IbI1gFVE78RSxaP8uauL/YqcZAE4lxcycGY+zjBDRFHvxGK2PlxlAi/MLhtpAj5lF2+0iAhD8WXQCwNFLsFSs7MxfQxXmUnsqwKaYRSAIkspuWJQFiKY+BbAqs45kgyIAklm0FNg7xaoOpLZMw8MImw7Z+o7MRYBKiJG5ClABYTHvAmQgrObf75HrVW9xeszNABKIBOE1/8i1D/RKEjEPixtd78+26X4jYAZiFywwc4oC7O73s9M+62kGh9cb1uNwCV65vK4AAAAASUVORK5CYII=';

// 1. ИСТИННАЯ ПОРТАТИВНОСТЬ: настройка путей строго до whenReady()
const isPortableExe = !!process.env.PORTABLE_EXECUTABLE_DIR;
const appRoot = isPortableExe
  ? process.env.PORTABLE_EXECUTABLE_DIR!
  : (app.isPackaged ? path.dirname(process.execPath) : process.cwd());

const userDataPath = path.join(appRoot, 'data');
const sessionDataPath = path.join(userDataPath, 'session');
const crashesPath = path.join(userDataPath, 'crashes');
const logsPath = path.join(userDataPath, 'logs');
let effectiveRoot = appRoot;
try {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  fs.accessSync(userDataPath, fs.constants.W_OK);
  // Перенаправляем системные пути Electron в локальный каталог data
  app.setPath('appData', userDataPath);
  app.setPath('userData', userDataPath);
  app.setPath('sessionData', sessionDataPath);
  app.setPath('crashDumps', crashesPath);
  app.setPath('logs', logsPath);
} catch (e) {
  console.warn('[Main] data/ недоступна для записи, fallback на системный userData:', e);
  effectiveRoot = app.getPath('userData');
}

// AppUserModelId для Windows 10/11 Toast notifications
app.setAppUserModelId('com.sentinel.communitymanager');

// 2. БЛОКИРОВКА ПАРАЛЛЕЛЬНЫХ КОПИЙ (Single Instance Lock)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Main] Вторая копия SCM обнаружена, завершаем процесс.');
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

let storeService: StoreService;
let config: AppConfig;
let vkService: VkService;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (vkService) {
    vkService.stop();
  }
});

function getIconPath(): string {
  const candidates = [
    path.join(process.resourcesPath, 'icon.ico'),
    path.join(process.resourcesPath, 'build/icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../../build/icon.ico'),
    path.join(appRoot, 'build/icon.ico'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const iconPng = path.join(__dirname, '../build/icon.png');
  if (fs.existsSync(iconPng)) return iconPng;
  return '';
}

function setupSession() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    if (/(^|\.)vk(video)?\.(com|ru)\//.test(details.url) && /video_ext\.php/.test(details.url)) {
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['X-Frame-Options'];
    }
    responseHeaders['Content-Security-Policy'] = [
      "default-src 'self' file: data:; " +
      "img-src 'self' file: data: https: blob:; " +
      "media-src 'self' file: data: https: blob:; " +
      "frame-src https://vk.com https://*.vk.com https://*.vkvideo.ru; " +
      "connect-src 'self' https://api.vk.com https://*.vk.com; " +
      "style-src 'self' 'unsafe-inline'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    ];
    callback({ cancel: false, responseHeaders });
  });
}

function createWindow() {
  const isHiddenLaunch = process.argv.includes('--hidden');
  const iconPath = getIconPath();

  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0a0d14',
    title: 'Sentinel Community Manager',
    autoHideMenuBar: true,
    show: false,
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!isHiddenLaunch) {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  if (!isHiddenLaunch) {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }, 1200);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocalFile = url.startsWith('file://');
    const isDev = process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL);
    if (!isLocalFile && !isDev) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.webContents.on('will-attach-webview', (e) => e.preventDefault());

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  const htmlPath = path.join(__dirname, '../dist/index.html');

  if (app.isPackaged) {
    mainWindow.loadFile(htmlPath);
  } else if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (fs.existsSync(htmlPath)) {
    mainWindow.loadFile(htmlPath);
  } else {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow?.loadFile(htmlPath);
    });
  }
}

let currentUnreadCount = 0;
let baseTrayIcon: Electron.NativeImage | null = null;
let unreadTrayIcon: Electron.NativeImage | null = null;

function getTargetExePath(): string {
  if (process.env.PORTABLE_EXECUTABLE_FILE && fs.existsSync(process.env.PORTABLE_EXECUTABLE_FILE)) {
    return process.env.PORTABLE_EXECUTABLE_FILE;
  }
  return process.execPath;
}

function updateAutoLaunch(enabled: boolean) {
  const targetExe = getTargetExePath();

  if (process.platform === 'win32') {
    const regKeyName = 'Sentinel Community Manager';

    // Очищаем старые ключи если были
    execFile('reg.exe', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'com.sentinel.communitymanager', '/f'], () => {});
    execFile('reg.exe', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'SentinelCM', '/f'], () => {});

    if (enabled) {
      const regValue = `"${targetExe}" --hidden`;
      execFile('reg.exe', [
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        '/v', regKeyName,
        '/t', 'REG_SZ',
        '/d', regValue,
        '/f',
      ], (err) => {
        if (err) console.warn('[AutoLaunch] reg add error:', err);
      });
    } else {
      execFile('reg.exe', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', regKeyName, '/f'], () => {});
    }

    try {
      app.setLoginItemSettings({ openAtLogin: false });
    } catch {}
  } else {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true,
      });
    } catch (err) {
      console.warn('[AutoLaunch] app.setLoginItemSettings error:', err);
    }
  }
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: currentUnreadCount > 0 ? `🔔 Непрочитанных: ${currentUnreadCount}` : (config.groupName ? `🛡️ ${config.groupName}` : 'Sentinel Community Manager'),
      enabled: false,
    },
    { type: 'separator' },
    {
      label: mainWindow?.isVisible() ? 'Скрыть окно' : 'Открыть SCM',
      click: () => toggleWindow(),
    },
    {
      label: '🔕 Не беспокоить (DND)',
      type: 'checkbox',
      checked: config.dndMode,
      click: (item) => {
        config = storeService.saveConfig({ dndMode: item.checked });
        mainWindow?.webContents.send('dnd-mode:changed', config.dndMode);
        updateTrayMenu();
      },
    },
    {
      label: 'Звук уведомлений',
      type: 'checkbox',
      checked: config.soundEnabled,
      click: (item) => {
        config = storeService.saveConfig({ soundEnabled: item.checked });
      },
    },
    {
      label: 'Автозапуск с Windows',
      type: 'checkbox',
      checked: config.autoLaunch,
      click: (item) => {
        config = storeService.saveConfig({ autoLaunch: item.checked });
        updateAutoLaunch(config.autoLaunch);
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Выход из программы',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createUnreadBadgeIcon(base: Electron.NativeImage): Electron.NativeImage {
  try {
    const resized = base.resize({ width: 32, height: 32 });
    const bmp = Buffer.from(resized.toBitmap());
    const cx = 25;
    const cy = 25;
    const innerRadius = 5.5;
    const outerRadius = 6.8;

    for (let y = 17; y < 32; y++) {
      for (let x = 17; x < 32; x++) {
        const dist = Math.hypot(x - cx, y - cy);
        const idx = (y * 32 + x) * 4;
        if (dist <= innerRadius) {
          bmp[idx] = 0x44;     // B
          bmp[idx + 1] = 0x44; // G
          bmp[idx + 2] = 0xEF; // R
          bmp[idx + 3] = 0xFF; // A
        } else if (dist <= outerRadius) {
          bmp[idx] = 0xFF;     // B
          bmp[idx + 1] = 0xFF; // G
          bmp[idx + 2] = 0xFF; // R
          bmp[idx + 3] = 0xFF; // A
        }
      }
    }
    return nativeImage.createFromBitmap(bmp, { width: 32, height: 32 });
  } catch (e) {
    console.warn('[Tray] Badge creation fallback:', e);
    return base;
  }
}

function getTrayIcon(): Electron.NativeImage {
  try {
    const localIco = path.join(userDataPath, 'tray.ico');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    if (!fs.existsSync(localIco)) {
      const candidates = [
        path.join(process.resourcesPath, 'icon.ico'),
        path.join(process.resourcesPath, 'build/icon.ico'),
        path.join(__dirname, '../build/icon.ico'),
        path.join(__dirname, '../../build/icon.ico'),
        path.join(appRoot, 'build/icon.ico'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          const buf = fs.readFileSync(c);
          fs.writeFileSync(localIco, buf);
          break;
        }
      }
    }
    if (fs.existsSync(localIco)) {
      const nImg = nativeImage.createFromPath(localIco);
      if (!nImg.isEmpty()) {
        return nImg;
      }
    }
  } catch (e) {
    console.warn('Tray icon file error:', e);
  }

  const img = nativeImage.createFromDataURL(TRAY_ICON_B64);
  return img.resize({ width: 16, height: 16 });
}

function updateTrayBadge(count: number) {
  currentUnreadCount = Math.max(0, count);
  if (!tray) return;

  if (!baseTrayIcon) {
    baseTrayIcon = getTrayIcon();
  }
  if (!unreadTrayIcon && baseTrayIcon) {
    unreadTrayIcon = createUnreadBadgeIcon(baseTrayIcon);
  }

  if (currentUnreadCount > 0) {
    if (unreadTrayIcon) {
      tray.setImage(unreadTrayIcon);
    }
    tray.setToolTip(`Sentinel Community Manager: ${currentUnreadCount} непрочитанных сообщений/событий`);
  } else {
    if (baseTrayIcon) {
      tray.setImage(baseTrayIcon);
    }
    tray.setToolTip(config.groupName ? `SCM — ${config.groupName}` : 'Sentinel Community Manager');
  }

  updateTrayMenu();
}

function createTray() {
  try {
    baseTrayIcon = getTrayIcon();
    unreadTrayIcon = createUnreadBadgeIcon(baseTrayIcon);

    tray = new Tray(baseTrayIcon);
    tray.setToolTip(config.groupName ? `SCM — ${config.groupName}` : 'Sentinel Community Manager');

    tray.on('click', () => {
      toggleWindow();
    });

    tray.on('double-click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    updateTrayMenu();
  } catch (err) {
    console.error('[Tray] Init error:', err);
  }
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    if (mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.focus();
    }
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
  updateTrayMenu();
}

function setupVkEvents() {
  vkService.on('message_new', async ({ message, user }: { message: VKMessage; user: any }) => {
    mainWindow?.webContents.send('vk:message_new', { message, user });

    if (config.dndMode) return;

    const senderName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Пользователь';
    const previewText = message.text || (message.attachments?.length ? '[Вложение]' : 'Новое сообщение');

    let notifIcon: Electron.NativeImage | string | undefined = getIconPath() || undefined;
    if (user?.photo_100) {
      try {
        const resp = await fetch(user.photo_100);
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          const img = nativeImage.createFromBuffer(buf);
          if (!img.isEmpty()) {
            notifIcon = img;
          }
        }
      } catch {}
    }

    const notif = new Notification({
      title: `💬 ${senderName}`,
      body: previewText,
      silent: !config.soundEnabled,
      icon: notifIcon,
    });

    notif.on('click', () => {
      if (mainWindow) {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('vk:open-chat', message.peer_id);
      }
    });

    notif.show();
  });

  vkService.on('message_reply', ({ message }: { message: VKMessage }) => {
    mainWindow?.webContents.send('vk:message_reply', { message });
  });

  vkService.on('message_edit', ({ message }: { message: VKMessage }) => {
    mainWindow?.webContents.send('vk:message_edit', { message });
  });

  vkService.on('message_read', (data: any) => {
    mainWindow?.webContents.send('vk:message_read', data);
  });

  vkService.on('message_reaction', (data: any) => {
    mainWindow?.webContents.send('vk:reaction-event', data);
  });

  vkService.on('activity', (event: ActivityEvent) => {
    storeService.addActivityEvent(event);
    mainWindow?.webContents.send('vk:activity', event);

    if (config.dndMode) return;

    if (event.type === 'join') {
      new Notification({
        title: '🟢 Новый подписчик',
        body: `${event.userName} вступил в сообщество!`,
        silent: true,
      }).show();
    }
  });

  vkService.on('network-status', (status: any) => {
    mainWindow?.webContents.send('vk:network-status', status);
  });
}

powerMonitor.on('suspend', () => {
  console.log('[Power] ПК переходит в сон. Останавливаем Long Poll...');
  if (vkService) vkService.stop();
});

powerMonitor.on('resume', () => {
  console.log('[Power] ПК проснулся. Возобновляем работу Long Poll...');
  if (vkService) vkService.onSystemResume();
});

function setupIpcHandlers() {
  ipcMain.handle('config:get', () => storeService.getConfigForRenderer());
  ipcMain.handle('config:save', (_, newCfg: Partial<AppConfig>) => {
    config = storeService.saveConfig(newCfg);
    if (newCfg.autoLaunch !== undefined) {
      updateAutoLaunch(config.autoLaunch);
    }
    if (config.token) {
      vkService.updateCredentials(config.groupId, config.token);
    }
    updateTrayMenu();
    return storeService.getConfigForRenderer();
  });

  ipcMain.handle('community:validate', async (_, groupIdOrScreenName: string, token: string) => {
    try {
      let cleanInput = String(groupIdOrScreenName).trim();
      // Очистка от https://vk.com/ и подобных префиксов
      cleanInput = cleanInput.replace(/^https?:\/\/vk\.com\//, '').replace(/^club/, '').replace(/^public/, '');

      const query = new URLSearchParams({
        access_token: token.trim(),
        v: '5.199',
        group_ids: cleanInput,
        fields: 'members_count,status,is_admin,admin_level,screen_name',
      });

      const res = await fetch(`https://api.vk.com/method/groups.getById?${query.toString()}`);
      if (!res.ok) {
        return { success: false, error: `Сетевая ошибка HTTP ${res.status}` };
      }

      const json = await res.json();
      if (json.error) {
        return { success: false, error: `VK API Error: ${json.error.error_msg} (код ${json.error.error_code})` };
      }

      const groups = json.response?.groups || json.response;
      const grp = groups?.[0];
      if (!grp) {
        return { success: false, error: 'Сообщество с указанным ID/ссылкой не найдено.' };
      }

      // Проверка: личный профиль или сообщество?
      // groups.getById возвращает сообщества. Если тип страницы 'group', 'page', 'event' - всё ок.
      return {
        success: true,
        group: {
          id: grp.id,
          name: grp.name,
          screen_name: grp.screen_name,
          photo_100: grp.photo_100,
          photo_200: grp.photo_200,
          type: grp.type,
          is_admin: grp.is_admin,
          members_count: grp.members_count,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message || 'Ошибка соединения с VK' };
    }
  });

  ipcMain.handle('group:get-info', async () => {
    try {
      return await vkService.getGroupInfo();
    } catch (e: any) {
      return { error: e.message };
    }
  });

  ipcMain.handle('templates:get', () => storeService.getTemplates());
  ipcMain.handle('templates:save', (_, tpls: QuickTemplate[]) => storeService.saveTemplates(tpls));

  // Activity Feed IPC
  ipcMain.handle('activity:get', () => storeService.loadActivity());
  ipcMain.handle('activity:mark-read', (_, ts?: number) => storeService.markActivityRead(ts));
  ipcMain.handle('activity:clear', () => storeService.clearActivity());

  ipcMain.handle('messages:get-conversations', async (_, offset, count) => {
    return await vkService.getConversations(offset, count);
  });

  ipcMain.handle('messages:get-history', async (_, peerId, count, offset) => {
    return await vkService.getHistory(peerId, count, offset);
  });

  ipcMain.handle('messages:send', async (_, peerId, text, attachment, replyTo) => {
    return await vkService.sendMessage(peerId, text, attachment, replyTo);
  });

  ipcMain.handle('messages:send-sticker', async (_, peerId, stickerId) => {
    return await vkService.sendSticker(peerId, stickerId);
  });

  ipcMain.handle('messages:edit', async (_, peerId, cmid, text, messageId) => {
    return await vkService.editMessage(peerId, cmid, text, messageId);
  });

  ipcMain.handle('messages:delete', async (_, peerId, cmid, messageId) => {
    return await vkService.deleteMessage(peerId, cmid, messageId);
  });

  ipcMain.handle('peer:get-status', async (_, peerId: number) => {
    return await vkService.getPeerStatus(peerId);
  });

  ipcMain.handle('messages:mark-as-read', async (_, peerId) => {
    return await vkService.markAsRead(peerId);
  });

  ipcMain.handle('user:ban', async (_, userId: number, comment?: string) => {
    return await vkService.banUser(userId, comment);
  });

  ipcMain.handle('messages:delete-conversation', async (_, peerId: number) => {
    return await vkService.deleteConversation(peerId);
  });

  ipcMain.handle('messages:send-reaction', async (_, peerId: number, cmid: number, reactionId: number) => {
    return await vkService.sendReaction(peerId, cmid, reactionId);
  });

  ipcMain.handle('messages:delete-reaction', async (_, peerId: number, cmid: number) => {
    return await vkService.deleteReaction(peerId, cmid);
  });

  ipcMain.on('tray:set-badge', (_, count: number) => {
    updateTrayBadge(count);
  });

  ipcMain.handle('media:upload', async (_, peerId, filePath) => {
    return await vkService.uploadAttachment(peerId, filePath);
  });

  ipcMain.handle('media:send-voice', async (_, peerId, audioBuffer: ArrayBuffer) => {
    return await vkService.sendVoiceMessage(peerId, Buffer.from(audioBuffer));
  });

  ipcMain.handle('user:get-details', async (_, userId: number) => {
    return await vkService.getUserDetails(userId);
  });

  ipcMain.handle('dialog:select-file', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите изображение для отправки в чат',
      properties: ['openFile'],
      filters: [
        { name: 'Изображения (*.jpg, *.jpeg, *.png, *.webp)', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
      ],
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('file:get-data-url', async (_, filePath: string) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      const ext = path.extname(filePath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      if (!isImage) return null;
      const buf = fs.readFileSync(filePath);
      const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle('dialog:select-folder', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: config.downloadDir,
    });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.handle('media:download-track', async (_, url: string, defaultFileName: string) => {
    if (!mainWindow) return null;
    const cleanName = defaultFileName.replace(/[/\\?%*:|"<>]/g, '_');
    const targetDir = config.downloadDir || app.getPath('downloads');
    const defaultPath = path.join(targetDir, cleanName);

    const saveRes = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [
        { name: 'Аудиофайл', extensions: ['mp3', 'wav', 'flac', 'ogg'] },
        { name: 'Все файлы', extensions: ['*'] },
      ],
    });

    if (saveRes.canceled || !saveRes.filePath) return null;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    const arrayBuf = await resp.arrayBuffer();
    fs.writeFileSync(saveRes.filePath, Buffer.from(arrayBuf));
    return saveRes.filePath;
  });

  ipcMain.handle('shell:open-external', (_, url) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
  });

  // Управление окном
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.hide();
  });
}

app.whenReady().then(() => {
  if (!gotTheLock) return;

  setupSession();

  storeService = new StoreService(effectiveRoot);
  config = storeService.getConfig();

  vkService = new VkService(config.groupId, config.token || '');

  setupIpcHandlers();
  setupVkEvents();
  createWindow();
  createTray();

  if (config.autoLaunch) {
    updateAutoLaunch(true);
  }

  if (config.token && config.groupId) {
    try {
      vkService.start();
    } catch (err) {
      console.error('[VkService] start error:', err);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // В Windows приложение продолжает работу в системном трее
  }
});
