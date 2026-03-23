#!/usr/bin/env bash
# Send a video to Gemini for AI review
# Usage: gemini-review.sh <video.mp4> [prompt]
set -euo pipefail

VIDEO="$1"
PROMPT="${2:-Watch this captioned video with audio and rate caption sync, silence handling, word highlight accuracy, hook strength, and viral readiness each 1-10. List specific issues.}"

GEMINI_KEY="${GEMINI_API_KEY:-$(aws secretsmanager get-secret-value --secret-id /cartha/openclaw/gemini_api_key --query SecretString --output text --region us-west-2)}"

# Compress if > 5MB
SIZE=$(stat -f%z "$VIDEO" 2>/dev/null || stat -c%s "$VIDEO" 2>/dev/null)
if [ "$SIZE" -gt 5000000 ]; then
    COMPRESSED=$(mktemp /tmp/review_XXXXX.mp4)
    ffmpeg -hide_banner -y -i "$VIDEO" -vf "scale=540:960" -c:v libx264 -crf 30 -preset fast -c:a aac -b:a 64k "$COMPRESSED" 2>/dev/null
    VIDEO="$COMPRESSED"
fi

VIDEO_B64=$(base64 < "$VIDEO")

python3 -c "
import json, urllib.request, sys

body = {
    'contents': [{'role': 'user', 'parts': [
        {'text': '''$PROMPT'''},
        {'inline_data': {'mime_type': 'video/mp4', 'data': '''$VIDEO_B64'''}},
    ]}],
    'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 4096},
}

url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_KEY'
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}, method='POST')

with urllib.request.urlopen(req, timeout=120) as resp:
    result = json.loads(resp.read())

print(result['candidates'][0]['content']['parts'][0]['text'])
"
