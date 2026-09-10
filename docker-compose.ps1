$ErrorActionPreference = "Stop"

$compose = @("docker", "compose", "-f", "docker-compose.yml", "-f", "docker-compose.tunnel.yml")

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
    & $compose[0] $compose[1..($compose.Length-1)] @Args
    if ($LASTEXITCODE -ne 0) { throw "docker compose failed: $($Args -join ' ')" }
}

function Get-QuickTunnelUrl {
    param([string]$Service)

    for ($i = 0; $i -lt 60; $i++) {
        $logs = (& docker compose -f docker-compose.yml -f docker-compose.tunnel.yml logs --no-color $Service 2>&1 | Out-String)
        $match = [regex]::Match($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) { return $match.Value }
        Start-Sleep -Seconds 1
    }
    throw "Could not obtain Quick Tunnel URL for $Service"
}

Write-Host "Starting RehletShifaa locally and opening four Cloudflare Quick Tunnels..."
Invoke-Compose up -d --build

$frontendUrl = Get-QuickTunnelUrl "cloudflared-frontend"
$backendUrl  = Get-QuickTunnelUrl "cloudflared-backend"
$keycloakUrl = Get-QuickTunnelUrl "cloudflared-keycloak"
$s3Url       = Get-QuickTunnelUrl "cloudflared-s3"

@"
FRONTEND_PUBLIC_URL=$frontendUrl
BACKEND_PUBLIC_URL=$backendUrl
KEYCLOAK_PUBLIC_URL=$keycloakUrl
S3_PUBLIC_URL=$s3Url
"@ | Set-Content -Encoding ascii .env.tunnel

Write-Host ""
Write-Host "Cloudflare URLs discovered:"
Write-Host "Frontend : $frontendUrl"
Write-Host "Backend  : $backendUrl"
Write-Host "Keycloak : $keycloakUrl"
Write-Host "S3       : $s3Url"
Write-Host ""
Write-Host "Rebuilding services with the public URLs..."

& docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build --force-recreate keycloak minio backend frontend
if ($LASTEXITCODE -ne 0) { throw "Failed to recreate application services with tunnel URLs" }

Write-Host "Updating Keycloak web client redirect URI and web origin..."
& docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user admin --password 'Admin123!' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not authenticate kcadm to Keycloak" }

$clientJson = (& docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml exec -T keycloak /opt/keycloak/bin/kcadm.sh get clients -r rehletshifaa -q clientId=rehletshifaa-web 2>&1 | Out-String)
$clients = $clientJson | ConvertFrom-Json
if (-not $clients -or -not $clients[0].id) { throw "Keycloak client rehletshifaa-web was not found" }
$clientUuid = $clients[0].id

$redirectJson = '["' + $frontendUrl + '/*"]'
$originJson = '["' + $frontendUrl + '"]'
& docker compose --env-file .env.tunnel -f docker-compose.yml -f docker-compose.tunnel.yml exec -T keycloak /opt/keycloak/bin/kcadm.sh update "clients/$clientUuid" -r rehletshifaa -s "redirectUris=$redirectJson" -s "webOrigins=$originJson"
if ($LASTEXITCODE -ne 0) { throw "Could not update Keycloak redirect URI/web origin" }

Write-Host ""
Write-Host "RehletShifaa remote deployment is ready."
Write-Host "Frontend : $frontendUrl"
Write-Host "Backend  : $backendUrl"
Write-Host "Keycloak : $keycloakUrl"
Write-Host "S3       : $s3Url"
