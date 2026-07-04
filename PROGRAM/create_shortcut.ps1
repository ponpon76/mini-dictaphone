# ============================================================
#  create_shortcut.ps1
#  Cree le raccourci bureau du Mini Dictaphone.
#  Appelé par INSTALLATEUR.bat.
# ============================================================
param(
    [Parameter(Mandatory=$true)][string]$TargetPath,
    [Parameter(Mandatory=$true)][string]$WorkingDir
)
$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Mini Dictaphone V1.lnk'
$s = $ws.CreateShortcut($shortcutPath)
$s.TargetPath = $TargetPath
$s.Arguments = '.'
$s.WorkingDirectory = $WorkingDir
$s.Description = 'Mini Dictaphone V1'
$s.Save()
