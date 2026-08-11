# Hyperframes Composition Brief: במקור (Bamakor)

## Objective
Create a short launch-style brag video for Bamakor — Hebrew RTL, polished B2B, showing the real product flow (WhatsApp ticket → manager desk → translation/chat/assign), not generic SaaS slides.

## Output
- Composition directory: `brag-output-2026-08-11-094039/composition/`
- Rendered video: `brag-output-2026-08-11-094039/brag.mp4`
- Format: vertical — 1080x1920
- Duration: 20 seconds

## Source Material
- Project root: `/workspace`
- Primary files: README.md, app/globals.css, app/for-managers/page.tsx, TicketDetailDrawer patterns
- Product name: במקור
- Tagline / strongest claim: תקלות, דיירים ועובדים — בלי לנהל את זה בצ׳אטים פזורים
- Key UI to recreate: WhatsApp inbound → ticket card with photo → drawer tabs + translate + assign worker
- Copy that must appear verbatim:
  - במקור
  - תקלות, דיירים ועובדים — בלי לנהל את זה בצ׳אטים פזורים
  - ערוץ דיווח לדיירים, שולחן ניהול למשרד, ושיבוץ לעובדי השטח — במקום אחד.
  - לחצו על כפתור יצירת הקשר בדף

## Creative Direction
- Tone preset: polished
- Creative direction: quiet premium product film for maintenance company managers
- Interpretation: restraint, readable Hebrew, real UI chrome, longer holds
- Angle: WhatsApp chaos → ordered Bamakor desk
- Hook: messy WhatsApp bubbles
- Outro / punchline: subhead + contact CTA (no phone number on screen)
- Avoid:
  - Generic SaaS language
  - Abstract filler / purple gradients
  - QR as hero
  - Voiceover
  - Remotion-style text-only slides

## Visual Identity
- Background: #F9F9FB (product), #0B1220 (brand beats)
- Text: #1A1A2E / #F8FAFC
- Accent: #0066FF
- Display font: Heebo (Google Fonts)
- Body font: Heebo
- Visual references: ticket drawer, WhatsApp thread, primary blue buttons, StatusBadge feel

## Storyboard
1. Chaos hook — 3s — WhatsApp bubbles
2. Brand reveal — 3s — במקור + headline
3. Ticket opens — 5s — #184 card + photo
4. Manager tools — 5s — translate / WhatsApp tab / assign
5. Outro CTA — 4s — subhead + contact button

## Audio
- Audio role: warm bed
- Music: assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3
- Music treatment: volume ~0.22, fade under final 1.5s
- Music cue guidance: ../happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json — lock brand land near ~3.0s
- Audio-reactive treatment: subtle blue glow on brand scene only
- Audio-coupled moments:
  - Scene 1 — bubble sequence
  - Scene 3 — card reveal
  - Scene 4 — row reveals
  - Scene 5 — final logo
- Exact SFX choice: Hyperframes / author discretion; sparse
- Voice: disabled

## Hyperframes Instructions
- Standalone index.html, 1080x1920, data-duration="20"
- dir=rtl, lang=he
- Full-bleed background on child fills, not root background alone
- class="clip" scenes with data-start/data-duration/data-track-index
- One paused GSAP timeline at window.__timelines["main"]
- Include <audio> for music track
- Run `npx hyperframes check` before render
