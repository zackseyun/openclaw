---
name: video-viral-edit
description: Edit video clips for viral social media. Transcribe, add captions, remove dead air, and auto-review quality using AI. Use when asked to edit a video, add captions, make a clip viral-ready, or process podcast clips.
metadata:
  {
    "openclaw": {
      "emoji": "🎬",
      "requires": { "bins": ["ffmpeg", "ffprobe", "whisper-cli", "npx"] },
      "install": [
        {
          "id": "brew-ffmpeg",
          "kind": "brew",
          "formula": "ffmpeg",
          "bins": ["ffmpeg", "ffprobe"],
          "label": "Install ffmpeg (brew)"
        },
        {
          "id": "brew-whisper",
          "kind": "brew",
          "formula": "whisper-cpp",
          "bins": ["whisper-cli"],
          "label": "Install whisper-cpp (brew)"
        }
      ]
    }
  }
---

# Video Viral Edit

Transform raw video (podcasts, talking-head, vlogs) into viral-ready captioned clips.

## Pipeline

The pipeline lives at `/Users/zackseyun/remotion-cartha/pipeline/pipeline.py` and the Remotion project at `/Users/zackseyun/remotion-cartha/`.

### Quick Start

```bash
# Full pipeline — transcribe, caption, remove dead air, AI review
python3 /Users/zackseyun/remotion-cartha/pipeline/pipeline.py INPUT_VIDEO.mov \
  --output output.mp4 \
  --gemini-key "$(aws secretsmanager get-secret-value --secret-id /cartha/openclaw/gemini_api_key --query SecretString --output text --region us-west-2)"

# Process only a segment (e.g., 3:27 to 5:18)
python3 /Users/zackseyun/remotion-cartha/pipeline/pipeline.py INPUT_VIDEO.mov \
  --segment 207 318 --output clip.mp4

# Skip AI review (faster, no Gemini calls)
python3 /Users/zackseyun/remotion-cartha/pipeline/pipeline.py INPUT_VIDEO.mov --no-review

# Skip dead air removal
python3 /Users/zackseyun/remotion-cartha/pipeline/pipeline.py INPUT_VIDEO.mov --no-clean
```

### Pipeline Stages

1. **Analyze** — FFmpeg `silencedetect` finds exact speech/silence boundaries from the audio waveform
2. **Transcribe** — `whisper-cli` with `ggml-medium.bin` produces word-level timestamps
3. **Clean** — Removes silences > 1.5s and filler words (um, uh, erm) via FFmpeg concat filter
4. **Manifest** — Generates `manifest.json` with waveform-anchored caption timing, word-level data, keyword highlights
5. **Render** — Remotion overlays Poppins captions with active word highlighting, spring animations, gold keyword pills
6. **Review** — Gemini 2.5 Flash watches the rendered video with audio and scores sync quality. Auto-corrects timing and re-renders until scores > 8/10

### Manual Steps

If you need to run individual stages:

```bash
# Extract audio
ffmpeg -hide_banner -y -i INPUT.mov -ar 16000 -ac 1 -c:a pcm_s16le audio.wav

# Transcribe
whisper-cli --model ~/.whisper-models/ggml-medium.bin --file audio.wav \
  --output-json-full --output-file transcript --language en --threads 8

# Detect silence
ffmpeg -hide_banner -i INPUT.mov -af "silencedetect=noise=-30dB:d=0.2" -f null - 2>&1 | grep silence_

# Render (after placing video in public/cuts/ and manifest in public/cuts/manifest.json)
npx remotion render PartTimeJobs output.mp4
```

### Gemini Video Review

The pipeline uses Gemini 2.5 Flash to watch rendered output and score:
- Caption sync accuracy (1-10)
- Silence handling (1-10)
- Word highlight accuracy (1-10)
- Hook strength (1-10)
- Overall viral readiness (1-10)

It also detects whether word highlights are too early/late and suggests millisecond corrections.

API key stored in AWS Secrets Manager: `/cartha/openclaw/gemini_api_key`

```bash
# Retrieve key
aws secretsmanager get-secret-value \
  --secret-id /cartha/openclaw/gemini_api_key \
  --query SecretString --output text --region us-west-2
```

### Remotion Project

- **Location:** `/Users/zackseyun/remotion-cartha/`
- **Composition:** `PartTimeJobs` reads from `public/cuts/manifest.json`
- **Component:** `src/CaptionOverlay.tsx` — Poppins font, word-by-word highlight, spring animations
- **Studio:** `npm run dev` at http://localhost:3123

### Whisper Model

- **Local (Mac):** `~/.whisper-models/ggml-medium.bin` (1.4GB, 65s for 27min on Apple Silicon)
- **Server:** Use `ggml-large-v3-turbo.bin` for production quality
- Download: `curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin -o models/ggml-large-v3-turbo.bin`

### Caption Style

- **Font:** Poppins (700, 900 weights)
- **Active word:** Bright white, spring scale-up animation
- **Active keyword:** Dark text on gold pill background
- **Past word:** Full white
- **Past keyword:** Gold text
- **Future word:** Dimmed (35% white)
- **Entry:** Fade in + slide up
- **Exit:** Fade out

### Viral Heuristics

When selecting segments from longer content, prioritize:
1. **Hot takes / controversial opinions** — "I'm against part-time jobs"
2. **Surprising facts** — "White potatoes are #1 on the satiety index"
3. **Celebrity encounters** — "Simon Sinek was right there"
4. **Emotional moments** — genuine reactions, laughter
5. **Wisdom bombs** — "Skills are the value of everything"

Hook should land in first 1-3 seconds. Caption changes every 1-2.5 seconds. Key words get gold highlights.
