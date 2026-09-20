#!/usr/bin/env bash
# Placeholder voice for the prototype. REPLACE WITH HUMAN RECORDINGS before
# real use -- kids are very sensitive to synthetic Mandarin prosody.
#
#   ./scripts/gen-audio.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p audio
VOICE="${VOICE:-Tingting}"
RATE="${RATE:-150}"

say_one () {   # $1 = filename stem, $2 = text
  local stem="$1" text="$2"
  say -v "$VOICE" -r "$RATE" -o "/tmp/_lc_$stem.aiff" "$text"
  afconvert -f m4af -d aac -b 64000 "/tmp/_lc_$stem.aiff" "audio/$stem.m4a" >/dev/null
  rm -f "/tmp/_lc_$stem.aiff"
  printf '  audio/%s.m4a  %s\n' "$stem" "$text"
}

echo "Generating character audio with voice '$VOICE'..."
say_one da   "大"
say_one xiao "小"
say_one kai  "开"
say_one guan "关"
say_one huo  "火"
say_one shui "水"
say_one mao  "猫"
say_one men  "门"
say_one shang    "上"
say_one xia      "下"
say_one fei      "飞"
say_one shui4    "睡"
say_one chuang_w "窗"
say_one chuang_b "床"
say_one deng     "灯"
say_one gou      "狗"
say_one ni       "你"
say_one hao      "好"
say_one wo       "我"

echo "Generating 团团 lines..."
say_one tuan_hungry    "团团饿了"
say_one tuan_dark      "黑黑的"
say_one tuan_happy     "谢谢你"
say_one tuan_wet       "我湿了"

echo "Done."
