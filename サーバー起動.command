#!/bin/bash
# NOTE FACTORY バックエンドサーバー 起動スクリプト（Mac用）
# このファイルをダブルクリックするだけで起動します

echo "======================================"
echo "  NOTE FACTORY サーバー起動中..."
echo "======================================"

# --- NOTE-FACTORY フォルダを探す ---
# まずこのスクリプト自身のフォルダを確認
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/src/server.js" ]; then
  # スクリプトと同じフォルダに server.js がある（正しい場所）
  NOTE_FACTORY_DIR="$SCRIPT_DIR"
else
  # スクリプトが別の場所にある → よく使う場所を自動検索
  echo "📂 NOTE-FACTORY フォルダを検索中..."
  FOUND=""
  SEARCH_LOCATIONS=(
    "$HOME/Desktop/NOTE-FACTORY"
    "$HOME/Documents/NOTE-FACTORY"
    "$HOME/NOTE-FACTORY"
    "$HOME/Downloads/NOTE-FACTORY"
    "$HOME/Desktop/note-factory"
    "$HOME/Documents/note-factory"
  )
  for loc in "${SEARCH_LOCATIONS[@]}"; do
    if [ -f "$loc/src/server.js" ]; then
      FOUND="$loc"
      break
    fi
  done

  if [ -z "$FOUND" ]; then
    echo ""
    echo "❌ NOTE-FACTORY フォルダが見つかりません。"
    echo ""
    echo "以下の手順で解決してください："
    echo ""
    echo "  1. ターミナルを開く"
    echo "  2. 以下を実行してクローン:"
    echo "     git clone https://github.com/dreamryota704-wq/NOTE-FACTORY.git ~/Desktop/NOTE-FACTORY"
    echo "  3. ~/Desktop/NOTE-FACTORY/サーバー起動.command をダブルクリック"
    echo ""
    read -p "Enterキーを押して閉じる..."
    exit 1
  fi
  NOTE_FACTORY_DIR="$FOUND"
fi

echo "📁 使用フォルダ: $NOTE_FACTORY_DIR"
cd "$NOTE_FACTORY_DIR"

# --- Node.js の確認 ---
if ! command -v node &> /dev/null; then
  echo ""
  echo "❌ Node.js がインストールされていません。"
  echo "   https://nodejs.org からインストールしてください。"
  echo ""
  read -p "Enterキーを押して閉じる..."
  exit 1
fi

echo "✅ Node.js: $(node --version)"

# --- 依存パッケージのインストール（初回のみ）---
if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦 初回セットアップ中... (1〜3分かかります)"
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "❌ npm install に失敗しました。"
    echo "   ターミナルで以下を実行してみてください:"
    echo "   sudo chown -R \$(whoami) ~/.npm"
    echo "   その後もう一度ダブルクリックしてください。"
    read -p "Enterキーを押して閉じる..."
    exit 1
  fi
fi

# --- すでに起動中か確認 ---
if lsof -i :3001 &> /dev/null; then
  echo ""
  echo "======================================"
  echo "  ✅ サーバーはすでに起動中です！"
  echo "  🌐 http://localhost:3001 で稼働中"
  echo "  このウィンドウを閉じて大丈夫です。"
  echo "======================================"
  echo ""
  read -p "Enterキーを押して閉じる..."
  exit 0
fi

echo ""
echo "======================================"
echo "  🚀 サーバーを起動します"
echo "  🌐 http://localhost:3001"
echo "  ⚠️  このウィンドウは閉じないでください"
echo "======================================"
echo ""

# --- サーバー起動（クラッシュしたら自動再起動）---
while true; do
  node src/server.js
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 0 ]; then
    echo "サーバーが正常終了しました。"
    break
  fi
  echo ""
  echo "⚠️  サーバーが停止しました（終了コード: $EXIT_CODE）"
  echo "   3秒後に自動再起動します... (Ctrl+C で停止)"
  sleep 3
done
