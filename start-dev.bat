@echo off
setlocal
chcp 65001 >nul
title Dungeon Oddballs - Development
pushd "%~dp0"
if errorlevel 1 exit /b 1

where node >nul 2>nul
if errorlevel 1 (
  echo Node.jsが見つかりません。Node.js 24をインストールしてください。
  goto failed
)
if not exist "node_modules\electron-vite\bin\electron-vite.js" (
  echo 依存ファイルがありません。このフォルダーで pnpm install を実行してください。
  goto failed
)

echo 開発版を起動します。このウィンドウは開いたままにしてください。
echo 終了するときは、ゲームのトレイメニューから「終了」を選んでください。
node tools\dev.mjs
set "gameExitCode=%errorlevel%"
if not "%gameExitCode%"=="0" (
  echo.
  echo 開発版の起動または実行に失敗しました。終了コード: %gameExitCode%
  pause
)
popd
exit /b %gameExitCode%

:failed
popd
pause
exit /b 1
