@echo off
title Photo Gallery App
echo Starting Photo Gallery Server...
where node >nul 2>nul
if %errorlevel% neq 0 (
  if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" server.js
  ) else (
    echo Node.js not found in PATH or standard location.
    pause
  )
) else (
  node server.js
)
pause
