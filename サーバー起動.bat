@echo off
chcp 65001 > nul
title NOTE FACTORY サーバー

echo ======================================
echo   NOTE FACTORY サーバー起動中...
echo ======================================

cd /d "%~dp0"

:: node がインストールされているか確認
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo ❌ Node.js がインストールされていません。
  echo    https://nodejs.org からインストールしてください。
  echo.
  pause
  exit /b 1
)

:: 依存関係インストール（初回のみ）
if not exist "node_modules" (
  echo 📦 初回セットアップ中... ^(数分かかります^)
  npm install
)

echo.
echo ✅ サーバー起動！ブラウザでツールを使えます。
echo    このウィンドウは閉じないでください。
echo ======================================
echo.

node src/server.js
pause
