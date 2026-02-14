@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "ROOT=%%~fI"

echo SuperNote Setup Assistant
echo =========================

echo 1. Checking Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Node.js not found. Please install it from https://nodejs.org/
  pause
  exit /b 1
)
echo [OK] Node.js is installed.

echo 2. Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Python not found. Please install it from https://www.python.org/
  pause
  exit /b 1
)
echo [OK] Python is installed.

echo 3. Installing Node.js dependencies...
echo Running npm install in root...
pushd "%ROOT%"
call npm install
echo Running npm install in apps/web...
call npm --prefix apps/web install
popd

echo 4. Installing Python dependencies...
pushd "%ROOT%"
pip install -r requirements.txt
popd

echo 5. Checking for CUDA...
python -c "import torch; print('CUDA Available: ' + str(torch.cuda.is_available()))"
if %errorlevel% neq 0 (
  echo [INFO] torch not found or error checking CUDA. If you want GPU acceleration, please see INSTALL_CH.md section 4.2.
)

echo =========================
echo Setup complete!
echo To start the app, run start.bat
pause
