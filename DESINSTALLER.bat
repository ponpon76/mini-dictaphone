@echo off
chcp 65001 >nul
REM ============================================================
REM  Mini Dictaphone V1.2
REM  Fichier : DESINSTALLER.bat
REM ============================================================
title Desinstalleur Mini Dictaphone V1
color 0C

:: LIT LA LANGUE
set "LANG=fr"
if exist "%~dp0langue.txt" set /p LANG=<"%~dp0langue.txt"

:: LE DOSSIER A SUPPRIMER = celui qui contient ce .bat
set "TARGET=%~dp0"

:: BOITE DE CONFIRMATION
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Add-Type -AssemblyName PresentationFramework;" ^
  "$msg = switch -Wildcard ('%LANG%') {" ^
  "  'fr' { 'ATTENTION : cette action va SUPPRIMER DEFINITIVEMENT : le programme complet, le moteur Whisper + le modele, TOUTES vos sauvegardes (notes), TOUTES les pieces jointes. Vos notes seront PERDUES pour toujours. Confirmer ?' }" ^
  "  'en' { 'WARNING: this action will PERMANENTLY DELETE: the complete program, the Whisper engine + model, ALL your saves (notes), ALL attachments. Your notes will be LOST forever. Confirm?' }" ^
  "  'es' { 'ATENCION: esta accion ELIMINARA DEFINITIVAMENTE: el programa completo, el motor Whisper + el modelo, TODAS sus copias (notas), TODOS los archivos adjuntos. Sus notas se PERDERAN para siempre. Confirma?' }" ^
  "  'pt' { 'ATENCAO: esta acao vai APAGAR DEFINITIVAMENTE: o programa completo, o motor Whisper + o modelo, TODOS os seus backups (notas), TODOS os anexos. As suas notas vao PERDER-SE para sempre. Confirmar?' }" ^
  "  'de' { 'ACHTUNG: Diese Aktion wird DAUERHAFT LOSCHEN: das komplette Programm, die Whisper-Engine + Modell, ALLE Ihre Sicherungen (Notizen), ALLE Anhange. Ihre Notizen gehen FUR IMMER verloren. Bestatigen?' }" ^
  "  'it' { 'ATTENZIONE: questa azione ELIMINERA DEFINITIVAMENTE: il programma completo, il motore Whisper + il modello, TUTTI i tuoi salvataggi (note), TUTTI gli allegati. Le tue note andranno PERSI per sempre. Confermi?' }" ^
  "  default { 'ATTENTION : cette action va SUPPRIMER DEFINITIVEMENT : le programme complet, le moteur Whisper + le modele, TOUTES vos sauvegardes (notes), TOUTES les pieces jointes. Vos notes seront PERDUES pour toujours. Confirmer ?' }" ^
  "};" ^
  "$r = [System.Windows.MessageBox]::Show($msg, 'Mini Dictaphone V1', 'YesNo', 'Warning');" ^
  "if ($r -eq 'No') { exit 7 } else { exit 6 }"

if errorlevel 7 (
    echo.
    echo Desinstallation annulee.
    timeout /t 2 /nobreak >nul
    exit
)

echo.
echo Desinstallation de : %TARGET%
echo.

:: ETAPE 1/3 : SUPPRIME LE RACCOURCI BUREAU
echo [1/3] Suppression du raccourci bureau...
powershell -NoProfile -Command "Remove-Item '$([Environment]::GetFolderPath('Desktop'))\Mini Dictaphone V1.lnk' -ErrorAction SilentlyContinue; Remove-Item '$([Environment]::GetFolderPath('Desktop'))\Mini Dictaphone.lnk' -ErrorAction SilentlyContinue"
echo       OK

:: ETAPE 2/3 : GENERE UN SCRIPT VBS QUI SUPPRIMERA LE DOSSIER APRÈS FERMETURE
:: VBS est plus fiable que .bat pour cette tache : il attend que le .bat
:: principal soit ferme, puis supprime le dossier, puis s'auto-detruit.
echo [2/3] Preparation de la suppression...
set "VBS=%TEMP%\desinstall_dictaphone.vbs"

> "%VBS%" echo Set fso = CreateObject("Scripting.FileSystemObject")
>> "%VBS%" echo WScript.Sleep 1500
>> "%VBS%" echo On Error Resume Next
>> "%VBS%" echo fso.DeleteFolder "%TARGET%", True
>> "%VBS%" echo fso.DeleteFile WScript.ScriptFullName, True

:: ETAPE 3/3 : LANCE LE VBS EN ARRIERE-PLAN PUIS SE FERME
echo [3/3] Suppression du dossier...
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
