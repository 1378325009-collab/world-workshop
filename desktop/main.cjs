const { app, BrowserWindow, dialog, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'worldworkshop',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: false
    }
  }
]);

app.setName('世界工坊');
app.setAppUserModelId('com.berkisland.worldworkshop');
app.setPath('userData', path.join(app.getPath('appData'), 'WorldWorkshop'));

const webRoot = path.resolve(__dirname, 'web');
const appOrigin = 'worldworkshop://app';
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp'
};

function response(body, status, contentType = 'text/plain; charset=utf-8') {
  return new Response(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': contentType,
      'x-content-type-options': 'nosniff'
    }
  });
}

async function serveAppFile(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return response('Method not allowed', 405);

  let pathname;
  try {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return response('Not found', 404);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return response('Bad request', 400);
  }

  if (!pathname || pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';
  const relativePath = pathname.replace(/^[/\\]+/, '');
  const filePath = path.resolve(webRoot, relativePath);
  const relativeToRoot = path.relative(webRoot, filePath);
  if (relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)) {
    return response('Forbidden', 403);
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return response(request.method === 'HEAD' ? null : file, 200, contentType);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return response('Not found', 404);
    console.error('Unable to read desktop app resource:', error);
    return response('Unable to read app resource', 500);
  }
}

let mainWindow = null;

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f1',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === `${appOrigin}/` || url.startsWith(`${appOrigin}/`)) return;
    event.preventDefault();
    openExternal(url);
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(`${appOrigin}/`).catch((error) => {
    console.error('Unable to open the World Workshop window:', error);
    dialog.showErrorBox('世界工坊无法启动', '应用资源读取失败，请重新解压后再试。');
    app.quit();
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    protocol.handle('worldworkshop', serveAppFile);
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
