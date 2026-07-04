@echo off
REM ============================================================
REM  Mini Dictaphone V1.2
REM  by ponpon 76
REM  Open source - libre de reutilisation et modification
REM  Fichier : INSTALLATEUR.bat
REM ============================================================
title Installateur Mini Dictaphone V1.2
color 0B
chcp 65001 >nul

echo ==========================================
echo   Mini Dictaphone V1.2 - Installation
echo ==========================================
echo.

REM ============================================================
REM === ETAPE 1/5 : DETECTION + INSTALLATION AUTO DE NODE.JS ===
REM Node.js est requis pour faire tourner Electron.
REM Methode : on utilise la version PORTABLE (zip) installee dans le
REM dossier utilisateur (%LOCALAPPDATA%\NodeJS). AUCUN droit admin / UAC.
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
set "NODE_DIR=%LOCALAPPDATA%\NodeJS"
set "NODE_ZIP=%TEMP%\node-portable.zip"

powershell -NoProfile -ExecutionPolicy Bypass -Command "^
$ErrorActionPreference = 'Stop';^
try {^
    $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json';^
    $lts = $idx ^| Where-Object { $_.lts -ne $false -and $_.security -ne $true } ^| Select-Object -First 1;^
    if (-not $lts) { $lts = $idx ^| Where-Object { $_.lts -ne $false } ^| Select-Object -First 1 };^
    $ver = $lts.version;^
    Write-Host ('      Version LTS detectee : ' + $ver);^
    $url = 'https://nodejs.org/dist/' + $ver + '/node-' + $ver + '-win-x64.zip';^
    Write-Host '      Telechargement de Node.js (version portable)...';^
    Invoke-WebRequest -Uri $url -OutFile '%NODE_ZIP%';^
    Write-Host '      Decompression...';^
    $dest = '%NODE_DIR%';^
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force };^
    Expand-Archive -LiteralPath '%NODE_ZIP%' -DestinationPath $dest -Force;^
    # Le zip contient un sous-dossier node-vX-win-x64 ; on remonte son contenu
    $sub = Get-ChildItem $dest -Directory ^| Select-Object -First 1;^
    if ($sub) {^
        Move-Item -Path (Join-Path $sub.FullName '*') -Destination $dest -Force;^
        Remove-Item $sub.FullName -Force;^
    };^
    Remove-Item '%NODE_ZIP%' -Force;^
    Write-Host '      Node.js installe avec succes.';^
} catch {^
    Write-Host ('      ERREUR : ' + $_.Exception.Message);^
    exit 1;^
}"

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
powershell -NoProfile -Command "[Environment]::SetEnvironmentVariable('Path', '%NODE_DIR%;' + [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')" >nul 2>&1

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

for /f "delims=" %%I in ('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Ou installer le Mini Dictaphone ?'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }"') do set "INSTALL_DIR=%%I"

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
if exist "%INSTALL_DIR%\MiniDictaphone\main.js" (
    echo [3/5] Installation existante detectee.
    echo       Voulez-vous :
    echo         [1] REMPLACER (supprime l'ancien, garde vos sauvegardes)
    echo         [2] TOUT SUPPRIMER puis reinstalller (efface tout, meme les sauvegardes)
    echo         [3] ANNULER
    echo.
    set /p CHOIX="      Votre choix (1/2/3) : "
    if /i "%CHOIX%"=="3" goto :cancel
    if /i "%CHOIX%"=="2" (
        echo       Suppression de l'ancienne installation complete...
        powershell -NoProfile -Command "Remove-Item -LiteralPath '%INSTALL_DIR%\MiniDictaphone' -Recurse -Force -ErrorAction SilentlyContinue"
    ) else (
        echo       Sauvegarde de vos donnees...
        if exist "%INSTALL_DIR%\MiniDictaphone\Sauvegardes" move /Y "%INSTALL_DIR%\MiniDictaphone\Sauvegardes" "%INSTALL_DIR%\_sauvegarde_temp" >nul 2>&1
        if exist "%INSTALL_DIR%\MiniDictaphone\Whisper" move /Y "%INSTALL_DIR%\MiniDictaphone\Whisper" "%INSTALL_DIR%\_sauvegarde_temp_whisper" >nul 2>&1
        powershell -NoProfile -Command "Remove-Item -LiteralPath '%INSTALL_DIR%\MiniDictaphone' -Recurse -Force -ErrorAction SilentlyContinue"
    )
    echo.
)
if not exist "%INSTALL_DIR%\MiniDictaphone\main.js" echo [3/5] Aucune installation existante detectee.

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
copy "%~dp0PROGRAM\config.json" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0MANUEL.txt" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0README.md" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0DESINSTALLER.bat" "%INSTALL_DIR%\MiniDictaphone\" >nul
echo       Fichiers copies.

:: Force le choix de langue au prochain lancement
if exist "%INSTALL_DIR%\MiniDictaphone\langue.txt" del "%INSTALL_DIR%\MiniDictaphone\langue.txt" >nul 2>&1

:: === Creation du fichier de lancement ===
echo       Creation du lanceur...
echo @echo off > "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo chcp 65001 ^>nul >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo cd /d "%%~dp0" >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo if not exist "node_modules\electron\dist\electron.exe" call npm install electron --save-dev >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo start "Mini Dictaphone V1" /wait "node_modules\electron\dist\electron.exe" . >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"

:: === Installation d'Electron ===
echo       Installation d'Electron (peut prendre quelques minutes)...
cd /d "%INSTALL_DIR%\MiniDictaphone" && call npm install >nul 2>&1
cd /d "%~dp0"

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
    echo  Relancez cet installateur. Si le probleme persiste,
    echo  ouvrez le dossier "%INSTALL_DIR%\MiniDictaphone" puis
    echo  tapez : npm install electron --save-dev
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
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Mini Dictaphone V1.lnk'); $s.TargetPath = '%INSTALL_DIR%\MiniDictaphone\node_modules\electron\dist\electron.exe'; $s.Arguments = '.'; $s.WorkingDirectory = '%INSTALL_DIR%\MiniDictaphone'; $s.Description = 'Mini Dictaphone V1'; $s.Save()"
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

:cancel_late
pause
exit
