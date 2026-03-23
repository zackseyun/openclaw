#!/usr/bin/env bash
# Run the video viral edit pipeline
# Usage: run-pipeline.sh <input_video> [--output out.mp4] [--segment START END] [--no-review] [--no-clean]
set -euo pipefail

PIPELINE_DIR="/Users/zackseyun/remotion-cartha/pipeline"
GEMINI_KEY="${GEMINI_API_KEY:-$(aws secretsmanager get-secret-value --secret-id /cartha/openclaw/gemini_api_key --query SecretString --output text --region us-west-2 2>/dev/null || echo '')}"

export GEMINI_API_KEY="$GEMINI_KEY"

python3 "$PIPELINE_DIR/pipeline.py" "$@" --gemini-key "$GEMINI_KEY"
