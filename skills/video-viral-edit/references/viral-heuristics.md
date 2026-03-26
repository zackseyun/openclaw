# Viral Video Heuristics

## Segment Selection (from long-form content)

Prioritize clips that contain:

1. **Hot takes / controversial opinions** — "I'm against part-time jobs"
2. **Surprising facts** — "White potatoes are #1 on the satiety index"
3. **Celebrity encounters** — "Simon Sinek was right there"
4. **Emotional moments** — genuine reactions, laughter
5. **Wisdom bombs** — "Skills are the value of everything"

## Timing Rules

- **Hook**: Must land in first 1-3 seconds
- **Caption changes**: Every 1-2.5 seconds (max 5 words per caption)
- **Max clip length**: 30-90 seconds for TikTok/Reels, up to 3 min for YouTube Shorts
- **Dead air**: Remove silences > 1.5s, filler words (um, uh, erm)

## Caption Style

- **Font**: Poppins Bold/Black (700/900 weight)
- **Position**: Bottom 16%, centered
- **Active word**: Bright white, spring scale-up animation
- **Active keyword**: Dark text on gold (#FFD700) pill background
- **Past word**: Full white
- **Past keyword**: Gold text (no background)
- **Future word**: Dimmed (35% white)
- **Entry**: Fade in + slide up
- **Exit**: Fade out
- **All caps**: Yes

## Quality Thresholds (Gemini Review)

All scores must be >= 8/10:

- Caption sync accuracy
- Silence handling
- Word highlight accuracy
- Hook strength
- Overall viral readiness
