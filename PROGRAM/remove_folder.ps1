# ============================================================
#  remove_folder.ps1
#  Supprime un dossier de facon recursive.
#  Appelé par INSTALLATEUR.bat (nettoyage ancienne install).
# ============================================================
param(
    [Parameter(Mandatory=$true)][string]$Path
)
if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
}
