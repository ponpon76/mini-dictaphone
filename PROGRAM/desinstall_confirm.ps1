# ============================================================
#  desinstall_confirm.ps1
#  Affiche la boite de confirmation multilingue du desinstalleur.
#  Renvoie : 6 = Oui (confirme), 7 = Non (annule).
#  Appelé par DESINSTALLER.bat.
# ============================================================
param(
    [Parameter(Mandatory=$true)][string]$Lang
)
# Tout est encapsule dans un try/catch : si la moindre erreur survient
# (PresentationFramework absent, display bloque, etc.), on exit 7 (= annuler)
# au lieu de crasher avec un code imprevisible. Le .bat ne supprimera QUE si
# le code de retour est exactement 6 (Oui). Sinon = annulation safe.
try {
    Add-Type -AssemblyName PresentationFramework

    $msg = switch -Wildcard ($Lang) {
        'fr' { 'ATTENTION : cette action va SUPPRIMER DEFINITIVEMENT : le programme complet, le moteur Whisper + le modele, TOUTES vos sauvegardes (notes), TOUTES les pieces jointes. Vos notes seront PERDUES pour toujours. Confirmer ?' }
        'en' { 'WARNING: this action will PERMANENTLY DELETE: the complete program, the Whisper engine + model, ALL your saves (notes), ALL attachments. Your notes will be LOST forever. Confirm?' }
        'es' { 'ATENCION: esta accion ELIMINARA DEFINITIVAMENTE: el programa completo, el motor Whisper + el modelo, TODAS sus copias (notas), TODOS los archivos adjuntos. Sus notas se PERDERAN para siempre. Confirma?' }
        'pt' { 'ATENCAO: esta acao vai APAGAR DEFINITIVAMENTE: o programa completo, o motor Whisper + o modelo, TODOS os seus backups (notas), TODOS os anexos. As suas notas vao PERDER-SE para sempre. Confirmar?' }
        'de' { 'ACHTUNG: Diese Aktion wird DAUERHAFT LOSCHEN: das komplette Programm, die Whisper-Engine + Modell, ALLE Ihre Sicherungen (Notizen), ALLE Anhange. Ihre Notizen gehen FUR IMMER verloren. Bestatigen?' }
        'it' { 'ATTENZIONE: questa azione ELIMINERA DEFINITIVAMENTE: il programma completo, il motore Whisper + il modello, TUTTI i tuoi salvataggi (note), TUTTI gli allegati. Le tue note andranno PERSI per sempre. Confermi?' }
        default { 'ATTENTION : cette action va SUPPRIMER DEFINITIVEMENT : le programme complet, le moteur Whisper + le modele, TOUTES vos sauvegardes (notes), TOUTES les pieces jointes. Vos notes seront PERDUES pour toujours. Confirmer ?' }
    }

    $r = [System.Windows.MessageBox]::Show($msg, 'Mini Dictaphone V1', 'YesNo', 'Warning')
    if ($r -eq 'No') { exit 7 } else { exit 6 }
}
catch {
    # Erreur inattendue : on ANNULE par securite (jamais de suppression sans confirmation).
    exit 7
}
