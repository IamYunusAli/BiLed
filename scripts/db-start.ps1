# Starts the local development PostgreSQL (data in .local/pgdata, port 55432) as a DETACHED,
# hidden process, so it keeps running when the terminal that started it closes.
# (Started as a child of a terminal, Windows can stop it from spawning connection processes once
#  that terminal exits; Postgres then logs exception 0xC0000142 and shuts down.)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$data = Join-Path $root '.local\pgdata'
$log = Join-Path $root '.local\postgres.log'

& "$bin\pg_isready.exe" -h localhost -p 55432 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Output 'Local Postgres is already running on port 55432.'; exit 0 }

Start-Process -FilePath "$bin\pg_ctl.exe" -ArgumentList @('start', '-D', "`"$data`"", '-o', '"-p 55432"', '-l', "`"$log`"") -WindowStyle Hidden
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  & "$bin\pg_isready.exe" -h localhost -p 55432 | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Output 'Local Postgres is running on port 55432.'; exit 0 }
}
Write-Error "Postgres did not start; see $log"
