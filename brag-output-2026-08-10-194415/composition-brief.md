# Hyperframes Composition Brief: במקור (Bamakor)

## Objective
Create a short launch-style brag video for Bamakor Dashboard.

## Output
- Composition directory: `brag-output-2026-08-10-194415/composition/`
- Rendered video: `brag-output-2026-08-10-194415/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: `/workspace`
- Primary files read: README.md, app/globals.css, app/components/ui.tsx theme, app/page.tsx
- Product name: במקור (Bamakor)
- Tagline / strongest claim: אחזקה שמגיבה בזמן
- Key UI or visual moment to recreate: WhatsApp report → ticket card → worker portal → closed status + KPIs
- Copy that must appear verbatim:
  - יש נזילה בקומה 3
  - תקלה #142
  - אחזקה שמגיבה בזמן
  - במקור

## Creative Direction
- Tone preset: polished
- Creative direction: quiet premium Hebrew product film for building ops
- Interpretation: Confident holds, RTL Hebrew UI, Apple-like surfaces, blue accent
- Angle: From leak report to closed ticket without phone tag
- Hook: WhatsApp bubble "יש נזילה בקומה 3"
- Outro / punchline: במקור — אחזקה שמגיבה בזמן
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - English-only UI (product is Hebrew RTL)

## Visual Identity
- Background: #F9F9FB
- Text: #1A1A2E
- Accent: #0066FF
- Success: #34C759
- Surface: #FFFFFF
- Display font: Heebo (Google Fonts)
- Body font: Heebo
- Visual references from the project: ticket cards, status badges, KPI cards, blue primary buttons

## Storyboard
Use the storyboard in `brag-plan.md` as the creative contract.

Scene summary:
1. WhatsApp hook — 3.0s — bubble + "דייר דיווח."
2. Ticket opens — 4.5s — dashboard ticket #142 פתוחה
3. Worker notified — 4.0s — worker card + tap
4. Closed + KPIs — 4.5s — נסגרה + KPI pills
5. Logo outro — 4.0s — logo + tagline

## Audio
- Audio role: warm corporate bed
- Audio arc: bed under product demo → soft fade on outro
- Music: assets/music/bgm.mp3
- Music treatment: volume ~0.28, fade last 1.5s
- Music cue guidance: detect at composition via hyperframes beats if available
- Audio-reactive treatment: subtle; logo glow only
- Audio-coupled moments:
  - Scene 1 bubble — card-place
  - Scene 2 ticket — card-place
  - Scene 3 tap — click
  - Scene 4 close — bong + card places for KPIs
  - Scene 5 logo — soft bell
- SFX selection guidance: sparse UI sounds from assets/sfx
- Exact SFX choice: Hyperframes should choose timestamps/volume based on animation
- Audio files: already copied into composition/assets/

## Hyperframes Instructions
Build a monolithic standalone composition in index.html. RTL Hebrew. Show real product UI recreations. Run `npx hyperframes check` before render.
