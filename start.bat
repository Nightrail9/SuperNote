@echo off
setlocal

call "%~dp0scripts\dev\start.bat" %*
exit /b %errorlevel%
