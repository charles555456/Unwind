#!/bin/bash
# Kobo 自動同步腳本 — 偵測到 Kobo 時自動匯出書摘

KOBO_DB="/Volumes/KOBOeReader/.kobo/KoboReader.sqlite"
SYNC_SCRIPT="/Users/charles/Desktop/charlesshen/sync-kobo.py"
LOG_FILE="/Users/charles/Desktop/charlesshen/kobo-sync.log"

# 等幾秒讓裝置完全掛載
sleep 3

# 檢查 Kobo 是否存在
if [ ! -f "$KOBO_DB" ]; then
  exit 0
fi

echo "$(date): Kobo 偵測到，開始同步..." >> "$LOG_FILE"

# 執行同步
python3 "$SYNC_SCRIPT" >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
  # macOS 通知
  osascript -e 'display notification "書摘已同步完成，記得上傳 kobo-highlights.json 到 GitHub" with title "📚 Kobo 同步成功"'
  echo "$(date): 同步成功" >> "$LOG_FILE"
else
  osascript -e 'display notification "同步失敗，請查看 log" with title "❌ Kobo 同步失敗"'
  echo "$(date): 同步失敗" >> "$LOG_FILE"
fi
