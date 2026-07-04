# ============================================================
#  remove_node_path.ps1
#  Nettoie le PATH utilisateur (retire Node portable) et supprime le dossier.
#  Appelé par DESINSTALLER.bat.
#  NB : dossier DÉDIÉ au Mini Dictaphone (NodeJS_MiniDictaphone) pour ne pas
#  casser un Node partagé par d'autres apps (Jarvis, etc.).
# ============================================================
$nodeDir = Join-Path $env:LOCALAPPDATA 'NodeJS_MiniDictaphone'

# 1) Retire NodeDir du PATH utilisateur
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($current -and ($current -like "*$nodeDir*")) {
    $parts = $current -split ';' | Where-Object { $_ -ne $nodeDir -and $_ -ne '' }
    $newPath = $parts -join ';'
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
}

# 2) Supprime le dossier Node portable (silencieux s'il n'existe pas)
if (Test-Path $nodeDir) {
    Remove-Item $nodeDir -Recurse -Force -ErrorAction SilentlyContinue
}
