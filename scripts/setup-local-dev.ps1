param(
  [int]$MysqlHostPort = 3306
)

Write-Host "== BluLok Local Dev Setup ==" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendEnvExample = Join-Path $repoRoot "backend\env.example"
$backendEnv = Join-Path $repoRoot "backend\.env"
$frontendEnvExample = Join-Path $repoRoot "frontend\.env.example"
$frontendEnv = Join-Path $repoRoot "frontend\.env"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker CLI not found. Install Docker Desktop first."
  exit 1
}

if (-not (Test-Path $backendEnv)) {
  Copy-Item $backendEnvExample $backendEnv
  Write-Host "Created backend\.env from env.example" -ForegroundColor Green
} else {
  Write-Host "backend\.env already exists (leaving unchanged)" -ForegroundColor Yellow
}

if (-not (Test-Path $frontendEnv)) {
  Copy-Item $frontendEnvExample $frontendEnv
  Write-Host "Created frontend\.env from .env.example" -ForegroundColor Green
} else {
  Write-Host "frontend\.env already exists (leaving unchanged)" -ForegroundColor Yellow
}

Push-Location $repoRoot
try {
  Write-Host "Starting MySQL container..." -ForegroundColor Cyan
  $env:MYSQL_HOST_PORT = "$MysqlHostPort"
  docker compose -f docker-compose.mysql.yml up -d
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to start MySQL container"
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1) Generate backend secrets:" -ForegroundColor White
Write-Host "   cd backend; npm run gen:dev-secrets" -ForegroundColor Gray
Write-Host "   Paste JWT + OPS/ROOT public/private values into backend\.env" -ForegroundColor Gray
Write-Host "2) Run DB migrations and seed data:" -ForegroundColor White
Write-Host "   cd backend; npm run migrate; npm run seed" -ForegroundColor Gray
Write-Host "3) Start app:" -ForegroundColor White
Write-Host "   Terminal A: cd backend; npm run dev" -ForegroundColor Gray
Write-Host "   Terminal B: cd frontend; npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "If port 3306 is already in use, rerun with:" -ForegroundColor Yellow
Write-Host "  .\scripts\setup-local-dev.ps1 -MysqlHostPort 3307" -ForegroundColor Gray
Write-Host "Then set DB_PORT=3307 in backend\.env" -ForegroundColor Gray
