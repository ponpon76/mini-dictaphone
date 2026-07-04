# ============================================================
#  select_folder.ps1
#  Affiche une boite de selection de dossier.
#  Écrit le chemin choisi dans un fichier temporaire (UTF-8 sans BOM)
#  plutôt que sur stdout. Raison : le "for /f" du .bat qui capture stdout
#  perd/corrompt les accents et caractères spéciaux (Élise, François...) à
#  cause du décalage d'encodage entre PowerShell et cmd.exe. Le passage par
#  un fichier UTF-8 fiabilise 100% des chemins.
#  Appelé par INSTALLATEUR.bat.
# ============================================================
param(
    [Parameter(Mandatory=$true)][string]$OutFile
)
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = 'Ou installer le Mini Dictaphone ?'
if ($f.ShowDialog() -eq 'OK') {
    # Écrit en UTF-8 sans BOM pour que le .bat le relise correctement.
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($OutFile, $f.SelectedPath, $utf8NoBom)
}
