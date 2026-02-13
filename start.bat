@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_PORT=3001"
set "FRONTEND_PORT=3000"
set "HEALTH_WAIT_SECONDS=12"

call :find_listen_pid %FRONTEND_PORT% FRONTEND_PID
if defined FRONTEND_PID (
  echo [ERROR] Port %FRONTEND_PORT% is in use. Stop PID %FRONTEND_PID% first.
  exit /b 1
)

call :find_listen_pid %BACKEND_PORT% BACKEND_PID
if defined BACKEND_PID (
  echo [ERROR] Port %BACKEND_PORT% is in use. Stop PID %BACKEND_PID% first.
  exit /b 1
)

echo Starting backend on %BACKEND_PORT%...
start "" /b cmd /c "cd /d ""%ROOT%"" && set PORT=%BACKEND_PORT% && npm run dev"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(%HEALTH_WAIT_SECONDS%); while((Get-Date) -lt $deadline){ try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:%BACKEND_PORT%/health' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ exit 0 } } catch {} Start-Sleep -Milliseconds 200 }; exit 1" >nul
if errorlevel 1 (
  echo [WARN] Backend health check timed out after %HEALTH_WAIT_SECONDS%s. Frontend will still start.
)

echo Starting frontend on %FRONTEND_PORT%...
echo Local: http://localhost:%FRONTEND_PORT%/
echo Press Ctrl+C to stop.

npm --prefix apps/web run dev -- --port %FRONTEND_PORT% --strictPort

exit /b 0

:find_listen_pid
set "%~2="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%~1 .*LISTENING"') do (
  set "%~2=%%p"
  goto :eof
)
goto :eof
