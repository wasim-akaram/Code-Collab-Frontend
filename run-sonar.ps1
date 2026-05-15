param (
    [Parameter(Mandatory=$true)]
    [string]$Token,
    [string]$HostUrl = "http://localhost:9000"
)

$frontendDir = "d:\CODE-COLLAB\frontend"
Set-Location -Path $frontendDir

Write-Host "Running SonarQube analysis for frontend" -ForegroundColor Cyan
npm run sonar -- "-Dsonar.host.url=$HostUrl" "-Dsonar.login=$Token"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error running analysis for frontend" -ForegroundColor Red
} else {
    Write-Host "Finished SonarQube frontend analysis." -ForegroundColor Green
}
