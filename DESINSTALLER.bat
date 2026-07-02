@echo off
chcp 65001 >nul
REM ============================================================
REM  Mini Dictaphone V1
REM  by ponpon 76
REM  Open source - libre de reutilisation et modification
REM  Fichier : DESINSTALLER.bat
REM ============================================================
title Desinstalleur Mini Dictaphone V1
color 0C

:: ==========================================
:: LIT LA LANGUE CHOISIE PAR L'UTILISATEUR
:: ==========================================
set "LANG=fr"
if exist "%~dp0langue.txt" set /p LANG=<"%~dp0langue.txt"

:: ==========================================
:: BOÎTE DE CONFIRMATION MULTILINGUE (PowerShell)
:: Renvoie : Yes=6 (confirme), No=7 (annule)
:: ==========================================
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Add-Type -AssemblyName PresentationFramework;" ^
  "$msg = switch -Wildcard ('%LANG%') {" ^
  "  'fr' { 'ATTENTION : cette action va SUPPRIMER DEFINITIVEMENT : le programme complet, le moteur Whisper + le modele, TOUTES vos sauvegardes (notes), TOUTES les pieces jointes. Vos notes seront PERDUES pour toujours. Confirmer ?' }" ^
  "  'en' { 'WARNING: this action will PERMANENTLY DELETE: the complete program, the Whisper engine + model, ALL your saves (notes), ALL attachments. Your notes will be LOST forever. Confirm?' }" ^
  "  'es' { 'ATENCION: esta accion ELIMINARA DEFINITIVAMENTE: el programa completo, el motor Whisper + el modelo, TODAS sus copias (notas), TODOS los archivos adjuntos. Sus notas se PERDERAN para siempre. ^Confirma?' }" ^
  "  'pt' { 'ATENCAO: esta acao vai APAGAR DEFINITIVAMENTE: o programa completo, o motor Whisper + o modelo, TODOS os seus backups (notas), TODOS os anexos. As suas notas vao PERDER-SE para sempre. Confirmar?' }" ^
  "  'de' { 'ACHTUNG: Diese Aktion wird DAUERHAFT LOSCHEN: das komplette Programm, die Whisper-Engine + Modell, ALLE Ihre Sicherungen (Notizen), ALLE Anhange. Ihre Notizen gehen FUR IMMER verloren. Bestatigen?' }" ^
  "  'it' { 'ATTENZIONE: questa azione ELIMINERA DEFINITIVAMENTE: il programma completo, il motore Whisper + il modello, TUTTI i tuoi salvataggi (note), TUTTI gli allegati. Le tue note andranno PERSI per sempre. Confermi?' }" ^
  "  default { 'ATTENTION : cette action va SUPPRIMER DEFINITIVEMENT : le programme complet, le moteur Whisper + le modele, TOUTES vos sauvegardes (notes), TOUTES les pieces jointes. Vos notes seront PERDUES pour toujours. Confirmer ?' }" ^
  "};" ^
  "$r = [System.Windows.MessageBox]::Show($msg, 'Mini Dictaphone V1', 'YesNo', 'Warning');" ^
  "if ($r -eq 'No') { exit 7 } else { exit 6 }"

:: Si l'utilisateur a clique "Non" (annule), on stoppe
if errorlevel 7 (
    echo.
    echo Desinstallation annulee.
    pause
    exit
)

echo.
echo [1/2] Suppression des raccourcis sur le bureau...
powershell -NoProfile -Command "Remove-Item '$([Environment]::GetFolderPath('Desktop'))\Mini Dictaphone V1.lnk' -ErrorAction SilentlyContinue; Remove-Item '$([Environment]::GetFolderPath('Desktop'))\Mini Dictaphone.lnk' -ErrorAction SilentlyContinue"

echo [2/2] Recherche et suppression du dossier d'installation...
echo.

:: Le dossier a supprimer = celui qui contient ce .bat
for %%I in ("%~dp0..") do set "TARGET=%%~fI"

echo Tentative de suppression de : %TARGET%
if exist "%TARGET%\main.js" (
    powershell -NoProfile -Command "Remove-Item -LiteralPath '%TARGET%' -Recurse -Force -ErrorAction SilentlyContinue"
    echo ^> Dossier supprime.
) else if exist "C:\MiniDictaphone\main.js" (
    echo Non trouve ici, essai de C:\MiniDictaphone ...
    powershell -NoProfile -Command "Remove-Item -LiteralPath 'C:\MiniDictaphone' -Recurse -Force -ErrorAction SilentlyContinue"
    echo ^> C:\MiniDictaphone supprime.
) else (
    echo.
    echo ERREUR : dossier d'installation non trouve.
    echo S'il reste un dossier "MiniDictaphone", supprimez-le a la main.
)

echo.
echo ==========================================
echo  DESINSTALLATION TERMINEE
echo ==========================================
echo.
pause
