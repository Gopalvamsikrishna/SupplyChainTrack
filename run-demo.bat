@echo off
set ROOT=%~dp0
rem -- open Hardhat node window
start "Hardhat Node" cmd /k "cd /d %ROOT% && npx hardhat node --hostname 127.0.0.1"

rem -- wait a couple seconds to let node start (optional)
timeout /t 2 /nobreak >nul

rem -- open indexer window
start "Indexer" cmd /k "cd /d %ROOT% && node indexer.js"

rem -- open frontend window
start "Frontend" cmd /k "cd /d %ROOT%frontend && npm run dev"

echo Launched Hardhat node, indexer, and frontend windows.
