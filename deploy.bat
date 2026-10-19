@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
echo === Installing dependencies ===
call npm install 2>&1
echo === npm install exit code: %ERRORLEVEL% ===

echo === Building production bundle (skip type checking) ===
call npx next build --no-typescript 2>&1
echo === Build exit code: %ERRORLEVEL% ===

if %ERRORLEVEL% neq 0 (
  echo Build failed, aborting deployment
  exit /b %ERRORLEVEL%
)

echo === Deploying to Vercel (production) ===
call npx vercel --prod --yes 2>&1
echo === Vercel deploy exit code: %ERRORLEVEL% ===
