// ============================================================
//  Mini Dictaphone V1
//  by ponpon 76
//  Open source - libre de réutilisation et modification
//  Fichier : main.js (processus principal Electron)
// ============================================================
const { app, BrowserWindow, shell, globalShortcut, ipcMain, dialog, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const LANGUE_PATH = path.join(__dirname, 'langue.txt');
const DEFAULT_CONFIG = {
  appVersion: '1.1.0',
  updateRepo: 'VOTRE_NOM_GITHUB/mini-dictaphone',
  checkUpdatesOnLaunch: true,
  language: 'fr',
  window: { width: 450, height: 300, x: null, y: null }
};

let win;
let gpuName = 'Inconnue';

// ==========================================
// CONFIG PERSISTANTE
// ==========================================
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return Object.assign({}, DEFAULT_CONFIG, c, { window: Object.assign({}, DEFAULT_CONFIG.window, c.window || {}) });
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8'); } catch (e) {}
}

// ==========================================
// LANGUE DE L'INTERFACE (langue.txt)
// ==========================================
// Lit la langue choisie. Retourne '' si pas encore choisie (premier lancement).
function loadLangue() {
  try {
    if (fs.existsSync(LANGUE_PATH)) {
      const code = fs.readFileSync(LANGUE_PATH, 'utf8').trim().toLowerCase();
      if (['fr', 'en', 'es', 'pt', 'de', 'it'].includes(code)) return code;
    }
  } catch (e) {}
  return '';
}
function saveLangue(code) {
  try { fs.writeFileSync(LANGUE_PATH, code, 'utf8'); } catch (e) {}
}
let interfaceLang = loadLangue();

let config = loadConfig();

// ==========================================
// CRÉATION DE LA FENÊTRE (avec restauration position/taille)
// ==========================================
function createWindow() {
  const w = config.window;
  const opts = {
    width: w.width, height: w.height,
    frame: false, transparent: true, alwaysOnTop: true,
    skipTaskbar: false, resizable: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  };
  if (w.x !== null && w.y !== null) { opts.x = w.x; opts.y = w.y; }

  win = new BrowserWindow(opts);
  win.loadFile('index.html');

  // Sauvegarde position/taille pendant le déplacement/resize
  const saveBounds = () => {
    if (!win) return;
    const b = win.getBounds();
    config.window = { width: b.width, height: b.height, x: b.x, y: b.y };
    saveConfig(config);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
}

// ==========================================
// DÉTECTION GPU (pour conseiller un modèle Whisper)
// ==========================================
function detectGpu() {
  try {
    const { execSync } = require('child_process');
    // PowerShell fonctionne sur toutes les versions de Windows (wmic est supprimé sur Win11 récent)
    const out = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', { encoding: 'utf8' });
    const cards = out.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    if (cards.length > 0) gpuName = cards.join(' | ');
  } catch (e) {}
}

// ==========================================
// APP READY
// ==========================================
app.whenReady().then(() => {
  detectGpu();
  createWindow();

  // Autorise le micro
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  // Raccourcis clavier globaux
  globalShortcut.register('CommandOrControl+Shift+M', () => { if (win) win.webContents.send('shortcut', 'toggle-mic'); });
  globalShortcut.register('CommandOrControl+Shift+C', () => { if (win) win.webContents.send('shortcut', 'copy'); });
  globalShortcut.register('CommandOrControl+Shift+E', () => { if (win) win.webContents.send('shortcut', 'clear'); });

  // Vérification auto de MAJ au lancement (si activé)
  if (config.checkUpdatesOnLaunch) {
    checkAppUpdate(true); // silent = true
  }
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });

// ==========================================
// IPC DE BASE
// ==========================================
ipcMain.on('close-window', () => { if (win) win.close(); });
ipcMain.on('minimize-window', () => { if (win) win.minimize(); });
ipcMain.on('maximize-window', () => { if (win) { win.isMaximized() ? win.unmaximize() : win.maximize(); } });
ipcMain.on('open-sound-settings', () => { shell.openExternal('ms-settings:sound'); });
ipcMain.on('open-folder', (_e, p) => { if (p) shell.openPath(p); });

ipcMain.on('dialog-open-file', async (event) => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Joindre des fichiers à la note', properties: ['openFile', 'multiSelections']
  });
  event.reply('files-selected', result.filePaths || []);
});

// ==========================================
// CONFIG GET/SET (pour le renderer)
// ==========================================
ipcMain.handle('config-get', () => config);
ipcMain.handle('config-set', (_e, partial) => {
  config = Object.assign({}, config, partial, { window: Object.assign({}, config.window, (partial && partial.window) || {}) });
  saveConfig(config);
  return config;
});

ipcMain.handle('get-gpu', () => gpuName);

// Langue de l'interface
ipcMain.handle('get-langue', () => interfaceLang);
ipcMain.handle('set-langue', (_e, code) => {
  interfaceLang = code;
  saveLangue(code);
  return interfaceLang;
});

// Redémarrage de l'app (après installation de main.exe ou d'un modèle)
ipcMain.on('relaunch-app', () => {
  app.relaunch();
  app.exit(0);
});

// ==========================================
// MISE À JOUR — vérification GitHub Releases
// ==========================================
function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'mini-dictaphone-v1' }, timeout: 10000 }, (res) => {
      // Suit les redirections (301/302) courantes sur les APIs
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGetJson(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

// Vérifie la dernière version de l'APP sur GitHub
async function checkAppUpdate(silent) {
  const repo = config.updateRepo;
  if (!repo || repo.startsWith('VOTRE_NOM_GITHUB')) {
    if (!silent && win) win.webContents.send('update-result', { type: 'app', error: 'Dépôt de mise à jour non configuré (voir config.json).' });
    return;
  }
  try {
    const data = await httpsGetJson('https://api.github.com/repos/' + repo + '/releases/latest');
    const latest = (data.tag_name || '').replace(/^v/i, '');
    const current = config.appVersion;
    const hasUpdate = compareVersions(latest, current) > 0;
    if (win) win.webContents.send('update-result', { type: 'app', silent, hasUpdate, latest, current, url: data.html_url, notes: data.body || '' });
  } catch (e) {
    if (!silent && win) win.webContents.send('update-result', { type: 'app', error: e.message });
  }
}

// Vérifie la dernière version de l'EXÉCUTABLE Whisper (Const-me/Whisper)
async function checkWhisperExeUpdate() {
  try {
    const data = await httpsGetJson('https://api.github.com/repos/Const-me/Whisper/releases/latest');
    const latest = (data.tag_name || '').replace(/^v/i, '').replace(/^Version\s*/i, '').trim();
    if (win) win.webContents.send('update-result', { type: 'whisper-exe', latest, url: data.html_url, notes: data.body || '' });
  } catch (e) {
    if (win) win.webContents.send('update-result', { type: 'whisper-exe', error: e.message });
  }
}

ipcMain.on('check-app-update', () => checkAppUpdate(false));
ipcMain.on('check-whisper-update', () => checkWhisperExeUpdate());

function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

// ==========================================
// GESTIONNAIRE DE MODÈLES — liste + téléchargement
// ==========================================
const MODELS = [
  { id: 'tiny',    name: 'Tiny',    size: '~75 Mo',  quality: 'Mauvaise en français',           vram: '~1 Go',  recommended: false, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin' },
  { id: 'base',    name: 'Base',    size: '~145 Mo', quality: 'Correcte, mais limitée',         vram: '~1 Go',  recommended: false, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin' },
  { id: 'small',   name: 'Small',   size: '~466 Mo', quality: 'Bonne en français',              vram: '~2 Go',  recommended: true,  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin' },
  { id: 'medium',  name: 'Medium',  size: '~1.5 Go', quality: 'Très bonne',                     vram: '~5 Go',  recommended: false, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin' },
  { id: 'large-v3',name: 'Large-v3',size: '~3 Go',   quality: 'Excellente (mais très lourde)',  vram: '~10 Go', recommended: false, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin' }
];

ipcMain.handle('list-models', () => {
  const whisperDir = path.join(__dirname, 'Whisper');
  let installed = [];
  try {
    if (fs.existsSync(whisperDir)) {
      installed = fs.readdirSync(whisperDir).filter(f => /^ggml-.+\.bin$/i.test(f));
    }
  } catch (e) {}
  return { models: MODELS, installed, whisperDir };
});

// Téléchargement d'un modèle avec progression
ipcMain.on('download-model', (event, modelId) => {
  const model = MODELS.find(m => m.id === modelId);
  if (!model) { event.reply('download-progress', { error: 'Modèle inconnu' }); return; }
  const whisperDir = path.join(__dirname, 'Whisper');
  try { fs.mkdirSync(whisperDir, { recursive: true }); } catch (e) {}
  const dest = path.join(whisperDir, 'ggml-' + modelId + '.bin');

  // Si redirection HuggingFace, on suit manuellement
  let total = 0, received = 0;
  const file = fs.createWriteStream(dest);

  const doRequest = (url) => {
    https.get(url, { headers: { 'User-Agent': 'mini-dictaphone-v1' }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        doRequest(res.headers.location);
        return;
      }
      if (res.statusCode !== 200) {
        file.close(); try { fs.unlinkSync(dest); } catch (e) {}
        event.reply('download-progress', { error: 'HTTP ' + res.statusCode });
        return;
      }
      total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', chunk => {
        received += chunk.length;
        if (total > 0) event.reply('download-progress', { modelId, received, total, percent: Math.round(received / total * 100) });
      });
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          event.reply('download-done', { modelId, ok: true });
          // Redémarre l'app après 1,5 s pour prendre en compte le nouveau modèle
          setTimeout(() => { app.relaunch(); app.exit(0); }, 1500);
        });
      });
    }).on('error', err => {
      file.close(); try { fs.unlinkSync(dest); } catch (e) {}
      event.reply('download-progress', { error: err.message });
    });
  };
  doRequest(model.url);
});

ipcMain.on('delete-model', (event, fileName) => {
  const dest = path.join(__dirname, 'Whisper', fileName);
  try { fs.unlinkSync(dest); event.reply('model-deleted', { ok: true, fileName }); }
  catch (e) { event.reply('model-deleted', { ok: false, error: e.message }); }
});

// ==========================================
// INSTALLATION AUTOMATIQUE DE main.exe (cli.zip)
// Télécharge la dernière version de cli.zip depuis Const-me/Whisper,
// la décompresse dans Whisper/, supprime le zip temporaire, puis redémarre.
// ==========================================
ipcMain.on('install-cli', async (event) => {
  const whisperDir = path.join(__dirname, 'Whisper');
  try { fs.mkdirSync(whisperDir, { recursive: true }); } catch (e) {}

  // 1) Récupère l'URL du cli.zip depuis l'API GitHub
  let cliUrl = null;
  try {
    const data = await httpsGetJson('https://api.github.com/repos/Const-me/Whisper/releases/latest');
    if (data && data.assets) {
      const asset = data.assets.find(a => /cli\.zip$/i.test(a.name) || /cli\.zip$/i.test(a.browser_download_url));
      if (asset) cliUrl = asset.browser_download_url;
    }
  } catch (e) {}
  if (!cliUrl) { event.reply('install-cli-progress', { error: 'URL cli.zip introuvable' }); return; }

  // 2) Télécharge cli.zip avec progression
  const zipPath = path.join(whisperDir, 'cli.zip');
  let total = 0, received = 0;
  const file = fs.createWriteStream(zipPath);

  await new Promise((resolve, reject) => {
    const doRequest = (url) => {
      https.get(url, { headers: { 'User-Agent': 'mini-dictaphone-v1' }, timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); doRequest(res.headers.location); return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
        total = parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', chunk => {
          received += chunk.length;
          if (total > 0) event.reply('install-cli-progress', { percent: Math.round(received / total * 100) });
        });
        res.pipe(file);
        file.on('finish', () => { file.close(resolve); });
      }).on('error', reject);
    };
    doRequest(cliUrl);
  });

  // 3) Décompression via PowerShell (Expand-Archive, dispo sur Win10/11)
  event.reply('install-cli-progress', { phase: 'extract' });
  const { execSync } = require('child_process');
  try {
    execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${whisperDir}' -Force"`, { windowsHide: true });
  } catch (e) {
    event.reply('install-cli-progress', { error: 'Échec décompression : ' + e.message });
    return;
  }

  // 4) Supprime le zip temporaire
  try { fs.unlinkSync(zipPath); } catch (e) {}

  // 5) Vérifie que main.exe est bien là
  if (!fs.existsSync(path.join(whisperDir, 'main.exe'))) {
    event.reply('install-cli-progress', { error: 'main.exe absent après décompression' });
    return;
  }

  // 6) Redémarre l'app
  event.reply('install-cli-done', { ok: true });
  setTimeout(() => { app.relaunch(); app.exit(0); }, 1200);
});

// ==========================================
// CORRECTEUR D'ORTHOGRAPHE — LanguageTool local
// Gère : détection install, téléchargement Java+LT, lancement serveur,
//         test de disponibilité (localhost:8081).
// Arborescence créée dans Correcteur/ :
//   Correcteur/
//     java/             (Java portable Temurin, ~200 Mo)
//       bin/java.exe
//     LanguageTool/     (~150 Mo)
//       languagetool-server.jar
// ==========================================
const LT_DIR = path.join(__dirname, 'Correcteur');
const LT_JAVA_DIR = path.join(LT_DIR, 'java');
const LT_LT_DIR = path.join(LT_DIR, 'LanguageTool');
const LT_PORT = 8081;
const DICO_PERSO_PATH = path.join(__dirname, 'dictionnaire_perso.txt');
let ltProcess = null; // processus du serveur LT en cours

// ==========================================
// DICTIONNAIRE PERSONNEL (apprentissage des mots)
// Stockage : dictionnaire_perso.txt à la racine (1 mot par ligne, 100% local).
// Utilisé pour filtrer les "fautes" qui sont en fait des mots connus de
// l'utilisateur (noms propres, jargon). Le filtrage se fait côté renderer.
// ==========================================
function loadDicoPerso() {
  try {
    if (fs.existsSync(DICO_PERSO_PATH)) {
      return fs.readFileSync(DICO_PERSO_PATH, 'utf8')
        .split('\n').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    }
  } catch (e) {}
  return [];
}
function saveDicoPerso(mots) {
  try { fs.writeFileSync(DICO_PERSO_PATH, mots.join('\n') + '\n', 'utf8'); } catch (e) {}
}
ipcMain.handle('dico-get', () => loadDicoPerso());
ipcMain.handle('dico-add', (_e, mot) => {
  const mots = loadDicoPerso();
  const m = String(mot || '').trim().toLowerCase();
  if (m && !mots.includes(m)) { mots.push(m); saveDicoPerso(mots); }
  return mots;
});
ipcMain.handle('dico-remove', (_e, mot) => {
  let mots = loadDicoPerso();
  const m = String(mot || '').trim().toLowerCase();
  mots = mots.filter(x => x !== m);
  saveDicoPerso(mots);
  return mots;
});
ipcMain.handle('dico-set', (_e, listeMots) => {
  const mots = (Array.isArray(listeMots) ? listeMots : [])
    .map(s => String(s).trim().toLowerCase()).filter(s => s.length > 0);
  saveDicoPerso(mots);
  return mots;
});

// ==========================================
// WEBHOOK N8N — envoi de la transcription (Phase 3)
// Envoie un POST JSON vers l'URL configurée par l'utilisateur.
// Universel : sert à Jarvis (ponpon 76) mais aussi à tout utilisateur avec
// son propre n8n (Discord, Notion, LLM, etc.). 100% configurable.
// ==========================================
// Parse une URL http/https et renvoie { module, host, port, path }
function parseWebhookUrl(url) {
  try {
    const u = new URL(url);
    return {
      module: u.protocol === 'https:' ? https : http,
      host: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: (u.pathname || '/') + (u.search || '')
    };
  } catch (e) { return null; }
}

// Envoie le payload JSON vers le webhook. Retourne { ok, status, error }.
function envoyerWebhook(url, token, payload) {
  return new Promise((resolve) => {
    const parsed = parseWebhookUrl(url);
    if (!parsed) { resolve({ ok: false, error: 'URL invalide' }); return; }
    const body = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = parsed.module.request({
      host: parsed.host, port: parsed.port, path: parsed.path, method: 'POST',
      headers: headers, timeout: 10000
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
    });
    req.on('error', err => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

// Envoi réel déclenché par le renderer après une dictée
ipcMain.handle('webhook-send', async (_e, { url, token, texte, langue }) => {
  if (!url) return { ok: false, error: 'URL non configurée' };
  const payload = { texte: texte, langue: langue, date: new Date().toISOString(), source: 'mini-dictaphone' };
  return await envoyerWebhook(url, token, payload);
});

// Test de connexion au webhook (bouton "Tester" dans ⚙️)
ipcMain.handle('webhook-test', async (_e, { url, token }) => {
  if (!url) return { ok: false, error: 'URL non configurée' };
  const payload = { test: true, date: new Date().toISOString(), source: 'mini-dictaphone' };
  return await envoyerWebhook(url, token, payload);
});

// Vérifie si LanguageTool est installé (jar présent ET java présent)
function isLanguageToolInstalled() {
  try {
    const jarOk = fs.existsSync(path.join(LT_LT_DIR, 'languagetool-server.jar'));
    const javaExe = path.join(LT_JAVA_DIR, 'bin', 'java.exe');
    const javaOk = fs.existsSync(javaExe);
    return { installed: jarOk && javaOk, jarOk, javaOk, javaExe };
  } catch (e) {
    return { installed: false, error: e.message };
  }
}

// Vérifie si le serveur LT répond sur localhost:8081 (GET /v2/languages)
function checkLtServer() {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port: LT_PORT, path: '/v2/languages', timeout: 2500 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { resolve(res.statusCode === 200); });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

// Lance le serveur LT en arrière-plan (sans fenêtre noire)
async function startLtServer() {
  if (ltProcess) return true; // déjà lancé
  const { installed, javaExe } = isLanguageToolInstalled();
  if (!installed) return false;
  if (await checkLtServer()) return true; // déjà lancé par une session précédente
  const { spawn } = require('child_process');
  const jar = path.join(LT_LT_DIR, 'languagetool-server.jar');
  ltProcess = spawn(javaExe, ['-cp', jar, 'org.languagetool.server.HTTPServer', '--port', String(LT_PORT)], {
    cwd: LT_DIR, windowsHide: true, detached: false
  });
  ltProcess.on('error', () => { ltProcess = null; });
  ltProcess.on('exit', () => { ltProcess = null; });
  // Attend que le serveur réponde (max ~15 s, le 1er démarrage Java est lent)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await checkLtServer()) return true;
  }
  return false;
}

ipcMain.handle('lt-status', async () => {
  const install = isLanguageToolInstalled();
  if (!install.installed) return { installed: false, serverUp: false };
  const serverUp = await checkLtServer();
  return { installed: true, serverUp, port: LT_PORT };
});

// Démarre le serveur si installé (appelé par le renderer au démarrage)
ipcMain.handle('lt-start', async () => {
  const ok = await startLtServer();
  return { ok, port: LT_PORT };
});

// ==========================================
// INSTALLATION AUTOMATIQUE DU CORRECTEUR (Java + LanguageTool)
// Étapes : 1) Java Temurin (zip)  2) LanguageTool (zip)  3) test serveur
// ==========================================
// Télécharge un fichier binaire avec suivi de progression + suivi des redirections
function downloadWithProgress(url, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let total = 0, received = 0;
    const doRequest = (u) => {
      https.get(u, { headers: { 'User-Agent': 'mini-dictaphone-v1' }, timeout: 60000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); doRequest(res.headers.location); return;
        }
        if (res.statusCode !== 200) { res.resume(); file.close(); try { fs.unlinkSync(destPath); } catch (e) {} reject(new Error('HTTP ' + res.statusCode)); return; }
        total = parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', chunk => {
          received += chunk.length;
          if (total > 0 && progressCallback) progressCallback(received, total);
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      }).on('error', err => {
        file.close(); try { fs.unlinkSync(destPath); } catch (e) {} reject(err);
      });
    };
    doRequest(url);
  });
}

ipcMain.on('install-correcteur', async (event) => {
  try { fs.mkdirSync(LT_DIR, { recursive: true }); } catch (e) {}
  const { execSync } = require('child_process');

  // ---- 1) JAVA TEMURIN (JDK portable) ----
  // On télécharge le zip Temurin 21 (Windows x64) depuis le site officiel Adoptium.
  // URL API : renvoie l'asset .zip du JDK le plus récent.
  const JAVA_API_URL = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse';
  event.reply('install-correcteur-progress', { phase: 'java-download' });
  if (!isLanguageToolInstalled().javaOk) {
    const javaZip = path.join(LT_DIR, 'java.zip');
    try {
      await downloadWithProgress(JAVA_API_URL, javaZip, (recv, tot) => {
        event.reply('install-correcteur-progress', { phase: 'java-download', percent: combinedPercent(recv, tot, 1) });
      });
      // Extraction : le zip contient un dossier racine "jdk-21..." qu'on aplatit
      event.reply('install-correcteur-progress', { phase: 'java-extract' });
      const javaExtractTmp = path.join(LT_DIR, 'java_tmp');
      try { fs.rmSync(javaExtractTmp, { recursive: true, force: true }); } catch (e) {}
      execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${javaZip}' -DestinationPath '${javaExtractTmp}' -Force"`, { windowsHide: true });
      // Le zip Temurin contient un seul dossier racine (ex: jdk-21.0.x+x)
      const inner = fs.readdirSync(javaExtractTmp).find(d => fs.statSync(path.join(javaExtractTmp, d)).isDirectory());
      if (!inner) throw new Error('Structure zip Java inattendue');
      try { fs.rmSync(LT_JAVA_DIR, { recursive: true, force: true }); } catch (e) {}
      fs.renameSync(path.join(javaExtractTmp, inner), LT_JAVA_DIR);
      try { fs.rmSync(javaExtractTmp, { recursive: true, force: true }); } catch (e) {}
      try { fs.unlinkSync(javaZip); } catch (e) {}
    } catch (e) {
      event.reply('install-correcteur-progress', { error: 'Java : ' + e.message }); return;
    }
  }

  // ---- 2) LANGUAGETOOL ----
  // Télécharge le zip officiel stable depuis languagetool.org.
  // IMPORTANT : seul ce zip contient languagetool-server.jar (le zip GitHub
  // n'existe pas — LanguageTool est hébergé sur son propre site).
  // Nécessite Java 17+ (on installe Temurin 21 → compatible).
  event.reply('install-correcteur-progress', { phase: 'lt-download' });
  if (!isLanguageToolInstalled().jarOk) {
    const LT_ZIP_URL = 'https://languagetool.org/download/LanguageTool-stable.zip';
    const ltZip = path.join(LT_DIR, 'lt.zip');
    try {
      await downloadWithProgress(LT_ZIP_URL, ltZip, (recv, tot) => {
        event.reply('install-correcteur-progress', { phase: 'lt-download', percent: combinedPercent(recv, tot, 2) });
      });
      event.reply('install-correcteur-progress', { phase: 'lt-extract' });
      const ltExtractTmp = path.join(LT_DIR, 'lt_tmp');
      try { fs.rmSync(ltExtractTmp, { recursive: true, force: true }); } catch (e) {}
      execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${ltZip}' -DestinationPath '${ltExtractTmp}' -Force"`, { windowsHide: true });
      // Le zip stable crée un dossier racine "LanguageTool-X.x" (version numérotée)
      const inner = fs.readdirSync(ltExtractTmp).find(d => fs.statSync(path.join(ltExtractTmp, d)).isDirectory());
      if (!inner) throw new Error('Structure zip LanguageTool inattendue');
      try { fs.rmSync(LT_LT_DIR, { recursive: true, force: true }); } catch (e) {}
      fs.renameSync(path.join(ltExtractTmp, inner), LT_LT_DIR);
      try { fs.rmSync(ltExtractTmp, { recursive: true, force: true }); } catch (e) {}
      try { fs.unlinkSync(ltZip); } catch (e) {}
      // Vérifie que languagetool-server.jar est bien présent
      if (!fs.existsSync(path.join(LT_LT_DIR, 'languagetool-server.jar'))) {
        throw new Error('languagetool-server.jar absent après extraction');
      }
    } catch (e) {
      event.reply('install-correcteur-progress', { error: 'LanguageTool : ' + e.message }); return;
    }
  }

  // ---- 3) TEST SERVEUR ----
  event.reply('install-correcteur-progress', { phase: 'server-test' });
  const started = await startLtServer();
  event.reply('install-correcteur-done', { ok: started, port: LT_PORT });
});

// Utilitaire : pourcentage combiné pour la barre de progression globale.
// Phase 1 (Java, plus gros) ≈ 0-55%, Phase 2 (LanguageTool) ≈ 55-100%.
function combinedPercent(recv, tot, phase) {
  if (phase === 1) return Math.round(recv / tot * 55);
  return Math.round(55 + (recv / tot) * 45);
}
