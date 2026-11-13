```bat
@echo off
title Tofaa Dev Servers
cd /d "%~dp0"

echo ===================================================
echo           Starting Tofaa AI Platform
echo ===================================================
echo.

:: 1. Start Backend with uv
echo [1/2] Launching Backend Server (FastAPI + uv)...
start "Tofaa Backend (FastAPI)" cmd /k "cd /d "%~dp0backend" && echo Starting FastAPI Backend on http://127.0.0.1:8000 ... && uv run --python-preference only-system python -m uvicorn src.main:app --reload --port 8000"

:: 2. Start Frontend with npm
echo [2/2] Launching Frontend Server (Next.js)...
start "Tofaa Frontend (Next.js)" cmd /k "cd /d "%~dp0frontend" && echo Starting Next.js Frontend on http://localhost:3000 ... && npm run dev"

echo.
echo ===================================================
echo  Services started in separate terminal windows:
echo    - Frontend App:   http://localhost:3000
echo    - Backend API:    http://127.0.0.1:8000
echo    - API Docs:       http://127.0.0.1:8000/docs
echo ===================================================
echo.
pause
```