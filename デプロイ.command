#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NOTE FACTORY デプロイスクリプト
# GitHub Pages に自動プッシュします
# ダブルクリックで実行できます
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# スクリプトのあるディレクトリに移動
cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " NOTE FACTORY デプロイ開始"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 変更確認
echo "📋 変更ファイル:"
git diff --name-only
echo ""

# 変更がなければ終了
if [ -z "$(git status --porcelain)" ]; then
  echo "✅ 変更なし。すでに最新です。"
  echo ""
  echo "🔗 https://dreamryota704-wq.github.io/NOTE-FACTORY/note-factory-v10.html"
  echo ""
  read -p "Enterで閉じる..."
  exit 0
fi

# コミットメッセージ
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
MSG="Update note-factory-v10.html - ${TIMESTAMP}"

# add / commit / push
git add note-factory-v10.html
git commit -m "$MSG"

echo ""
echo "🚀 GitHub にプッシュ中..."
git push origin main

if [ $? -eq 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " ✅ デプロイ完了！"
  echo ""
  echo " 🔗 約1〜2分後に反映されます:"
  echo " https://dreamryota704-wq.github.io/NOTE-FACTORY/note-factory-v10.html"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
  echo ""
  echo "❌ プッシュに失敗しました。"
  echo "ネットワーク接続またはGitHub認証を確認してください。"
fi

echo ""
read -p "Enterで閉じる..."
