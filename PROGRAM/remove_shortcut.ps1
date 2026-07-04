# ============================================================
#  remove_shortcut.ps1
#  Supprime le raccourci bureau du Mini Dictaphone.
#  Appelé par DESINSTALLER.bat.
# ============================================================
$desktop = [Environment]::GetFolderPath('Desktop')
$paths = @(
    (Join-Path $desktop 'Mini Dictaphone V1.lnk'),
    (Join-Path $desktop 'Mini Dictaphone.lnk')
)
foreach ($p in $paths) {
    if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
}
