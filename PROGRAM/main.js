// ============================================================
//  Mini Dictaphone V1
//  by ponpon 76
//  Open source - libre de réutilisation et modification
//  Fichier : main.js (processus principal Electron)
// ============================================================
const { app, BrowserWindow, shell, globalShortcut, ipcMain, dialog, session, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// ==========================================
// MUR D'ENCEINTE VAUBAN — whitelist réseau centralisée
// ==========================================
// Toutes les fonctions réseau de l'app (httpsGetJson, httpsDownloadFile,
// downloadWithProgress, webhook) interrogent isHostAllowed() AVANT de se
// connecter. Un host absent de la liste = refus immédiat, aucune connexion.
// Objectif : même si une faille permettait à du code malveillant d'appeler
// https.get(), il ne pourrait parler qu'aux destinations ci-dessous.
// Les MAJ/auto-update, téléchargements de modèles, Java, LanguageTool, et le
// webhook n8n de l'utilisateur sont les SEULS autorisés. Tout le reste bloqué.
const HOSTS_AUTORISES = [
  'api.github.com',           // API GitHub (vérif MAJ + releases)
  'raw.githubusercontent.com',// Fichiers de code source (auto-update)
  'nodejs.org',               // Téléchargement Node.js portable
  'huggingface.co',           // Modèles Whisper (ggml-*.bin)
  'cdn-lfs.huggingface.co',   // CDN de redirection HuggingFace (modèles)
  'api.adoptium.net',         // Java Temurin (pour le correcteur)
  'github.com',               // Releases Const-me/Whisper (cli.zip)
  'objects.githubusercontent.com', // CDN GitHub releases (cli.zip, assets)
  'languagetool.org'          // LanguageTool (correcteur)
];

// Vérifie si un host est autorisé par le mur Vauban.
// - host : le hostname à tester (ex: "api.github.com")
// - isWebhook : true si l'URL vient du webhook n8n configuré par l'utilisateur
//   (dans ce cas on autorise TOUS les hosts valides http/https, car l'utilisateur
//   choisit sa propre destination n8n — sinon le dictaphone ne pourrait jamais
//   parler à un n8n auto-hébergé sur un domaine perso).
function isHostAllowed(host, isWebhook) {
  if (!host) return false;
  const h = host.toLowerCase();
  if (HOSTS_AUTORISES.includes(h)) return true;
  // localhost et 127.0.0.1 toujours autorisés (LanguageTool local + n8n local)
  if (h === 'localhost' || h === '127.0.0.1' || /^127\.\d+\.\d+\.\d+$/.test(h)) return true;
  // Webhook utilisateur : on autorise tout host http(s) valide (l'utilisateur
  // configure son propre n8n — on ne peut pas whitelist un domaine inconnu).
  // MAIS on refuse les schémas dangereux (file://, etc.) — géré par parseWebhookUrl.
  if (isWebhook) return true;
  return false;
}

const CONFIG_PATH = path.join(__dirname, 'config.json');
const LANGUE_PATH = path.join(__dirname, 'langue.txt');
const DEFAULT_CONFIG = {
  appVersion: '1.3.0',
  updateRepo: 'ponpon76/mini-dictaphone',
  checkUpdatesOnLaunch: true,
  language: 'fr',
  window: { width: 450, height: 300, x: null, y: null }
};

let win;
let gpuName = 'Inconnue';
let isBusy = false;  // true si le renderer est en train d'enregistrer/transcrire (bloque le redémarrage auto)

// Le renderer notifie son état occupé (pour bloquer l'auto-update pendant une dictée)
ipcMain.on('set-busy', (_e, busy) => { isBusy = busy; });

// ==========================================
// CONFIG PERSISTANTE
// ==========================================
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const cfg = Object.assign({}, DEFAULT_CONFIG, c, { window: Object.assign({}, DEFAULT_CONFIG.window, c.window || {}) });
      // Clés d'AUTORITÉ DU CODE : imposées par DEFAULT_CONFIG, jamais par config.json.
      // Sans ça, appVersion resterait figé à l'ancienne valeur (config.json n'est pas
      // mis à jour par l'auto-update) → la comparaison de version croirait à tort
      // qu'une MAJ est dispo à CHAQUE lancement → boucle de MAJ infinie.
      cfg.appVersion = DEFAULT_CONFIG.appVersion;
      cfg.updateRepo = DEFAULT_CONFIG.updateRepo;
      return cfg;
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig(cfg) {
  try {
    // Ne persiste JAMAIS les clés d'autorité du code (appVersion/updateRepo) :
    // elles sont forcées par DEFAULT_CONFIG au chargement. Les garder dans
    // config.json provoquerait une boucle de MAJ infinie (cf. loadConfig).
    const toSave = Object.assign({}, cfg);
    delete toSave.appVersion;
    delete toSave.updateRepo;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2), 'utf8');
  } catch (e) {}
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

  // ==========================================
  // MENU CONTEXTUEL (clic droit sur le textarea)
  // ==========================================
  // Menu natif Electron : Copier, Coller, Couper, Sélectionner tout, Annuler.
  // Avantage : zéro code de rendu côté renderer (pas de HTML/JS injecté),
  // et c'est le moteur Chromium qui gère → sûr (pas de surface d'attaque).
  // Permet à l'utilisateur de copier/coller/supprimer sans faire d'allers-retours
  // vers les boutons en haut (Copier) et en bas (Clear) de la fenêtre.
  win.webContents.on('context-menu', (_event, params) => {
    const menu = Menu.buildFromTemplate([
      { role: 'undo',  label: 'Annuler',  enabled: params.editFlags.canUndo },
      { type: 'separator' },
      { role: 'cut',   label: 'Couper',   enabled: params.editFlags.canCut  && params.selectionText },
      { role: 'copy',  label: 'Copier',   enabled: params.editFlags.canCopy && params.selectionText },
      { role: 'paste', label: 'Coller',   enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: 'Tout sélectionner' }
    ]);
    menu.popup(win);
  });

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
// Asynchrone + cache dans config.json (évite de ralentir le démarrage à chaque fois)
// ==========================================
// TTL du cache GPU : 30 jours. Au-delà, on refait la détection (changement de
// carte, GPU externe branché, etc.). Avant le cache était permanent → un
// changement matériel n'était jamais pris en compte dans le conseil modèle.
const GPU_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function detectGpuAsync(force) {
  // Si cache récent et pas de forçage, on ne refait pas la détection
  if (!force && config.gpuName && config.gpuName !== 'Inconnue') {
    const age = config.gpuDetectedAt ? (Date.now() - config.gpuDetectedAt) : Infinity;
    if (age < GPU_CACHE_TTL_MS) { gpuName = config.gpuName; return; }
  }
  const { exec } = require('child_process');
  // windowsHide:true → pas de fenêtre PowerShell qui flash au démarrage (m14).
  exec('powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"', { encoding: 'utf8', windowsHide: true }, (err, stdout) => {
    if (err || !stdout) return;
    const cards = stdout.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    if (cards.length > 0) {
      gpuName = cards.join(' | ');
      // Met à jour le cache dans config.json (avec timestamp d'invalidation)
      try {
        config.gpuName = gpuName;
        config.gpuDetectedAt = Date.now();
        saveConfig(config);
      } catch (e) {}
    }
  });
}

// ==========================================
// APP READY
// ==========================================
// Single-instance lock : empêche de lancer 2 instances en parallèle
// (conflit sur les raccourcis globaux + port LanguageTool 8081).
// Si une 2e instance est lancée, on quitte et on ramène la fenêtre existante.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.whenReady().then(() => {
  detectGpuAsync();
  createWindow();

  // Autorise le micro
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  // Raccourcis clavier globaux. register() peut échouer si une autre app
  // (Discord, OBS...) a déjà pris le raccourci. On logge l'échec en console
  // pour diagnostic, sans alerter l'utilisateur (ce n'est pas bloquant).
  const raccourcis = [
    { accel: 'CommandOrControl+Shift+M', action: 'toggle-mic' },
    { accel: 'CommandOrControl+Shift+C', action: 'copy' },
    { accel: 'CommandOrControl+Shift+E', action: 'clear' }
  ];
  for (const r of raccourcis) {
    const ok = globalShortcut.register(r.accel, () => { if (win) win.webContents.send('shortcut', r.action); });
    if (!ok) console.log('Raccourci non enregistré (déjà pris par une autre app) : ' + r.accel);
  }

  // Vérification auto de MAJ au lancement (si activé) → auto-update silencieux
  if (config.checkUpdatesOnLaunch) {
    checkAndAutoUpdate(true);
  }
});

// Vérifie la version au lancement ; si une MAJ plus récente existe, l'applique silencieusement.
// Si ça échoue (réseau, quota), on continue sur la version actuelle. Point.
async function checkAndAutoUpdate(silent) {
  const repo = config.updateRepo;
  // Garde-fou : repo doit être au format "owner/name" (sinon on n'interroge pas l'API).
  if (!repo || !repo.includes('/')) return;
  try {
    const data = await httpsGetJson('https://api.github.com/repos/' + repo + '/releases/latest');
    const tag = (data.tag_name || 'main');           // ex: "v1.2.1" (garde le "v")
    const latest = tag.replace(/^v/i, '');           // ex: "1.2.1"
    if (compareVersions(latest, config.appVersion) > 0) {
      // Une MAJ est dispo → on la télécharge et l'applique automatiquement
      // On passe le TAG (pas "main") pour télécharger la vraie version de la release
      performAppUpdate(silent, tag);
    }
  } catch (e) { /* échec réseau/quota → on continue sur la version actuelle */ }
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // Tue le serveur LanguageTool sinon java.exe reste zombie après fermeture
  // (sur Windows, fermer Electron ne propage pas le signal aux processus enfants).
  if (ltProcess) { try { ltProcess.kill(); } catch (e) {} }
});

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

// Force la redétection du GPU (bouton "Redétecter" dans ⚙️). Retourne une
// Promise qui résout quand la détection est faite (avec le nouveau nom).
ipcMain.handle('redetect-gpu', () => {
  return new Promise((resolve) => {
    gpuName = 'Inconnue';
    detectGpuAsync(true);
    // detectGpuAsync est async (exec) ; on sonde gpuName jusqu'à ce qu'il change
    let tries = 0;
    const check = () => {
      if (gpuName !== 'Inconnue' || tries > 20) resolve(gpuName);
      else { tries++; setTimeout(check, 250); }
    };
    check();
  });
});

// ==========================================
// TRANSCRIPTION WHISPER (Option A — sécurité)
// ==========================================
// Le renderer n'a PLUS accès à child_process (faille RCE potentielle C7 fermée).
// Il demande la transcription via IPC ; main.js lance main.exe et renvoie le texte.
// Le renderer garde le diagnostic (il a les traductions pour les messages d'erreur).
ipcMain.handle('transcribe', async (_event, { wavPath, modelPath, lang, translate }) => {
  const whisperDir = path.join(__dirname, 'Whisper');
  const exePath = path.join(whisperDir, 'main.exe');
  const { spawn } = require('child_process');
  // -l auto = détection auto de la langue source. -tr = traduire vers l'anglais.
  const args = ['-m', modelPath, '-l', lang, '-otxt', '-nc', '-nt', '-mc', '0'];
  if (translate) args.push('-tr');
  args.push(wavPath);

  return new Promise((resolve) => {
    const child = spawn(exePath, args, { cwd: whisperDir, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    let done = false;
    // Timeout 60 s (main.exe qui hang, GPU figé, etc.)
    const timer = setTimeout(() => {
      if (done) return; done = true;
      try { child.kill(); } catch (e) {}
      resolve({ error: 'Timeout 60s' });
    }, 60000);
    child.on('error', (err) => {
      if (done) return; done = true; clearTimeout(timer);
      resolve({ error: 'main.exe : ' + err.message });
    });
    child.on('close', (code) => {
      if (done) return; done = true; clearTimeout(timer);
      // Whisper crée un .txt SANS l'extension .wav : dictee.wav -> dictee.txt
      const txtPath = wavPath.replace(/\.wav$/i, '.txt');
      try {
        const text = fs.readFileSync(txtPath, 'utf8').trim();
        resolve({ text });
      } catch (e) {
        // Le .txt n'existe pas → main.exe a planté. On diagnostique la cause
        // et on renvoie les infos brutes au renderer (qui a les traductions).
        const sortie = (stdout + '\n' + stderr);
        // Détection d'un GPU incompatible (DirectX < 11, VM sans GPU, etc.)
        const causeGPU = /(direct3d|d3d11|feature level|no compatible.*gpu|gpu.*not.*found|failed to create.*device|cannot create.*device|no suitable|d3d.*init|adapter.*not|no.*hardware.*acceler)/i.test(sortie);
        resolve({ error: 'code ' + code, causeGPU, diag: sortie.slice(-300) });
      }
    });
  });
});

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
    // VAUBAN : valide le host avant toute connexion.
    let host;
    try { host = new URL(url).hostname; } catch (e) { reject(new Error('URL invalide')); return; }
    if (!isHostAllowed(host)) { reject(new Error('Vauban : host non autorisé ' + host)); return; }
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
  // Garde-fou : repo doit être au format "owner/name" (sinon on n'interroge pas l'API).
  if (!repo || !repo.includes('/')) {
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
// AUTO-UPDATE COMPLET — téléchargement + remplacement atomique
// Télécharge les fichiers de code depuis le dépôt GitHub (raw), les place
// dans un dossier temporaire, puis remplace les anciens UNIQUEMENT si tous
// les téléchargements ont réussi. Préserve les données utilisateur.
// ==========================================

// Télécharge un fichier texte (raw) vers destPath. Résout avec true/false.
function httpsDownloadFile(url, destPath) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (ok) => {
      if (resolved) return;
      resolved = true;
      try { file.close(); } catch (e) {}  // peut throw si flux déjà fermé
      try { if (!ok) fs.unlinkSync(destPath); } catch (e) {}
      resolve(ok);
    };
    const file = fs.createWriteStream(destPath);
    const doRequest = (u) => {
      // VAUBAN : valide le host AVANT chaque connexion (y compris redirections).
      let host;
      try { host = new URL(u).hostname; } catch (e) { finish(false); return; }
      if (!isHostAllowed(host)) { finish(false); return; }
      const req = https.get(u, { headers: { 'User-Agent': 'mini-dictaphone-v1' }, timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          finish(false);
          return;
        }
        res.pipe(file);
        file.on('finish', () => { finish(true); });
      });
      req.on('error', () => finish(false));
      req.on('timeout', () => { req.destroy(new Error('timeout')); });  // évite le blocage infini
    };
    doRequest(url);
  });
}

// Exécute npm install de façon silencieuse (pour rafraîchir les dépendances)
// m15 : windowsHide:true → pas de fenêtre cmd qui apparaît pendant une MAJ.
function runNpmInstall(callback) {
  const { exec } = require('child_process');
  exec('npm install', { cwd: __dirname, windowsHide: true }, (err) => callback(!err));
}

// Redémarrage SÛR : attend que le renderer ne soit plus occupé (enregistrement/transcription)
// avant de relancer. Empêche de tuer une dictée en plein milieu.
// Garde-fou C8 : timeout max de 10 min. Au-delà, on force le relaunch (sinon une
// dictée laissée indéfiniment en cours bloquait la MAJ pour toujours).
const MAX_RELUNCH_WAIT_MS = 10 * 60 * 1000;
let isRestarting = false;  // anti double-redémarrage
function safeRelaunch() {
  if (isRestarting) return;          // un redémarrage est déjà programmé
  isRestarting = true;
  const startedAt = Date.now();
  const tryRelaunch = () => {
    const waitedTooLong = (Date.now() - startedAt) > MAX_RELUNCH_WAIT_MS;
    if (isBusy && !waitedTooLong) {
      // Le renderer travaille encore : on réessaie dans 2 s
      setTimeout(tryRelaunch, 2000);
    } else {
      app.relaunch();
      app.exit(0);
    }
  };
  tryRelaunch();
}

// Effectue la mise à jour complète de l'app depuis GitHub
// ref = tag de la release (ex: "v1.2.1") ou "main" par défaut
async function performAppUpdate(silent, ref) {
  const repo = config.updateRepo;
  const tmpDir = path.join(__dirname, '__update_tmp');
  if (!ref) ref = 'main'; // fallback si pas de tag passé

  // Liste des fichiers de code à mettre à jour (les données utilisateur ne sont JAMAIS touchées)
  // CODE : fichiers dans PROGRAM/ sur le dépôt.
  const FILES = ['main.js', 'index.html', 'langues.js', 'package.json', 'package-lock.json'];
  // m16 : MANUEL.txt et README.md sont aussi mis à jour (sinon les utilisateurs
  // existants gardaient un manuel périmé après une MAJ).
  const DOC_FILES = ['MANUEL.txt', 'README.md'];
  // M1 : on ne télécharge QUE les 3 .ps1 réellement copiés dans le dossier installé
  // (ceux utilisés par DESINSTALLER.bat). Les 5 autres ne servent qu'à l'install
  // initiale (INSTALLATEUR.bat) et ne sont pas dans le dossier installé → inutiles
  // de les télécharger ici (gaspillage bande passante + echec si absents du tag).
  const PS1_RUNTIME = ['desinstall_confirm.ps1', 'remove_shortcut.ps1', 'remove_node_path.ps1'];

  try {
    if (win) win.webContents.send('update-result', { type: 'app', phase: 'downloading', silent });

    // 2) Prépare le dossier temporaire (vide)
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    fs.mkdirSync(tmpDir, { recursive: true });

    // 3) Télécharge chaque fichier dans le dossier temporaire
    // ref = tag de la release (ex: "v1.2.1") → on télécharge la VRAIE version publiée
    // Les fichiers sont dans PROGRAM/ sur le dépôt GitHub (structure épurée)
    const baseRaw = 'https://raw.githubusercontent.com/' + repo + '/' + ref + '/PROGRAM/';
    // Racine du dépôt (pour DESINSTALLER.bat, MANUEL.txt, README.md)
    const baseRoot = 'https://raw.githubusercontent.com/' + repo + '/' + ref + '/';

    for (const f of FILES) {
      const ok = await httpsDownloadFile(baseRaw + f, path.join(tmpDir, f));
      if (!ok) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
        // C4 : message clair si la structure du dépôt a changé (ex: PROGRAM/ absent du tag)
        throw new Error('Téléchargement échoué : ' + f + ' (structure du dépôt ou tag "' + ref + '" invalide ?)');
      }
    }
    // Télécharge les 3 .ps1 runtime (M1 : seulement les utiles)
    for (const f of PS1_RUNTIME) {
      const ok = await httpsDownloadFile(baseRaw + f, path.join(tmpDir, f));
      if (!ok) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
        throw new Error('Téléchargement échoué : ' + f);
      }
    }
    // Télécharge DESINSTALLER.bat + docs (à la racine du dépôt)
    {
      const ok = await httpsDownloadFile(baseRoot + 'DESINSTALLER.bat', path.join(tmpDir, 'DESINSTALLER.bat'));
      if (!ok) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
        throw new Error('Téléchargement échoué : DESINSTALLER.bat');
      }
    }
    // m16 : docs (optionnel — si elles n'existent pas sur le tag, on ignore sans échouer)
    for (const f of DOC_FILES) {
      await httpsDownloadFile(baseRoot + f, path.join(tmpDir, f));
    }

    // 4) Tous les fichiers sont téléchargés → sauvegarde de l'ancienne version (C3)
    //    PUIS remplacement. La sauvegarde permet un rollback manuel si la nouvelle
    //    version est cassée. Contenu : les fichiers de code + DESINSTALLER.bat.
    if (win) win.webContents.send('update-result', { type: 'app', phase: 'installing', silent });

    const backupDir = path.join(__dirname, '__update_backup');
    try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.mkdirSync(backupDir, { recursive: true }); } catch (e) {}
    const backupAll = [...FILES, ...PS1_RUNTIME, 'DESINSTALLER.bat'];
    for (const f of backupAll) {
      try { fs.copyFileSync(path.join(__dirname, f), path.join(backupDir, f)); } catch (e) {}
    }
    // Garde une trace de la version remplacée (utile pour diagnostiquer un rollback)
    try { fs.writeFileSync(path.join(backupDir, 'REPLACED_FROM_VERSION.txt'), config.appVersion, 'utf8'); } catch (e) {}

    // Vérifie si package.json change (pour savoir si npm install est nécessaire)
    let needNpm = false;
    try {
      const oldPkg = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8');
      const newPkg = fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8');
      needNpm = (oldPkg !== newPkg);
    } catch (e) { needNpm = true; }

    // Remplace chaque fichier de code
    for (const f of FILES) {
      fs.copyFileSync(path.join(tmpDir, f), path.join(__dirname, f));
    }
    // Remplace les 3 .ps1 runtime
    for (const f of PS1_RUNTIME) {
      fs.copyFileSync(path.join(tmpDir, f), path.join(__dirname, f));
    }
    // Remplace DESINSTALLER.bat + docs (à la racine du dossier installé)
    fs.copyFileSync(path.join(tmpDir, 'DESINSTALLER.bat'), path.join(__dirname, 'DESINSTALLER.bat'));
    for (const f of DOC_FILES) {
      try { if (fs.existsSync(path.join(tmpDir, f))) fs.copyFileSync(path.join(tmpDir, f), path.join(__dirname, f)); } catch (e) {}
    }

    // 5) Nettoie le dossier temporaire (on GARDE __update_backup pour rollback)
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

    // 6) npm install si besoin (puis relance sûre)
    if (needNpm) {
      runNpmInstall(() => {
        if (win) win.webContents.send('update-result', { type: 'app', phase: 'done', silent });
        setTimeout(() => { safeRelaunch(); }, 1500);
      });
    } else {
      if (win) win.webContents.send('update-result', { type: 'app', phase: 'done', silent });
      setTimeout(() => { safeRelaunch(); }, 1500);
    }
  } catch (e) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (err) {}
    if (win) win.webContents.send('update-result', { type: 'app', error: e.message, silent });
  }
}

ipcMain.on('perform-update', async () => {
  // Récupère le tag de la dernière release avant de lancer la MAJ manuelle
  try {
    const data = await httpsGetJson('https://api.github.com/repos/' + config.updateRepo + '/releases/latest');
    performAppUpdate(false, data.tag_name || 'main');
  } catch (e) {
    performAppUpdate(false, 'main');
  }
});

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

// ==========================================
// FILE D'ATTENTE DE TÉLÉCHARGEMENT DE MODÈLES
// Les téléchargements s'enchaînent UN PAR UN. Un SEUL redémarrage a lieu
// quand toute la file est vide (corrige le bug du 2e download tué en plein milieu).
// ==========================================
let downloadQueue = [];       // [{ modelId, event }]
let activeDownloadId = null;  // id du modèle en cours de téléchargement
let modelsInstalledCount = 0; // nombre de modèles réussis dans la session courante de la file

// Envoie à l'UI l'état courant de la file (modèle actif + en attente)
function notifyQueueStatus() {
  const activeId = activeDownloadId;
  const pendingIds = downloadQueue.map(item => item.modelId);
  if (win) win.webContents.send('queue-status', { activeId, pendingIds });
}

// Lance le prochain téléchargement de la file (1 seul à la fois)
function processDownloadQueue() {
  if (activeDownloadId !== null) return;       // un téléchargement est déjà en cours
  if (downloadQueue.length === 0) return;      // file vide : rien à faire

  const { modelId, event } = downloadQueue.shift();
  const model = MODELS.find(m => m.id === modelId);
  if (!model) { processDownloadQueue(); return; }

  activeDownloadId = modelId;
  notifyQueueStatus();

  const whisperDir = path.join(__dirname, 'Whisper');
  try { fs.mkdirSync(whisperDir, { recursive: true }); } catch (e) {}
  const dest = path.join(whisperDir, 'ggml-' + modelId + '.bin');

  // Suit les redirections HuggingFace manuellement
  let total = 0, received = 0;
  let downloadFinished = false;  // anti double-fin
  const file = fs.createWriteStream(dest);

  const finishDownload = (ok, errMsg) => {
    if (downloadFinished) return;
    downloadFinished = true;
    activeDownloadId = null;
    // Nettoie le fichier partiel si échec (évite qu'il soit détecté comme "installé")
    if (!ok) { try { fs.unlinkSync(dest); } catch (e) {} }
    else { event.reply('download-done', { modelId, ok: true }); modelsInstalledCount++; }
    notifyQueueStatus();
    if (downloadQueue.length === 0) {
      // File vide : UN SEUL redémarrage final, mais SEULEMENT si au moins 1 modèle a réussi
      if (modelsInstalledCount > 0) setTimeout(() => { safeRelaunch(); }, 1500);
    } else {
      // Encore des modèles en attente : on lance le suivant
      processDownloadQueue();
    }
  };

  const doRequest = (url) => {
    // VAUBAN : valide le host AVANT chaque connexion (y compris redirections).
    let host;
    try { host = new URL(url).hostname; } catch (e) { event.reply('download-progress', { modelId, error: 'URL invalide' }); finishDownload(false); return; }
    if (!isHostAllowed(host)) { event.reply('download-progress', { modelId, error: 'Vauban : host non autorisé ' + host }); finishDownload(false); return; }
    const req = https.get(url, { headers: { 'User-Agent': 'mini-dictaphone-v1' }, timeout: 120000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        doRequest(res.headers.location);
        return;
      }
      if (res.statusCode !== 200) {
        try { file.close(); } catch (e) {}
        event.reply('download-progress', { modelId, error: 'HTTP ' + res.statusCode });
        finishDownload(false);  // nettoie dest lui-même
        return;
      }
      total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', chunk => {
        received += chunk.length;
        if (total > 0) event.reply('download-progress', { modelId, received, total, percent: Math.round(received / total * 100) });
      });
      res.pipe(file);
      file.on('finish', () => { file.close(() => finishDownload(true)); });
    });
    req.on('error', err => {
      try { file.close(); } catch (e) {}
      event.reply('download-progress', { modelId, error: err.message });
      finishDownload(false);  // nettoie dest lui-même
    });
    req.on('timeout', () => { req.destroy(new Error('timeout de téléchargement')); });  // évite blocage infini
  };
  doRequest(model.url);
}

// Ajoute un modèle à la file (déclenche le traitement si file était vide)
ipcMain.on('download-model', (event, modelId) => {
  const model = MODELS.find(m => m.id === modelId);
  if (!model) { event.reply('download-progress', { error: 'Modèle inconnu' }); return; }
  // Évite les doublons dans la file
  if (activeDownloadId === modelId || downloadQueue.some(item => item.modelId === modelId)) return;
  // Si la file était vide, on démarre un nouveau cycle → reset le compteur de succès
  if (downloadQueue.length === 0 && activeDownloadId === null) modelsInstalledCount = 0;
  downloadQueue.push({ modelId, event });
  notifyQueueStatus();
  processDownloadQueue();
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
let installOngoing = false;  // anti double-clic (install-cli + install-correcteur)
ipcMain.on('install-cli', async (event) => {
  if (installOngoing) { event.reply('install-cli-progress', { error: 'Une installation est déjà en cours, patientez.' }); return; }
  installOngoing = true;
  try {
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
        // VAUBAN : valide le host AVANT chaque connexion (y compris redirections).
        let host;
        try { host = new URL(url).hostname; } catch (e) { reject(new Error('URL invalide')); return; }
        if (!isHostAllowed(host)) { reject(new Error('Vauban : host non autorisé ' + host)); return; }
        https.get(url, { headers: { 'User-Agent': 'mini-dictaphone-v1' }, timeout: 120000 }, (res) => {
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

    // 3) Décompression via extract-zip (module npm, robuste sur tous les Windows
    // y compris Atlas OS où Expand-Archive PowerShell peut être fragile/lent).
    // NOTE : extract-zip exige un chemin "dir" au format POSIX (slashs /) sur
    // Windows, sinon il échoue. path.join() produit des "\" sur Windows → on convertit.
    event.reply('install-cli-progress', { phase: 'extract' });
    try {
      await require('extract-zip')(zipPath, { dir: whisperDir.replace(/\\/g, '/') });
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
    setTimeout(() => { safeRelaunch(); }, 1200);
  } finally {
    installOngoing = false;
  }
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
// Parse une URL http/https et renvoie { module, host, port, path }.
// VAUBAN (webhook) : seuls http: et https: sont autorisés (pas file:, ftp:, etc.).
// L'host est accepté quel qu'il soit (l'utilisateur configure son propre n8n,
// potentiellement auto-hébergé sur un domaine perso). Mais on refuse les
// schémas dangereux qui pourraient exfiltrer des fichiers locaux (file://).
function parseWebhookUrl(url) {
  try {
    const u = new URL(url);
    // Refuse tout schéma qui n'est pas http/https (file://, ftp://, etc.)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
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

// Vérifie si LanguageTool est installé (jar présent ET java présent ET fonctionnel).
// M13 : avant on testait seulement l'existence du fichier java.exe. Si le zip Java
// avait été partiellement extrait, java.exe existait mais plantait au lancement →
// le serveur LT ne démarrait jamais et l'utilisateur attendait 15 s pour rien.
// Maintenant on lance "java -version" pour valider que l'exécutable tourne vraiment.
// Comme c'est synchrone et potentiellement lent (~1 s), on garde un cache rapide
// sur l'existence du fichier, et la vérification d'exécution est différée.
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

// Variante asynchrone : valide que java.exe tourne vraiment (java -version).
// Utilisée avant startLtServer pour un diagnostic clair en cas de Java cassé.
function checkJavaWorks(javaExe) {
  return new Promise((resolve) => {
    if (!fs.existsSync(javaExe)) { resolve(false); return; }
    const { execFile } = require('child_process');
    execFile(javaExe, ['-version'], { windowsHide: true, timeout: 5000 }, (err, stdout, stderr) => {
      // java -version écrit sur stderr (comportement normal de la JVM)
      resolve(!err || /version/i.test(stderr + stdout));
    });
  });
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
  // M13 : valide que Java tourne vraiment avant de tenter le serveur (sinon on
  // attend 15 s pour rien si java.exe est cassé).
  const javaOk = await checkJavaWorks(javaExe);
  if (!javaOk) return false;
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
      // VAUBAN : valide le host AVANT chaque connexion (y compris redirections).
      let host;
      try { host = new URL(u).hostname; } catch (e) { reject(new Error('URL invalide')); return; }
      if (!isHostAllowed(host)) { reject(new Error('Vauban : host non autorisé ' + host)); return; }
      const req = https.get(u, { headers: { 'User-Agent': 'mini-dictaphone-v1' }, timeout: 180000 }, (res) => {
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
      });
      req.on('error', err => {
        file.close(); try { fs.unlinkSync(destPath); } catch (e) {} reject(err);
      });
      req.on('timeout', () => { req.destroy(new Error('timeout')); });  // évite blocage infini
    };
    doRequest(url);
  });
}

ipcMain.on('install-correcteur', async (event) => {
  // Anti double-clic : on partage le même drapeau qu'install-cli, sinon on
  // pouvait lancer install-cli ET install-correcteur en parallèle (double spawn
  // Java, conflits disque).
  if (installOngoing) { event.reply('install-correcteur-progress', { error: 'Une installation est déjà en cours, patientez.' }); return; }
  installOngoing = true;
  try {
  try { fs.mkdirSync(LT_DIR, { recursive: true }); } catch (e) {}

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
      // M10 : extract-zip (npm) au lieu d'Expand-Archive PowerShell (fragile sur Atlas OS).
      // R1 : extract-zip exige des chemins POSIX (slashs /) → on convertit.
      event.reply('install-correcteur-progress', { phase: 'java-extract' });
      const javaExtractTmp = path.join(LT_DIR, 'java_tmp');
      try { fs.rmSync(javaExtractTmp, { recursive: true, force: true }); } catch (e) {}
      await require('extract-zip')(javaZip, { dir: javaExtractTmp.replace(/\\/g, '/') });
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
      // M10 : extract-zip (npm) au lieu d'Expand-Archive PowerShell.
      // R1 : chemins POSIX requis par extract-zip.
      await require('extract-zip')(ltZip, { dir: ltExtractTmp.replace(/\\/g, '/') });
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
  } finally {
    installOngoing = false;  // libère le drapeau partagé avec install-cli
  }
});

// Utilitaire : pourcentage combiné pour la barre de progression globale.
// Phase 1 (Java, plus gros) ≈ 0-55%, Phase 2 (LanguageTool) ≈ 55-100%.
function combinedPercent(recv, tot, phase) {
  if (!tot) return 5;  // évite NaN/Infinity si le serveur n'envoie pas content-length
  if (phase === 1) return Math.round(recv / tot * 55);
  return Math.round(55 + (recv / tot) * 45);
}
