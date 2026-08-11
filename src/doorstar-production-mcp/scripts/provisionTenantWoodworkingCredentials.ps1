[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# This script intentionally has no parameters: accepting a caller-selected SSH
# target or runtime path could send the freshly generated tenant credentials to
# another host. It must be run by the Doorstar Windows user who owns the six
# user-environment variables.
$SshTarget = 'doorstar-vps'
$RuntimeDirectory = '/opt/doorstar-woodworking-rag'
$ServiceName = 'nexus-dev-doorstar-woodworking.service'
$PackageDirectory = Split-Path -Parent $PSScriptRoot

$PrincipalByEnvironment = [ordered]@{
  DOORSTAR_NEXUS_ROOT_TOKEN             = 'doorstar-root-codex'
  DOORSTAR_NEXUS_CONDUCTOR_TOKEN        = 'doorstar-conductor-codex'
  DOORSTAR_NEXUS_MONITOR_TOKEN          = 'doorstar-monitor-codex'
  DOORSTAR_NEXUS_BACKEND_TOKEN          = 'doorstar-backend-codex'
  DOORSTAR_NEXUS_FRONTEND_TOKEN         = 'doorstar-frontend-codex'
  DOORSTAR_NEXUS_IMPORT_DISCOVERY_TOKEN = 'doorstar-import-discovery-codex'
}

function Assert-CommandAvailable {
  param([Parameter(Mandatory)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required for private tenant credential provisioning."
  }
}

function New-TenantCredential {
  # Windows PowerShell 5.1 runs on .NET Framework, which has neither the
  # newer static RandomNumberGenerator.Fill API nor Convert.ToHexString.
  # Use the compatible cryptographic API rather than falling back to a
  # pseudo-random PowerShell source.
  $bytes = New-Object byte[] 48
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
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

function Get-RemoteTenantState {
  # The only state returned to the local host is non-sensitive lifecycle data.
  # Any unexpected SSH banner or malformed output fails before mutation.
  $stateOutput = & ssh $SshTarget "set -eu; if sudo test -f $RuntimeDirectory/agents.json; then config=present; else config=absent; fi; if sudo systemctl is-active --quiet $ServiceName; then active=1; else active=0; fi; if sudo systemctl is-enabled --quiet $ServiceName; then enabled=1; else enabled=0; fi; printf 'config=%s active=%s enabled=%s\n' `"`$config`" `"`$active`" `"`$enabled`""
  if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect the existing tenant state (ssh exit code $LASTEXITCODE)."
  }

  $stateLine = @($stateOutput | Where-Object { $_ -match '^config=(present|absent) active=[01] enabled=[01]$' } | Select-Object -Last 1)
  if ($stateLine.Count -ne 1 -or $stateLine[0] -notmatch '^config=(present|absent) active=([01]) enabled=([01])$') {
    throw 'Could not parse the existing tenant state.'
  }

  return [pscustomobject]@{
    ConfigExists = $Matches[1] -eq 'present'
    ServiceActive = $Matches[2] -eq '1'
    ServiceEnabled = $Matches[3] -eq '1'
  }
}

Assert-CommandAvailable ssh
Assert-CommandAvailable scp
Assert-CommandAvailable icacls
Assert-CommandAvailable npm

$tokensByEnvironment = [ordered]@{}
$agents = [ordered]@{}
foreach ($mapping in $PrincipalByEnvironment.GetEnumerator()) {
  do {
    $credential = New-TenantCredential
  } while ($agents.Contains($credential))
  $tokensByEnvironment[$mapping.Key] = $credential
  $agents[$credential] = $mapping.Value
}
if ($agents.Count -ne $PrincipalByEnvironment.Count) {
  throw 'Could not create one unique tenant credential per audited principal.'
}

$config = [ordered]@{
  tenantId = 'doorstar'
  scope = 'woodworking'
  agents = $agents
}
$remoteStage = "/tmp/doorstar-woodworking-credentials-$([Guid]::NewGuid().ToString('N'))"
$remoteBackup = "$RuntimeDirectory/.agents.json.rollback-$([Guid]::NewGuid().ToString('N'))"
$temporaryConfig = Join-Path ([IO.Path]::GetTempPath()) "doorstar-woodworking-credentials-$([Guid]::NewGuid().ToString('N')).json"
$stageCreated = $false
$remoteBackupCreated = $false
$remoteBackupMayExist = $false
$remoteConfigReplacementAttempted = $false
$previousRemoteConfigExists = $false
$previousServiceActive = $false
$previousServiceEnabled = $false
$previousValues = [ordered]@{}
$previousValuesCaptured = $false
$localTokensCommitted = $false

try {
  # The local temp file is readable only by the current Windows user. Its
  # contents are never printed and are removed in finally.
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($temporaryConfig, ($config | ConvertTo-Json -Depth 4), $utf8WithoutBom)
  $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  Invoke-CheckedExternalCommand icacls @($temporaryConfig, '/inheritance:r', '/grant:r', "${currentUser}:(R,W)", '/c')

  # Capture the local rollback point before the remote tenant can accept the
  # new set. An interruption anywhere after this point can restore both sides.
  foreach ($mapping in $tokensByEnvironment.GetEnumerator()) {
    $previousValues[$mapping.Key] = [Environment]::GetEnvironmentVariable($mapping.Key, 'User')
  }
  $previousValuesCaptured = $true

  Invoke-CheckedExternalCommand ssh @(
    $SshTarget,
    # Provisioning is intentionally blocked until the first-deploy installer
    # has made the token-reading runtime immutable to the service account.
    "set -eu; sudo test -d $RuntimeDirectory; sudo test ! -L $RuntimeDirectory; sudo stat -c '%U:%G:%a' $RuntimeDirectory | grep -Fx 'root:doorstar-rag:750' >/dev/null; sudo id -u doorstar-rag >/dev/null; for file in tenantWoodworkingRagServer.js knowledge.js tenantWoodworkingKnowledge.js package.json runtime-manifest.json; do sudo test -f $RuntimeDirectory/`$file; sudo test ! -L $RuntimeDirectory/`$file; sudo stat -c '%U:%G:%a' $RuntimeDirectory/`$file | grep -Fx 'root:root:644' >/dev/null; sudo -u doorstar-rag test -r $RuntimeDirectory/`$file; sudo -u doorstar-rag test ! -w $RuntimeDirectory/`$file; done; sudo test -f /etc/systemd/system/$ServiceName; sudo test ! -L /etc/systemd/system/$ServiceName; sudo stat -c '%U:%G:%a' /etc/systemd/system/$ServiceName | grep -Fx 'root:root:644' >/dev/null; umask 077; mkdir -m 700 $remoteStage"
  )
  $stageCreated = $true

  $previousState = Get-RemoteTenantState
  $previousRemoteConfigExists = $previousState.ConfigExists
  $previousServiceActive = $previousState.ServiceActive
  $previousServiceEnabled = $previousState.ServiceEnabled
  if (-not $previousRemoteConfigExists -and ($previousServiceActive -or $previousServiceEnabled)) {
    throw 'The tenant unit has no dedicated agents.json but already has lifecycle state; refusing to replace an unknown runtime state.'
  }
  if ($previousRemoteConfigExists) {
    $remoteBackupMayExist = $true
    Invoke-CheckedExternalCommand ssh @(
      $SshTarget,
      "set -eu; sudo test -f $RuntimeDirectory/agents.json; sudo test ! -L $RuntimeDirectory/agents.json; sudo stat -c '%U:%G:%a' $RuntimeDirectory/agents.json | grep -Fx 'root:doorstar-rag:640' >/dev/null; sudo install -m 0600 -o root -g root $RuntimeDirectory/agents.json $remoteBackup"
    )
    $remoteBackupCreated = $true
  }

  Invoke-CheckedExternalCommand scp @('-q', $temporaryConfig, "${SshTarget}:$remoteStage/agents.json")
  # Mark the transaction before starting the remote command: an SSH timeout
  # after `mv` is uncertain, so finally must restore from the root-only backup.
  $remoteConfigReplacementAttempted = $true
  Invoke-CheckedExternalCommand ssh @(
    $SshTarget,
    # An unauthenticated health request must be rejected. A 401 from the
    # just-started listener confirms the boundary without putting a generated
    # token in an SSH command line or a process list. The full authenticated
    # health and search attestation runs after the six local values persist.
    "set -eu; test -f $remoteStage/agents.json; test ! -L $remoteStage/agents.json; sudo rm -f -- $RuntimeDirectory/agents.json.next; sudo install -m 0640 -o root -g doorstar-rag $remoteStage/agents.json $RuntimeDirectory/agents.json.next; sudo mv -f -- $RuntimeDirectory/agents.json.next $RuntimeDirectory/agents.json; sudo stat -c '%U:%G:%a' $RuntimeDirectory/agents.json | grep -Fx 'root:doorstar-rag:640' >/dev/null; sudo systemctl enable $ServiceName; sudo systemctl restart $ServiceName; for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do status=`$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 1 http://100.82.133.87:3467/health || true); if [ `"`$status`" = 401 ]; then sudo systemctl is-active --quiet $ServiceName; exit 0; fi; sleep 0.25; done; exit 1"
  )

  foreach ($mapping in $tokensByEnvironment.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($mapping.Key, $mapping.Value, 'User')
  }
  foreach ($mapping in $tokensByEnvironment.GetEnumerator()) {
    if ([Environment]::GetEnvironmentVariable($mapping.Key, 'User') -ne $mapping.Value) {
      throw 'Windows user-environment credential persistence failed.'
    }
  }

  # The previous remote configuration remains in its root-only backup until
  # all six newly persisted values authenticate and pass the full pinned
  # tenant contract. This command never prints a credential value.
  Invoke-CheckedExternalCommand npm @('--prefix', $PackageDirectory, 'run', 'verify:nexus-identities')
  $localTokensCommitted = $true

  Write-Output 'Doorstar woodworking tenant credentials were provisioned and verified for six principals; credential values were not displayed.'
  Write-Output 'Start a new Codex task so its bridge inventory reads the rotated credentials.'
} finally {
  if (-not $localTokensCommitted -and $previousValuesCaptured) {
    try {
      # Restore local values first so a failed rotation never leaves a mixed
      # six-principal set on the Windows user account.
    foreach ($previous in $previousValues.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable($previous.Key, $previous.Value, 'User')
    }
    } catch {
      [Console]::Error.WriteLine('Doorstar woodworking local credential rollback could not complete.')
    }
  }

  if (-not $localTokensCommitted -and $remoteConfigReplacementAttempted) {
    try {
      if ($previousRemoteConfigExists) {
        if (-not $remoteBackupCreated) {
          throw 'The prior tenant credential backup is unavailable for rollback.'
        }
        $wasActive = if ($previousServiceActive) { '1' } else { '0' }
        $wasEnabled = if ($previousServiceEnabled) { '1' } else { '0' }
        Invoke-CheckedExternalCommand ssh @(
          $SshTarget,
          "set -eu; sudo test -f $remoteBackup; sudo test ! -L $remoteBackup; sudo install -m 0640 -o root -g doorstar-rag $remoteBackup $RuntimeDirectory/agents.json.next; sudo mv -f -- $RuntimeDirectory/agents.json.next $RuntimeDirectory/agents.json; if [ $wasActive -eq 1 ]; then sudo systemctl restart $ServiceName; else sudo systemctl stop $ServiceName; fi; if [ $wasEnabled -eq 1 ]; then sudo systemctl enable $ServiceName; else sudo systemctl disable $ServiceName; fi; sudo rm -f -- $remoteBackup"
        )
        $remoteBackupCreated = $false
        $remoteBackupMayExist = $false
      } else {
        # There was no prior tenant config or running service, so remove only
        # the newly attempted endpoint and leave unrelated Nexus units alone.
        Invoke-CheckedExternalCommand ssh @(
          $SshTarget,
          "set -eu; sudo systemctl disable --now $ServiceName || true; sudo rm -f -- $RuntimeDirectory/agents.json $RuntimeDirectory/agents.json.next"
        )
      }
      $remoteConfigReplacementAttempted = $false
    } catch {
      [Console]::Error.WriteLine('Doorstar woodworking remote credential rollback could not complete; the root-only backup was retained for recovery.')
    }
  }

  if ($localTokensCommitted -and $remoteBackupCreated) {
    # A backup remaining after a successful rotation is root-only and harmless,
    # but remove it when possible so an obsolete credential set is not retained.
    & ssh $SshTarget "sudo rm -f -- $remoteBackup"
    if ($LASTEXITCODE -eq 0) {
      $remoteBackupCreated = $false
      $remoteBackupMayExist = $false
    } else {
      [Console]::Error.WriteLine('Doorstar woodworking credential rotation succeeded, but its root-only rollback backup needs manual removal.')
    }
  }

  if (-not $localTokensCommitted -and -not $remoteConfigReplacementAttempted -and $remoteBackupMayExist) {
    # An SSH failure during the backup copy can leave a root-only backup even
    # though no tenant config was replaced. Remove that orphan safely.
    & ssh $SshTarget "sudo rm -f -- $remoteBackup"
    if ($LASTEXITCODE -eq 0) {
      $remoteBackupCreated = $false
      $remoteBackupMayExist = $false
    }
  }

  if (Test-Path -LiteralPath $temporaryConfig) {
    Remove-Item -LiteralPath $temporaryConfig -Force
  }
  if ($stageCreated) {
    # This path is a fresh GUID created by this run; removing only its private
    # staging file does not touch the runtime or any user data.
    & ssh $SshTarget "set -eu; rm -f -- $remoteStage/agents.json; rmdir -- $remoteStage"
  }
}
