# ============================================================
#  install_node_portable.ps1
#  Télécharge et installe Node.js en version portable (sans UAC)
#  Appelé par INSTALLATEUR.bat — ne pas exécuter seul.
# ============================================================
param(
    [Parameter(Mandatory=$true)][string]$NodeDir,
    [Parameter(Mandatory=$true)][string]$NodeZip
)
$ErrorActionPreference = 'Stop'
try {
    # 1) Récupère la dernière version LTS de Node.js
    $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $lts = $idx | Where-Object { $_.lts -ne $false -and $_.security -ne $true } | Select-Object -First 1
    if (-not $lts) { $lts = $idx | Where-Object { $_.lts -ne $false } | Select-Object -First 1 }
    $ver = $lts.version
    Write-Host ('      Version LTS detectee : ' + $ver)

    # 2) Télécharge le zip portable
    $url = 'https://nodejs.org/dist/' + $ver + '/node-' + $ver + '-win-x64.zip'
    Write-Host '      Telechargement de Node.js (version portable)...'
    Invoke-WebRequest -Uri $url -OutFile $NodeZip

    # 3) Décompression
    Write-Host '      Decompression...'
    if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
    Expand-Archive -LiteralPath $NodeZip -DestinationPath $NodeDir -Force

    # 4) Le zip contient un sous-dossier node-vX-win-x64 ; on remonte son contenu
    $sub = Get-ChildItem $NodeDir -Directory | Select-Object -First 1
    if ($sub) {
        Move-Item -Path (Join-Path $sub.FullName '*') -Destination $NodeDir -Force
        Remove-Item $sub.FullName -Force
    }
    Remove-Item $NodeZip -Force

    Write-Host '      Node.js installe avec succes.'
}
catch {
    Write-Host ('      ERREUR : ' + $_.Exception.Message)
    exit 1
}
