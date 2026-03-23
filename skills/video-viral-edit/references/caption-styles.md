# Caption Style Reference

## Remotion Component

`/Users/zackseyun/My Drive/Moltbot-Shared/Documents/GitHub/cartha-video-gen-pipeline/src/CaptionOverlay.tsx`

## Manifest Format

```json
{
  "source": "cuts/video.mp4",
  "title": "Clip Title",
  "hook": "Opening hook text",
  "captions": [
    {
      "start": 0.5,
      "end": 2.1,
      "text": "THIS IS THE CAPTION",
      "words": [
        { "text": "THIS", "start": 0.5, "end": 0.8 },
        { "text": "IS", "start": 0.8, "end": 1.0 },
        { "text": "THE", "start": 1.0, "end": 1.3 },
        { "text": "CAPTION", "start": 1.3, "end": 2.1 }
      ],
      "highlight": ["CAPTION"],
      "style": "hook"
    }
  ]
}
```

## Style Types

| Style | Font Size | Font Weight | Use |
|-------|-----------|-------------|-----|
| `hook` | 66px | 900 (Black) | First 1-2 captions |
| `emphasis` | 60px | 700 (Bold) | Key moments |
| `normal` | 54px | 700 (Bold) | Default |

## Visual States

| State | Color | Background | Scale | Shadow |
|-------|-------|------------|-------|--------|
| Active word | #FFFFFF | none | 1.05× spring | White glow + dark |
| Active keyword | #1a1a1a | #FFD700 pill | 1.08× spring | none |
| Past word | #FFFFFF | none | 1× | Dark shadow |
| Past keyword | #FFD700 | none | 1× | Dark shadow |
| Future word | rgba(255,255,255,0.35) | none | 1× | Subtle dark |

## Timing Corrections

- Global shift: -125ms (compensates whisper lag)
- Word highlight shift: -75ms (additional per-word correction)
- These are applied during manifest generation, not at render time
