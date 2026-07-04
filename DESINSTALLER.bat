@echo off
chcp 65001 >nul
REM ============================================================
REM  Mini Dictaphone V1.3
REM  Fichier : DESINSTALLER.bat
REM ============================================================
title Desinstalleur Mini Dictaphone V1.3
color 0C

:: LIT LA LANGUE
set "LANG=fr"
if exist "%~dp0langue.txt" set /p LANG=<"%~dp0langue.txt"

:: LE DOSSIER A SUPPRIMER = celui qui contient ce .bat (SANS backslash final)
for %%I in ("%~dp0.") do set "TARGET=%%~fI"

:: BOITE DE CONFIRMATION (appel du script PowerShell dedie, a cote du .bat)
:: Si le ps1 manque (install corrompue), on demande confirmation en cmd.
:: CODES DE RETOUR du .ps1 : 6 = Oui (confirme), 7 = Non (annule), autre = erreur.
:: BUG CORRIGE : avant on testait "if errorlevel 7" (= >= 7). Si le .ps1 plantait
:: et retournait 1, le test echouait et la suppression se lancait SANS confirmation.
:: Maintenant on n'avance QUE si le code est exactement 6. Sinon = annulation safe.
if not exist "%~dp0desinstall_confirm.ps1" goto :confirm_cmd_fallback

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desinstall_confirm.ps1" -Lang "%LANG%"
if "%errorlevel%"=="6" goto :confirm_ok
echo.
echo Desinstallation annulee (code retour %errorlevel%).
timeout /t 2 /nobreak >nul
exit

:confirm_cmd_fallback
echo ATTENTION : ce programme va etre supprime definitivement.
set "CONFIRM="
set /p CONFIRM="Confirmer ? (O/N) : "
if /i not "%CONFIRM%"=="O" (
    echo Desinstallation annulee.
    timeout /t 2 /nobreak >nul
    exit
)
goto :confirm_ok

:confirm_ok
echo.
echo Desinstallation de : %TARGET%
echo.

:: ETAPE 1/4 : SUPPRIME LE RACCOURCI BUREAU
echo [1/4] Suppression du raccourci bureau...
if exist "%~dp0remove_shortcut.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0remove_shortcut.ps1"
)
echo       OK

:: ETAPE 2/4 : NETTOIE NODE.JS PORTABLE DU PATH (si installe par le dictaphone)
echo [2/4] Nettoyage de Node.js portable...
if exist "%~dp0remove_node_path.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0remove_node_path.ps1"
)
echo       OK

:: ETAPE 3/4 : GENERE UN SCRIPT VBS QUI SUPPRIMERA LE DOSSIER APRES FERMETURE
:: VBS est plus fiable que .bat : il attend que le .bat soit ferme, puis supprime.
echo [3/4] Preparation de la suppression...
set "VBS=%TEMP%\desinstall_dictaphone.vbs"

> "%VBS%" echo Set fso = CreateObject("Scripting.FileSystemObject")
>> "%VBS%" echo WScript.Sleep 1500
>> "%VBS%" echo On Error Resume Next
>> "%VBS%" echo fso.DeleteFolder "%TARGET%", True
>> "%VBS%" echo If Err.Number ^<^> 0 Then
>> "%VBS%" echo     ' Echec : on retente apres 3s
>> "%VBS%" echo     Err.Clear
>> "%VBS%" echo     WScript.Sleep 3000
>> "%VBS%" echo     fso.DeleteFolder "%TARGET%", True
>> "%VBS%" echo End If
>> "%VBS%" echo On Error Resume Next
>> "%VBS%" echo fso.DeleteFile WScript.ScriptFullName, True

:: ETAPE 4/4 : LANCE LE VBS EN ARRIERE-PLAN PUIS SE FERME
echo [4/4] Suppression du dossier...
echo.
echo ==========================================
echo  DESINSTALLATION LANCEE
echo ==========================================
echo.
echo Le dossier va etre supprime dans 1 a 2 secondes.
echo Vous pouvez fermer cette fenetre.
echo.
start "" wscript.exe "%VBS%"
exit
