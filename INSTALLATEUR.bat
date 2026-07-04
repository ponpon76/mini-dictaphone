@echo off
REM ============================================================
REM  Mini Dictaphone V1.3
REM  by ponpon 76
REM  Open source - libre de reutilisation et modification
REM  Fichier : INSTALLATEUR.bat
REM ============================================================
title Installateur Mini Dictaphone V1.3
color 0B
chcp 65001 >nul

echo ==========================================
echo   Mini Dictaphone V1.3 - Installation
echo ==========================================
echo.

REM ============================================================
REM === ETAPE 1/5 : DETECTION + INSTALLATION AUTO DE NODE.JS ===
REM Node.js est requis pour faire tourner Electron.
REM Methode : on utilise la version PORTABLE (zip) installee dans le
REM dossier utilisateur (%LOCALAPPDATA%\NodeJS_MiniDictaphone). AUCUN droit admin / UAC.
REM Dossier DEDIE au Mini Dictaphone pour ne pas casser un Node partage
REM par d'autres apps (Jarvis, etc.).
REM ============================================================
echo [1/5] Verification de Node.js...
where node >nul 2>&1
if %errorlevel%==0 (
    echo       Node.js est deja installe :
    node --version
    echo.
    goto :node_ok
)
echo       [LOG] Node.js absent - lancement installation portable.

echo       Node.js est absent. Installation automatique en cours...
echo       (Aucune fenetre d'autorisation ne devrait s'afficher.)

REM --- Telecharge la LTS portable de Node.js et l'installe sans UAC ---
set "NODE_DIR=%LOCALAPPDATA%\NodeJS_MiniDictaphone"
set "NODE_ZIP=%TEMP%\node-portable.zip"

REM --- Lance le script PowerShell dedie (dans PROGRAM/) ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PROGRAM\install_node_portable.ps1" -NodeDir "%NODE_DIR%" -NodeZip "%NODE_ZIP%"
if %errorlevel% neq 0 (
    echo.
    echo ==========================================
    echo  ECHEC DE L'INSTALLATION DE NODE.JS
    echo ==========================================
    echo  Le telechargement automatique a echoue.
    echo  Causes possibles : pas de connexion internet,
    echo  antivirus qui bloque, ou pare-feu restrictif.
    echo.
    echo  Vous pouvez installer Node.js manuellement :
    echo    1. Allez sur https://nodejs.org
    echo    2. Telechargez la version LTS et installez-la
    echo    3. Relancez cet installateur
    echo.
    pause
    exit
)

REM --- Rend Node accessible dans cette session + de facon persistante ---
set "PATH=%NODE_DIR%;%PATH%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PROGRAM\set_node_path.ps1" -NodeDir "%NODE_DIR%" >nul 2>&1

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Node.js a ete installe mais n'est pas accessible.
    echo  Veuillez FERMER cette fenetre et RELANCER INSTALLATEUR.bat.
    echo.
    pause
    exit
)
echo       Node.js operationnel :
node --version
echo.

:node_ok

REM ============================================================
REM === ETAPE 2/5 : CHOIX DU DOSSIER D'INSTALLATION ===
REM ============================================================
echo [2/5] Choix du dossier d'installation...
echo       Une fenetre de selection va s'ouvrir.
echo.

REM Capture le dossier choisi via un fichier temporaire UTF-8 (pas stdout).
REM Avant on utilisait "for /f ... in ('powershell ...')" qui corrompait les
REM accents (Élise, François...) à cause du decalage d'encodage cmd/PowerShell.
set "INSTALL_DIR="
set "FICHIER_CHOIX=%TEMP%\dictaphone_install_dir.txt"
if exist "%FICHIER_CHOIX%" del "%FICHIER_CHOIX%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PROGRAM\select_folder.ps1" -OutFile "%FICHIER_CHOIX%"
if exist "%FICHIER_CHOIX%" (
    REM Lecture de la 1re ligne du fichier (chemin choisi) en UTF-8.
    REM chcp 65001 est deja actif (ligne 10), donc les accents passent.
    set /p INSTALL_DIR=<"%FICHIER_CHOIX%"
    del "%FICHIER_CHOIX%" >nul 2>&1
)

if "%INSTALL_DIR%"=="" (
    echo Installation annulee.
    pause
    exit
)

echo       Installation dans : %INSTALL_DIR%\MiniDictaphone
echo.

REM ============================================================
REM === ETAPE 3/5 : DETECTION D'UNE INSTALLATION EXISTANTE ===
REM ============================================================
REM NOTE : on evite le piege du "set /p" dans un bloc if (...).
REM En batch, %CHOIX% est evalue au parse-time (avant le set /p), donc les
REM choix 2 et 3 n'etaient JAMAIS pris en compte. On sort du bloc avec goto
REM pour poser la question et tester CHOIX en dehors de tout if.
if not exist "%INSTALL_DIR%\MiniDictaphone\main.js" goto :no_existing_install

echo [3/5] Installation existante detectee.
echo       Voulez-vous :
echo         [1] REMPLACER (supprime l'ancien, garde vos sauvegardes)
echo         [2] TOUT SUPPRIMER puis reinstalller (efface tout, meme les sauvegardes)
echo         [3] ANNULER
echo.
set "CHOIX=1"
set /p CHOIX="      Votre choix (1/2/3) [defaut=1] : "
if /i "%CHOIX%"=="3" goto :cancel
if /i "%CHOIX%"=="2" goto :wipe_all

REM --- Choix 1 (defaut) : REMPLACER en preservant les donnees ---
echo       Sauvegarde de vos donnees...
if exist "%INSTALL_DIR%\MiniDictaphone\Sauvegardes" move /Y "%INSTALL_DIR%\MiniDictaphone\Sauvegardes" "%INSTALL_DIR%\_sauvegarde_temp" >nul 2>&1
if exist "%INSTALL_DIR%\MiniDictaphone\Whisper" move /Y "%INSTALL_DIR%\MiniDictaphone\Whisper" "%INSTALL_DIR%\_sauvegarde_temp_whisper" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PROGRAM\remove_folder.ps1" -Path "%INSTALL_DIR%\MiniDictaphone"
echo.
goto :after_wipe

:wipe_all
echo       Suppression de l'ancienne installation complete...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PROGRAM\remove_folder.ps1" -Path "%INSTALL_DIR%\MiniDictaphone"
echo.
goto :after_wipe

:no_existing_install
echo [3/5] Aucune installation existante detectee.

:after_wipe
mkdir "%INSTALL_DIR%\MiniDictaphone" 2>nul

if exist "%INSTALL_DIR%\_sauvegarde_temp" (
    move /Y "%INSTALL_DIR%\_sauvegarde_temp" "%INSTALL_DIR%\MiniDictaphone\Sauvegardes" >nul 2>&1
)
if exist "%INSTALL_DIR%\_sauvegarde_temp_whisper" (
    move /Y "%INSTALL_DIR%\_sauvegarde_temp_whisper" "%INSTALL_DIR%\MiniDictaphone\Whisper" >nul 2>&1
)

mkdir "%INSTALL_DIR%\MiniDictaphone\Whisper" 2>nul
mkdir "%INSTALL_DIR%\MiniDictaphone\Sauvegardes" 2>nul
goto :install

:cancel
echo Installation annulee.
pause
exit

:install

REM ============================================================
REM === ETAPE 4/5 : COPIE DES FICHIERS + ELECTRON ===
REM ============================================================
echo [4/5] Copie des fichiers du programme...
copy "%~dp0PROGRAM\main.js" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0PROGRAM\langues.js" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0PROGRAM\index.html" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0PROGRAM\package.json" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0PROGRAM\package-lock.json" "%INSTALL_DIR%\MiniDictaphone\" >nul
REM config.json : ne copier que s'il existe dans PROGRAM/ (sinon il sera créé
REM automatiquement par l'app au 1er lancement via DEFAULT_CONFIG).
if exist "%~dp0PROGRAM\config.json" copy "%~dp0PROGRAM\config.json" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0MANUEL.txt" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0README.md" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0DESINSTALLER.bat" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0PROGRAM\desinstall_confirm.ps1" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0PROGRAM\remove_shortcut.ps1" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0PROGRAM\remove_node_path.ps1" "%INSTALL_DIR%\MiniDictaphone\" >nul

REM Copie node_modules s'il existe dans PROGRAM/ (install offline).
REM NOTE : sur un clone GitHub, node_modules/ est absent (gitignore) → ce bloc
REM est ignoré et npm install se charge des dépendances (étape 4/5).
if exist "%~dp0PROGRAM\node_modules\electron\dist\electron.exe" (
    echo       Copie des dependances (node_modules)...
    xcopy /E /I /Q /Y "%~dp0PROGRAM\node_modules" "%INSTALL_DIR%\MiniDictaphone\node_modules" >nul 2>&1
)
echo       Fichiers copies.

:: Force le choix de langue au prochain lancement
if exist "%INSTALL_DIR%\MiniDictaphone\langue.txt" del "%INSTALL_DIR%\MiniDictaphone\langue.txt" >nul 2>&1

:: === Creation du fichier de lancement ===
echo       Creation du lanceur...
echo @echo off > "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo chcp 65001 ^>nul >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo cd /d "%%~dp0" >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo REM Ajoute Node portable au PATH si present (installe par l'installateur) >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo if exist "%%LOCALAPPDATA%%\NodeJS_MiniDictaphone\node.exe" set "PATH=%%LOCALAPPDATA%%\NodeJS_MiniDictaphone;%%PATH%" >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo if not exist "node_modules\electron\dist\electron.exe" ( >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo   echo ============================================================ >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo   echo  Finalisation de l'installation ^(Electron manquant^)... >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo   echo  Ceci peut prendre quelques minutes. Ne fermez pas. >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo   echo ============================================================ >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo   call npm install >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo ^) >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo start "Mini Dictaphone V1" /wait "node_modules\electron\dist\electron.exe" . >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"

:: === Installation d'Electron ===
:: Si node_modules a ete copie (offline), on verifie electron.exe. Sinon, npm install.
if not exist "%INSTALL_DIR%\MiniDictaphone\node_modules\electron\dist\electron.exe" (
    echo       Telechargement d'Electron (peut prendre quelques minutes)...
    cd /d "%INSTALL_DIR%\MiniDictaphone" && call npm install > "%INSTALL_DIR%\MiniDictaphone\install.log" 2>&1
    cd /d "%~dp0"
) else (
    echo       Dependances deja presentes (copie offline).
)

:: === VERIFICATION qu'Electron est bien installe (Bug B) ===
if not exist "%INSTALL_DIR%\MiniDictaphone\node_modules\electron\dist\electron.exe" (
    echo.
    echo ==========================================
    echo  ECHEC DE L'INSTALLATION D'ELECTRON
    echo ==========================================
    echo  Electron n'a pas pu etre installe.
    echo  Causes possibles : connexion internet instable,
    echo  ou telechargement interrompu.
    echo.
    echo  Un journal d'installation a ete cree :
    echo    "%INSTALL_DIR%\MiniDictaphone\install.log"
    echo.
    echo  Relancez cet installateur. Si le probleme persiste,
    echo  ouvrez le dossier "%INSTALL_DIR%\MiniDictaphone" puis
    echo  tapez : npm install
    echo.
    pause
    exit
)
echo       Electron installe avec succes.

:: === Creation du fichier d'instructions Whisper ===
echo       Creation du fichier d'instructions Whisper...
echo ========================================== > "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo INSTALLATION DU MOTEUR WHISPER (a faire une fois) >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo ========================================== >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo Pour que le Whisper de ce dictaphone n'interfere pas avec >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo d'autres logiciels (comme Jarvis), il DOIT etre isole. >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo. >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo --- ETAPE A : L'EXECUTABLE (cli.zip) --- >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo 1. Ouvre ce lien dans ton navigateur internet : >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo    https://github.com/Const-me/Whisper/releases/latest >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo. >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo 2. Cherche le fichier "cli.zip" (PAS WhisperDesktop.zip !). >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo. >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo 3. Clic droit sur "cli.zip" -> "Extraire tout..." >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo    Dossier cible : "%INSTALL_DIR%\MiniDictaphone\Whisper" >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo    (ca y deposera main.exe et ses dlls) >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo. >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo --- ETAPE B : LE MODELE (ggml-*.bin) --- >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo 4. Telecharge le modele francais (env. 3 Go, une seule fois) : >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo. >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo 5. Place le fichier ggml-large-v3.bin dans : >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo    "%INSTALL_DIR%\MiniDictaphone\Whisper" >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo. >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo --- RESUME DE LA STRUCTURE ATTENDUE --- >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo    Whisper\main.exe            (venu de cli.zip) >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo    Whisper\ggml-large-v3.bin   (le modele telecharge) >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo. >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo Une fois termine, relance le Mini Dictaphone. >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
echo ========================================== >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"

REM ============================================================
REM === ETAPE 5/5 : RACCOURCI BUREAU + MESSAGE FINAL + LANCEMENT AUTO ===
REM ============================================================
echo [5/5] Creation du raccourci sur le bureau...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PROGRAM\create_shortcut.ps1" -TargetPath "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat" -WorkingDir "%INSTALL_DIR%\MiniDictaphone"
echo       Raccourci cree.

echo.
echo ==========================================
echo   INSTALLATION TERMINEE AVEC SUCCES !
echo ==========================================
echo.
echo   Un raccourci "Mini Dictaphone V1" a ete place
echo   sur votre bureau. Double-cliquez dessus pour
echo   lancer le programme a l'avenir.
echo.
echo   Lancement du Mini Dictaphone en cours...
echo.

:: === LANCEMENT AUTOMATIQUE du dictaphone (sans pause) ===
cd /d "%INSTALL_DIR%\MiniDictaphone"
start "" "node_modules\electron\dist\electron.exe" .
exit
