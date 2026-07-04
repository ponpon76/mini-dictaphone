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

# Force TLS 1.2 — indispensable sur les Windows modifiés (Atlas OS) ou anciens où
# TLS 1.0/1.1 est encore le défaut. Sans ça, le téléchargement Node échoue en silence.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
    # 1) Récupère la dernière version LTS de Node.js (y compris les versions de sécurité)
    $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $lts = $idx | Where-Object { $_.lts -ne $false } | Select-Object -First 1
    $ver = $lts.version
    Write-Host ('      Version LTS detectee : ' + $ver)

    # 2) Télécharge le zip portable (détecte l'architecture CPU)
    $arch = if ($env:PROCESSOR_ARCHITECTURE -like '*ARM*') { 'arm64' } else { 'x64' }
    $url = 'https://nodejs.org/dist/' + $ver + '/node-' + $ver + '-win-' + $arch + '.zip'
    Write-Host '      Telechargement de Node.js (version portable)...'
    Invoke-WebRequest -Uri $url -OutFile $NodeZip

    # 3) Décompression
    # Expand-Archive peut être fragile/lent sur certains Windows modifiés (Atlas OS).
    # On tente d'abord .NET (System.IO.Compression.ZipFile, rapide et robuste), avec
    # un fallback Expand-Archive si .NET n'est pas disponible.
    Write-Host '      Decompression...'
    if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
    $extracted = $false
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
        [System.IO.Compression.ZipFile]::ExtractToDirectory($NodeZip, $NodeDir)
        $extracted = $true
        Write-Host '      (extraction .NET)'
    } catch {
        Write-Host '      (extraction .NET indisponible, fallback Expand-Archive...)'
    }
    if (-not $extracted) {
        Expand-Archive -LiteralPath $NodeZip -DestinationPath $NodeDir -Force
    }

    # 4) Le zip contient un sous-dossier node-vX-win-x64 ; on déplace son contenu
    # Méthode sûre : copy puis remove (évite l'échec de Move-Item si fichier en lecture)
    $sub = Get-ChildItem $NodeDir -Directory | Select-Object -First 1
    if ($sub) {
        Copy-Item -Path (Join-Path $sub.FullName '*') -Destination $NodeDir -Recurse -Force
        Remove-Item $sub.FullName -Recurse -Force
    }
    Remove-Item $NodeZip -Force

    Write-Host '      Node.js installe avec succes.'
}
catch {
    Write-Host ('      ERREUR : ' + $_.Exception.Message)
    exit 1
}
