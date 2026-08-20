# Sincroniza o white-label Lobie: /app/lobie/index.html e' uma copia BIT A BIT
# de /app/wallet/index.html (assets absolutos; a marca e' decidida em runtime
# pelo pathname - const IS_LOBIE no proprio arquivo).
#
# RODE SEMPRE que editar app/wallet/index.html, antes do commit:
#   powershell -File tools/sync-lobie.ps1
#
# Falha alto se a copia divergir depois de copiar (sanidade). ASCII-only: o
# PowerShell 5 le .ps1 sem BOM como cp1252 e quebra em acentos/travessao.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'app/wallet/index.html'
$dstDir = Join-Path $root 'app/lobie'
$dst = Join-Path $dstDir 'index.html'
New-Item -ItemType Directory -Force $dstDir | Out-Null
Copy-Item $src $dst -Force
$h1 = (Get-FileHash $src -Algorithm SHA256).Hash
$h2 = (Get-FileHash $dst -Algorithm SHA256).Hash
if ($h1 -ne $h2) { throw "sync-lobie: copia divergente!" }
Write-Host "sync-lobie ok - $h1"
