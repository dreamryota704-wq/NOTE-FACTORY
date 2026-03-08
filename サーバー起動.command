#!/bin/bash
# NOTE FACTORY バックエンドサーバー 起動スクリプト（Mac用）
# このファイルをダブルクリックするだけで起動します

cd "$(dirname "$0")"

echo "======================================"
echo "  NOTE FACTORY サーバー起動中..."
echo "======================================"

# node がインストールされているか確認
if ! command -v node &> /dev/null; then
  echo ""
  echo "❌ Node.js がインストールされていません。"
  echo "   https://nodejs.org からインストールしてください。"
  echo ""
  read -p "Enterキーを押して閉じる..."
  exit 1
fi

# 依存関係インストール（node_modules がなければ）
if [ ! -d "node_modules" ]; then
  echo "📦 初回セットアップ中... (数分かかります)"
  npm install
fi

echo ""
echo "✅ サーバー起動！ブラウザでツールを使えます。"
echo "   このウィンドウは閉じないでください。"
echo "======================================"
echo ""

node src/server.js
