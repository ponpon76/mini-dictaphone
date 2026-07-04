# 🎙️ Mini Dictaphone V1

*by ponpon 76*
*Code réalisé par Coder (GLM-5.2, ZCode)*

> 🇫🇷 [Version française ci-dessous](#-version-française) | 🇬🇧 [English version below](#-english-version)

---

## 🇫🇸 Version française

Un dictaphone vocal flottant, **toujours au premier plan**, avec reconnaissance vocale **100 % hors-ligne** via [Whisper](https://github.com/Const-me/Whisper). Aucune donnée (audio ou texte) ne quitte votre ordinateur.

### ✨ Fonctionnalités

- 🪟 **Fenêtre flottante Always-On-Top** — sans bord, compacte, transparente, redimensionnable.
- 🎤 **Reconnaissance vocale hors-ligne** — propulsée par Whisper (Const-me / GPGPU), 6 langues.
- 📊 **Indicateur VU** — visualise le niveau du micro en temps réel.
- 🌍 **Multi-langue** — interface en FR, EN, ES, PT, DE, IT (choix au 1er lancement, modifiable via ⚙️).
- 💾 **Sauvegarde automatique** — chaque dictée classée par jour, jamais de perte de texte.
- 📑 **Historique navigable** — boutons précédent/suivant pour parcourir et éditer les notes.
- 📎 **Insertion de fichiers** — insérez le contenu d'un fichier (texte, Excel, Word, PDF) à la suite de la dictée.
- 🗑️ **CLEAR intelligent** — efface l'écran *et* supprime la note du disque.
- 🧩 **Gestionnaire de modèles** — téléchargez/changez de modèle Whisper en 1 clic.
- 📋 **Tableau comparatif des modèles** — qualité par langue + consommation VRAM avec info-bulle.
- 🔄 **Mises à jour** — vérification de l'app et de l'exécutable Whisper (GitHub).
- 💻 **Détection GPU** — conseille le modèle adapté à votre VRAM.
- 🖼️ **Position/taille mémorisées** — la fenêtre réapparaît où vous l'avez laissée.
- ⌨️ **Raccourcis clavier globaux** — pilotez tout sans toucher la souris.
- 🔒 **100 % privé** — pas de cloud, pas de télémétrie, pas de compte. Whisper tourne sur votre GPU.
- 📂 **100 % portable** — tout tient dans un seul dossier (programme, Whisper, modèles, correcteur, sauvegardes). Copiez-le sur une clé USB : il fonctionne sur un autre PC sans réinstallation.
- ✅ **Correcteur d'orthographe** — LanguageTool 100 % local (3 modes : désactivé / auto / semi-auto avec panneau de relecture) + dictionnaire personnel.
- 🌐 **Traduction vers l'anglais** — bouton on/off, Whisper traduit votre dictée vers l'anglais (option native `--translate`).
- 📤 **Webhook n8n** — envoyez chaque dictée vers votre n8n (ou tout service) en POST JSON. Universel : Jarvis, Discord, Notion, un LLM...

### 🎯 Pour une meilleure transcription

La qualité du texte dépend autant de l'audio que du modèle Whisper. Trois leviers, par ordre d'efficacité :

1. **Le modèle Whisper** : `tiny`/`base` = beaucoup d'erreurs en français (déconseillé). `small` ⭐ = bon équilibre (recommandé). `medium` = très bon mais gourmand en VRAM (~5 Go). `large-v3` = excellent mais très lourd (~10 Go). Vérifiez votre VRAM dans ⚙️ avant de monter.
2. **La position du micro** : 15-30 cm de la bouche, pas de mouvement de tête, coupez le bruit ambiant.
3. **La prononciation** : articulez les fins de mots, ralentissez légèrement, faites des pauses entre phrases.

> 💡 **Recommandation** : commencez par le micro et le modèle `small`. Si les erreurs persistent et que votre VRAM le permet, montez à `medium`. Le correcteur d'orthographe corrige l'orthographe et la grammaire, mais **ne peut pas corriger un mot mal entendu** par Whisper (ex : « enant » au lieu de « un nain » = problème de transcription, pas de faute).

### 🔧 Ordinateurs sans GPU dédié (APU / CPU seul)

Pas de carte graphique dédiée ? Le Mini Dictaphone **fonctionne quand même**. Le moteur Whisper peut basculer en mode CPU (processeur) si aucun GPU n'est détecté. C'est plus lent mais utilisable.

**Modèles recommandés selon votre matériel :**

| Matériel | Modèle conseillé | Vitesse attendue |
|---|---|---|
| GPU dédié (2+ Go VRAM) | `small` ⭐ ou `medium` | Rapide (temps réel) |
| APU / GPU intégré | `tiny` ou `base` | Lent mais fonctionnel |
| CPU seul (ancien PC) | `tiny` uniquement | Très lent |

> ⚠️ Sur APU/CPU, `small` et au-delà sont **trop lents** pour une utilisation fluide. Restez sur `tiny` ou `base`. La qualité en français sera moins bonne, mais le correcteur d'orthographe compense en partie.

### 🏗️ Architecture

| Fichier | Rôle |
|---|---|
| `main.js` | Processus principal : fenêtre, IPC, raccourcis, permissions, MAJ, téléchargements, config, langue |
| `index.html` | Interface + capture audio + Whisper + sauvegardes + VU + historique + panneau MAJ/modèles |
| `langues.js` | Traductions de l'interface dans les 6 langues (modifiable pour amélioration) |
| `package.json` | Déclaration de l'app Electron |
| `config.json` | Configuration persistante (version, dépôt MAJ, langue, géométrie fenêtre) |
| `INSTALLATEUR.bat` | Installation propre + raccourci Bureau + détection d'install existante |
| `DESINSTALLER.bat` | Désinstallation complète avec confirmation multilingue |
| `MANUEL.txt` | Manuel utilisateur complet (FR + EN) |

### 📦 Installation rapide

1. **Installer le programme** : double-cliquez sur `INSTALLATEUR.bat`.
2. **Node.js** : l'installateur le détecte et l'installe **automatiquement** (fenêtre UAC possible). Si besoin, manuellement : [nodejs.org](https://nodejs.org/) (version LTS).
3. **Installer Whisper** depuis l'app : ⚙️ → Modèles → Télécharger (small recommandé).
4. **Installer main.exe** : téléchargez [`cli.zip`](https://github.com/Const-me/Whisper/releases/latest) et extrayez-le dans le dossier `Whisper/`.
5. **Lancer** via le raccourci Bureau (épinglable à la barre des tâches Windows 11). Au 1er lancement, choix de la langue.

### 🤝 Contribuer aux traductions

Les traductions (ES, PT, DE, IT) sont correctes mais perfectibles. Si une langue est votre langue maternelle et que vous voyez une amélioration possible, modifiez le fichier `langues.js` et proposez vos changements. Toutes les contributions sont les bienvenues.

---

## 🇬🇧 English version

A floating voice dictaphone, **always on top**, with **100% offline** speech recognition via [Whisper](https://github.com/Const-me/Whisper). No data (audio or text) ever leaves your computer.

### ✨ Features

- 🪟 **Floating Always-On-Top window** — borderless, compact, transparent, resizable.
- 🎤 **Offline speech recognition** — powered by Whisper (Const-me / GPGPU), 6 languages.
- 📊 **VU meter** — visualizes the microphone level in real time.
- 🌍 **Multi-language** — interface in FR, EN, ES, PT, DE, IT (chosen at first launch, editable via ⚙️).
- 💾 **Automatic save** — each dictation organized by day, never lose text.
- 📑 **Navigable history** — previous/next buttons to browse and edit notes.
- 📎 **File insertion** — insert the content of a file (text, Excel, Word, PDF) after the dictation.
- 🗑️ **Smart CLEAR** — clears the screen *and* deletes the note from disk.
- 🧩 **Model manager** — download/switch Whisper model in 1 click.
- 📋 **Model comparison table** — quality per language + VRAM usage with tooltip.
- 🔄 **Updates** — app and Whisper executable check (GitHub).
- 💻 **GPU detection** — recommends the model suited to your VRAM.
- 🖼️ **Position/size memory** — the window reappears where you left it.
- ⌨️ **Global keyboard shortcuts** — control everything without touching the mouse.
- 🔒 **100% private** — no cloud, no telemetry, no account. Whisper runs on your GPU.
- 📂 **100% portable** — everything fits in a single folder (program, Whisper, models, spellchecker, saves). Copy it to a USB stick: it runs on another PC with no reinstallation.
- ✅ **Spellchecker** — 100% local LanguageTool (3 modes: off / auto / semi-auto with review panel) + personal dictionary.
- 🌐 **Translation to English** — on/off button, Whisper translates your dictation into English (native `--translate` option).
- 📤 **n8n Webhook** — send each dictation to your n8n (or any service) as POST JSON. Universal: Jarvis, Discord, Notion, an LLM...

### 🎯 For better transcription

Text quality depends as much on the audio as on the Whisper model. Three levers, by effectiveness:

1. **The Whisper model**: `tiny`/`base` = many errors in French (not recommended). `small` ⭐ = good balance (recommended). `medium` = very good but VRAM-hungry (~5 GB). `large-v3` = excellent but very heavy (~10 GB). Check your VRAM in ⚙️ before upgrading.
2. **Microphone position**: 6-12 inches (15-30 cm) from the mouth, no head movement, cut ambient noise.
3. **Pronunciation**: articulate word endings, slow down slightly, pause between sentences.

> 💡 **Recommendation**: start with the mic and the `small` model. If errors persist and your VRAM allows it, upgrade to `medium`. The spellchecker fixes spelling and grammar, but **cannot fix a misheard word** by Whisper (e.g. "enant" instead of "a dwarf" = a transcription issue, not a spelling mistake).

### 🏗️ Architecture

| File | Role |
|---|---|
| `main.js` | Main process: window, IPC, shortcuts, permissions, updates, downloads, config, language |
| `index.html` | Interface + audio capture + Whisper + saves + VU + history + updates/models panel |
| `langues.js` | Interface translations in 6 languages (editable for improvement) |
| `package.json` | Electron app declaration |
| `config.json` | Persistent configuration (version, update repo, language, window geometry) |
| `INSTALLATEUR.bat` | Clean installation + Desktop shortcut + existing install detection |
| `DESINSTALLER.bat` | Full uninstall with multilingual confirmation |
| `MANUEL.txt` | Complete user manual (FR + EN) |

### 📦 Quick installation

1. **Install the program**: double-click `INSTALLATEUR.bat`.
2. **Node.js**: the installer detects it and installs it **automatically** (UAC prompt possible). If needed, manually: [nodejs.org](https://nodejs.org/) (LTS version).
3. **Install Whisper** from the app: ⚙️ → Models → Download (small recommended).
4. **Install main.exe**: download [`cli.zip`](https://github.com/Const-me/Whisper/releases/latest) and extract it into the `Whisper/` folder.
5. **Launch** via the Desktop shortcut (pinnable to Windows 11 taskbar). At first launch, choose your language.

### 🤝 Contributing translations

Translations (ES, PT, DE, IT) are correct but could be improved. If one of these is your native language and you see a possible improvement, edit the `langues.js` file and submit your changes. All contributions are welcome.

---

## 🙏 Remerciements / Acknowledgements

- **Whisper** by OpenAI — speech recognition model.
- **Const-me/Whisper** — high-performance Windows port (GPGPU) and CLI.
- **Electron** — application framework.

## 📄 Licence

Projet open source. Libre de réutilisation et de modification.
Open source project. Free to reuse and modify.

---

> 📖 Voir aussi / See also **`MANUEL.txt`** pour le manuel détaillé / for the detailed manual.
