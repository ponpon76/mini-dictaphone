@echo off
REM ============================================================
REM  Mini Dictaphone V1
REM  by ponpon 76
REM  Open source - libre de reutilisation et modification
REM  Fichier : INSTALLATEUR.bat
REM ============================================================
title Installateur Mini Dictaphone V1
color 0B

REM ============================================================
REM === DETECTION + INSTALLATION AUTO DE NODE.JS (si absent) ===
REM Node.js est requis pour faire tourner Electron. Si on le detecte pas,
REM on telecharge la LTS officielle et on l'installe silencieusement.
REM L'installation silencieuse demande les droits admin (fenetre UAC).
REM ============================================================
echo Verification de Node.js...
where node >nul 2>&1
if %errorlevel%==0 (
    echo Node.js est deja installe.
    node --version
    echo.
    goto :node_ok
)

echo ==========================================
echo  NODE.JS MANQUE - Installation automatique
echo ==========================================
echo Le Mini Dictaphone a besoin de Node.js pour fonctionner.
echo Une fenetre Windows va demander votre autorisation (c'est normal).
echo Veuillez cliquer "Oui" pour installer Node.js automatiquement.
echo.

REM Lance un PowerShell qui : telecharge la LTS, l'installe silencieusement
powershell -NoProfile -ExecutionPolicy Bypass -Command "^
$ErrorActionPreference = 'Stop';^
try {^
    $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json';^
    $lts = $idx ^| Where-Object { $_.lts -ne $false -and $_.security -ne $true } ^| Select-Object -First 1;^
    if (-not $lts) { $lts = $idx ^| Where-Object { $_.lts -ne $false } ^| Select-Object -First 1 };^
    $ver = $lts.version;^
    Write-Host ('Version LTS detectee : ' + $ver);^
    $url = 'https://nodejs.org/dist/' + $ver + '/node-' + $ver + '-x64.msi';^
    $tmp = [Environment]::GetEnvironmentVariable('TEMP') + '\node-install.msi';^
    Write-Host 'Telechargement de Node.js...';^
    Invoke-WebRequest -Uri $url -OutFile $tmp;^
    Write-Host 'Installation silencieuse (fenetre UAC possible)...';^
    $p = Start-Process msiexec.exe -ArgumentList '/i', $tmp, '/quiet', '/norestart' -Wait -PassThru;^
    if ($p.ExitCode -ne 0) { throw ('msiexec a echoue : code ' + $p.ExitCode) };^
    Remove-Item $tmp -Force;^
    Write-Host 'Node.js installe avec succes.';^
} catch {^
    Write-Host ('ERREUR : ' + $_.Exception.Message);^
    exit 1;^
}"

if %errorlevel% neq 0 (
    echo.
    echo ==========================================
    echo  ECHEC DE L'INSTALLATION DE NODE.JS
    echo ==========================================
    echo Vous pouvez l'installer manuellement depuis https://nodejs.org
    echo puis relancer cet installateur.
    echo.
    pause
    exit
)

echo.
echo Rechargement de Node.js...
REM Apres install silencieuse, le PATH du cmd courant n'est pas mis a jour.
REM On relit le PATH depuis le registre pour avoir node/npm dans cette session.
for /f "usebackq tokens=2,*" %%A in (`reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul`) do set "SYS_PATH=%%B"
set "PATH=%SYS_PATH%;%PATH%"

REM Verifie que node est maintenant accessible
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo Node.js a ete installe mais n'est pas accessible dans cette session.
    echo Veuillez FERMER cette fenetre et RELANCER INSTALLATEUR.bat.
    echo.
    pause
    exit
)
echo Node.js operationnel :
node --version
echo.

:node_ok
echo Veuillez choisir le dossier ou vous voulez installer le programme...
echo (Une fenetre de selection va s'ouvrir)
echo.

for /f "delims=" %%I in ('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Ou installer le Mini Dictaphone ?'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }"') do set "INSTALL_DIR=%%I"

if "%INSTALL_DIR%"=="" (
    echo Installation annulee.
    pause
    exit
)

echo.
echo Installation dans : %INSTALL_DIR%\MiniDictaphone
echo.

:: === DETECTION D'UNE INSTALLATION EXISTANTE ===
:: Si un dossier MiniDictaphone existe deja a cet endroit, on demande quoi faire
:: pour eviter l'imbrication (bug qui creait des dossiers dans des dossiers).
if exist "%INSTALL_DIR%\MiniDictaphone\main.js" (
    echo ==========================================
    echo  ATTENTION : INSTALLATION EXISTANTE DETECTEE
    echo ==========================================
    echo Un Mini Dictaphone est DEJA installe ici :
    echo   %INSTALL_DIR%\MiniDictaphone
    echo.
    echo Voulez-vous :
    echo   [1] REMPLACER (supprime l'ancien, garde vos sauvegardes)
    echo   [2] TOUT SUPPRIMER puis reinstalller (efface tout, meme les sauvegardes)
    echo   [3] ANNULER
    echo.
    set /p CHOIX="Votre choix (1/2/3) : "
    if /i "%CHOIX%"=="3" goto :cancel
    if /i "%CHOIX%"=="2" (
        echo Suppression de l'ancienne installation complete...
        powershell -NoProfile -Command "Remove-Item -LiteralPath '%INSTALL_DIR%\MiniDictaphone' -Recurse -Force -ErrorAction SilentlyContinue"
    ) else (
        echo Sauvegarde de vos donnees...
        :: Deplace Sauvegardes et Whisper (modeles) dans un dossier temporaire
        if exist "%INSTALL_DIR%\MiniDictaphone\Sauvegardes" move /Y "%INSTALL_DIR%\MiniDictaphone\Sauvegardes" "%INSTALL_DIR%\_sauvegarde_temp" >nul 2>&1
        if exist "%INSTALL_DIR%\MiniDictaphone\Whisper" move /Y "%INSTALL_DIR%\MiniDictaphone\Whisper" "%INSTALL_DIR%\_sauvegarde_temp_whisper" >nul 2>&1
        powershell -NoProfile -Command "Remove-Item -LiteralPath '%INSTALL_DIR%\MiniDictaphone' -Recurse -Force -ErrorAction SilentlyContinue"
    )
    echo.
)

mkdir "%INSTALL_DIR%\MiniDictaphone" 2>nul

:: Restaure les donnees sauvegardees si on a choisi "remplacer"
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

echo Copie des fichiers du programme...
copy "%~dp0main.js" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0langues.js" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0index.html" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0package.json" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0config.json" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0MANUEL.txt" "%INSTALL_DIR%\MiniDictaphone\" >nul
copy "%~dp0README.md" "%INSTALL_DIR%\MiniDictaphone\" >nul

:: Supprime langue.txt : force le choix de langue au prochain lancement
if exist "%INSTALL_DIR%\MiniDictaphone\langue.txt" del "%INSTALL_DIR%\MiniDictaphone\langue.txt" >nul 2>&1

:: Création du fichier de lancement
:: Le .bat installe electron si besoin, puis lance electron.exe directement avec start /wait
:: Ainsi, quand la fenetre du dictaphone se ferme, le .bat se termine et la fenetre cmd se ferme aussi.
echo Creation du lanceur...
echo @echo off > "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo chcp 65001 ^>nul >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo cd /d "%%~dp0" >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo if not exist "node_modules\electron\dist\electron.exe" call npm install electron --save-dev >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"
echo start "Mini Dictaphone V1" /wait "node_modules\electron\dist\electron.exe" . >> "%INSTALL_DIR%\MiniDictaphone\Mini Dictaphone V1.bat"

:: Création du fichier texte STRICT sur Whisper
echo Creation du fichier d'instructions Whisper...
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
echo    (ça y deposera main.exe et ses dlls) >> "%INSTALL_DIR%\MiniDictaphone\LISEZ_MOI_WHISPER.txt"
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

:: Création du raccourci sur le bureau
:: Pointe vers electron.exe (épinglable sur Windows 11) avec l'argument "." (dossier courant)
:: Le nom affiché sera "Mini Dictaphone V1" grace au productName du package.json
echo.
echo Installation d'Electron (peut prendre quelques minutes au 1er lancement)...
cd /d "%INSTALL_DIR%\MiniDictaphone" && call npm install electron --save-dev >nul 2>&1
cd /d "%~dp0"

echo Creation du raccourci sur le bureau...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Mini Dictaphone V1.lnk'); $s.TargetPath = '%INSTALL_DIR%\MiniDictaphone\node_modules\electron\dist\electron.exe'; $s.Arguments = '.'; $s.WorkingDirectory = '%INSTALL_DIR%\MiniDictaphone'; $s.Description = 'Mini Dictaphone V1'; $s.Save()"

echo.
echo ==========================================
echo  INSTALLATION TERMINEE AVEC SUCCES !
echo ==========================================
pause