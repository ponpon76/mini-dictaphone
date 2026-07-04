# ============================================================
#  set_node_path.ps1
#  Ajoute le dossier Node.js portable au PATH utilisateur (persistant).
#  Appelé par INSTALLATEUR.bat.
# ============================================================
param(
    [Parameter(Mandatory=$true)][string]$NodeDir
)
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
# N'ajoute que si NodeDir n'est pas deja dans le PATH (evite les doublons a chaque reinstall)
if ($current -notlike "*$NodeDir*") {
    $newPath = $NodeDir + ';' + $current
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}
