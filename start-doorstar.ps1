# Doorstar sziget indítása a SAJÁT repójából (doorstar-instance), a közös
# nexus-core distből. Profil: ./.env (minta: .env.example).
# Port: 13458 — a 345x tartományt a VS Code Remote-SSH VPS-forwardja árnyékolhatja.
$ErrorActionPreference = 'Stop'
$NexusDist = 'C:/Users/szant/Documents/Development/nexus-core/src/nexus-core/knowledge-service/dist/server.js'
if (-not (Test-Path $NexusDist)) {
    Write-Error 'nexus-core build not found - run npm run build in the knowledge-service dir first.'
    exit 1
}
if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) {
    Write-Error '.env missing - copy .env.example to .env and adjust paths.'
    exit 1
}
Write-Host 'Starting Doorstar island on port 13458 (collection cabinetbilder-doorstar) from shared nexus-core dist'
Set-Location $PSScriptRoot
node $NexusDist
