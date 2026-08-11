[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# This one-time installer deliberately has no caller-selected host, service or
# target directory. It installs only the ADR-pinned private tenant runtime and
# never transfers agents.json or any credential.
$SshTarget = 'doorstar-vps'
$RuntimeDirectory = '/opt/doorstar-woodworking-rag'
$ServiceName = 'nexus-dev-doorstar-woodworking.service'
$PackageDirectory = Split-Path -Parent $PSScriptRoot
$LocalRuntimeDirectory = Join-Path $PackageDirectory 'dist\tenant-woodworking-runtime'
$LocalServiceUnit = Join-Path $PackageDirectory 'deploy\nexus-dev-doorstar-woodworking.service'
$RuntimeFiles = @('tenantWoodworkingRagServer.js', 'knowledge.js', 'tenantWoodworkingKnowledge.js', 'package.json')
$DeploymentFiles = @($RuntimeFiles + 'runtime-manifest.json')
$remoteStage = "/tmp/doorstar-woodworking-runtime-$([Guid]::NewGuid().ToString('N'))"
$stageCreated = $false

function Assert-CommandAvailable {
  param([Parameter(Mandatory)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required for private tenant runtime installation."
  }
}

function Invoke-CheckedExternalCommand {
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [Parameter(Mandatory)][string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE."
  }
}

function Assert-LocalRuntimeClosure {
  if (-not (Test-Path -LiteralPath $LocalRuntimeDirectory -PathType Container)) {
    throw 'The tenant runtime closure is missing.'
  }
  if (-not (Test-Path -LiteralPath $LocalServiceUnit -PathType Leaf)) {
    throw 'The tenant systemd service template is missing.'
  }

  $actualFiles = @(Get-ChildItem -LiteralPath $LocalRuntimeDirectory -File | ForEach-Object { $_.Name } | Sort-Object)
  $expectedFiles = @($DeploymentFiles | Sort-Object)
  if (@(Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $actualFiles).Count -ne 0) {
    throw 'The tenant runtime closure contains an unexpected or missing file.'
  }

  $manifestPath = Join-Path $LocalRuntimeDirectory 'runtime-manifest.json'
  try {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw 'The tenant runtime manifest is invalid.'
  }
  if ($manifest.name -ne 'doorstar-woodworking-rag' -or @($manifest.files).Count -ne $RuntimeFiles.Count) {
    throw 'The tenant runtime manifest has an unexpected shape.'
  }

  $hashes = [ordered]@{}
  foreach ($fileName in $RuntimeFiles) {
    $entries = @($manifest.files | Where-Object { $_.file -eq $fileName })
    if ($entries.Count -ne 1 -or $entries[0].sha256 -notmatch '^[a-f0-9]{64}$' -or $entries[0].bytes -notmatch '^\d+$') {
      throw 'The tenant runtime manifest has an invalid file entry.'
    }
    $filePath = Join-Path $LocalRuntimeDirectory $fileName
    $fileInfo = Get-Item -LiteralPath $filePath -ErrorAction Stop
    $hash = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $entries[0].sha256 -or [int64]$fileInfo.Length -ne [int64]$entries[0].bytes) {
      throw 'The tenant runtime closure does not match its manifest.'
    }
    $hashes[$fileName] = $hash
  }

  return [pscustomobject]@{
    RuntimeHashes = $hashes
    ManifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

Assert-CommandAvailable npm
Assert-CommandAvailable ssh
Assert-CommandAvailable scp

try {
  Invoke-CheckedExternalCommand npm @('--prefix', $PackageDirectory, 'run', 'build:tenant-runtime')
  $integrity = Assert-LocalRuntimeClosure

  Invoke-CheckedExternalCommand ssh @(
    $SshTarget,
    "set -eu; if sudo systemctl is-active --quiet $ServiceName; then echo 'Refusing to replace an active tenant runtime.' >&2; exit 1; fi; if sudo systemctl is-enabled --quiet $ServiceName; then echo 'Refusing to replace an enabled tenant runtime.' >&2; exit 1; fi; if sudo test -e $RuntimeDirectory/agents.json || sudo test -L $RuntimeDirectory/agents.json; then echo 'Refusing to replace a tenant runtime with existing credentials.' >&2; exit 1; fi; sudo test ! -L $RuntimeDirectory; umask 077; mkdir -m 700 $remoteStage"
  )
  $stageCreated = $true

  foreach ($fileName in $DeploymentFiles) {
    Invoke-CheckedExternalCommand scp @('-q', (Join-Path $LocalRuntimeDirectory $fileName), "${SshTarget}:$remoteStage/$fileName")
  }
  Invoke-CheckedExternalCommand scp @('-q', $LocalServiceUnit, "${SshTarget}:$remoteStage/$ServiceName")

  $remoteHashChecks = @()
  foreach ($fileName in $RuntimeFiles) {
    $remoteHashChecks += "test `"`$(sha256sum $remoteStage/$fileName | cut -d ' ' -f 1)`" = '$($integrity.RuntimeHashes[$fileName])'"
  }
  $remoteHashChecks += "test `"`$(sha256sum $remoteStage/runtime-manifest.json | cut -d ' ' -f 1)`" = '$($integrity.ManifestHash)'"

  Invoke-CheckedExternalCommand ssh @(
    $SshTarget,
    "set -eu; for file in $($DeploymentFiles -join ' '); do test -f $remoteStage/`$file; test ! -L $remoteStage/`$file; done; test -f $remoteStage/$ServiceName; test ! -L $remoteStage/$ServiceName; $($remoteHashChecks -join '; '); if ! getent group doorstar-rag >/dev/null; then sudo groupadd --system doorstar-rag; fi; if ! id -u doorstar-rag >/dev/null 2>&1; then sudo useradd --system --no-create-home --gid doorstar-rag --shell /usr/sbin/nologin doorstar-rag; fi; sudo id -gn doorstar-rag | grep -Fx doorstar-rag >/dev/null; sudo getent passwd doorstar-rag | grep -F ':/usr/sbin/nologin' >/dev/null; sudo install -d -m 0750 -o root -g doorstar-rag $RuntimeDirectory; for file in $($RuntimeFiles -join ' '); do sudo install -m 0644 -o root -g root $remoteStage/`$file $RuntimeDirectory/`$file; done; sudo install -m 0644 -o root -g root $remoteStage/runtime-manifest.json $RuntimeDirectory/runtime-manifest.json; sudo install -m 0644 -o root -g root $remoteStage/$ServiceName /etc/systemd/system/$ServiceName; sudo stat -c '%U:%G:%a' $RuntimeDirectory | grep -Fx 'root:doorstar-rag:750' >/dev/null; for file in $($DeploymentFiles -join ' '); do sudo stat -c '%U:%G:%a' $RuntimeDirectory/`$file | grep -Fx 'root:root:644' >/dev/null; sudo -u doorstar-rag test -r $RuntimeDirectory/`$file; sudo -u doorstar-rag test ! -w $RuntimeDirectory/`$file; done; sudo stat -c '%U:%G:%a' /etc/systemd/system/$ServiceName | grep -Fx 'root:root:644' >/dev/null; sudo systemctl daemon-reload; sudo systemd-analyze verify /etc/systemd/system/$ServiceName"
  )

  Write-Output 'Doorstar woodworking tenant runtime installed with verified hashes and immutable service ownership.'
  Write-Output 'The unit remains stopped until provisionTenantWoodworkingCredentials.ps1 installs and verifies six fresh credentials.'
} finally {
  if ($stageCreated) {
    # This path is a fresh GUID created by this run; it holds only the
    # dependency-free runtime closure and service unit, never credentials.
    & ssh $SshTarget "set -eu; rm -f -- $remoteStage/tenantWoodworkingRagServer.js $remoteStage/knowledge.js $remoteStage/tenantWoodworkingKnowledge.js $remoteStage/package.json $remoteStage/runtime-manifest.json $remoteStage/$ServiceName; rmdir -- $remoteStage"
  }
}
