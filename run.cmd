@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem  iFakePro launcher
rem
rem    run              start the web app (installs dependencies first run)
rem    run test         run the test suite
rem    run test watch   run the tests in watch mode
rem    run check        typecheck every package
rem    run fixtures     download the community test corpus
rem    run chart <file> [title]   print a parsed chart as text
rem    run build        production build into apps/web/dist
rem    run shot [file]  screenshot the running app (default screenshot.png)
rem    run audio [id]   render a groove offline and measure it (default medium-swing)
rem    run icons        regenerate the app icons
rem ---------------------------------------------------------------------------

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js was not found on PATH.
  echo   Install Node 20.18 or newer from https://nodejs.org and run this again.
  echo.
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo   First run - installing dependencies. This takes a minute.
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   npm install failed. Fix the error above and run this again.
    exit /b 1
  )
)

set "COMMAND=%~1"
if "%COMMAND%"=="" goto :dev
if /i "%COMMAND%"=="dev" goto :dev
if /i "%COMMAND%"=="test" goto :test
if /i "%COMMAND%"=="check" goto :check
if /i "%COMMAND%"=="fixtures" goto :fixtures
if /i "%COMMAND%"=="chart" goto :chart
if /i "%COMMAND%"=="build" goto :build
if /i "%COMMAND%"=="shot" goto :shot
if /i "%COMMAND%"=="audio" goto :audio
if /i "%COMMAND%"=="icons" goto :icons

echo.
echo   Unknown command "%COMMAND%".
echo   Try: run ^| run test ^| run check ^| run fixtures ^| run chart ^<file^> ^| run build ^| run shot ^| run audio
echo.
exit /b 1

:dev
echo.
echo   Starting iFakePro at http://localhost:5173
echo   Press Ctrl+C to stop.
echo.
call npm run dev --workspace @ifakepro/web -- --open
exit /b %errorlevel%

:test
if /i "%~2"=="watch" (
  call npm run test:watch
) else (
  call npm test
)
exit /b %errorlevel%

:check
call npm run typecheck
exit /b %errorlevel%

:fixtures
call npm run fixtures:fetch
exit /b %errorlevel%

:chart
if "%~2"=="" (
  echo   usage: run chart ^<playlist file^> [song title]
  echo   example: run chart fixtures\jazz1460.txt "Blue Bossa"
  exit /b 1
)
call npx vite-node tools/print-chart.ts -- %2 %3 %4 %5 %6
exit /b %errorlevel%

:build
call npm run build --workspace @ifakepro/web
exit /b %errorlevel%

:shot
if "%~2"=="" (
  call node tools/screenshot.mjs
) else (
  call node tools/screenshot.mjs %2
)
exit /b %errorlevel%

:audio
if "%~2"=="" (
  call node tools/audio-check.mjs
) else (
  call node tools/audio-check.mjs %2
)
exit /b %errorlevel%

:icons
call node tools/make-icons.mjs
exit /b %errorlevel%
