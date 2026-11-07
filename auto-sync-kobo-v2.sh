#!/bin/bash
# Kobo 自動同步腳本 v2 — 所有路徑避開 Desktop 限制

KOBO_DB="/Volumes/KOBOeReader/.kobo/KoboReader.sqlite"
PYTHON="/Library/Frameworks/Python.framework/Versions/3.13/bin/python3"
SYNC_SCRIPT="/Users/charles/.kobo-sync/sync-kobo.py"
LOG_FILE="/Users/charles/.kobo-sync/kobo-sync.log"
OUTPUT="/Users/charles/.kobo-sync/kobo-highlights.json"
DESKTOP_DIR="/Users/charles/Desktop/charlesshen"

sleep 3

if [ ! -f "$KOBO_DB" ]; then
  exit 0
fi

echo "$(date): Kobo 偵測到，開始同步..." >> "$LOG_FILE"

"$PYTHON" "$SYNC_SCRIPT" >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
  # 複製到 Desktop 資料夾
  cp "$OUTPUT" "$DESKTOP_DIR/kobo-highlights.json" 2>/dev/null
  osascript -e 'display notification "書摘已同步完成" with title "Kobo 同步成功"'
  echo "$(date): 同步成功" >> "$LOG_FILE"
else
  osascript -e 'display notification "同步失敗，請查看 log" with title "Kobo 同步失敗"'
  echo "$(date): 同步失敗" >> "$LOG_FILE"
fi
