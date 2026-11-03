# Bruno's Human

Shubham Saini's portfolio as a short film, narrated by Bruno, his Labrador.
Same content as the macOS edition (connect.madebyshubham.in), new design.

- **The film** (`src/film/`): 8 seconds of AI-generated GoPro footage
  (Google Veo, `public/film/bruno-run.mp4`) become a ~70 second film that starts by itself two seconds after load (no player chrome). Film
  time is the only state: `script.ts` maps it to footage time with speed
  ramps and freeze-frames, `lens.ts` is a WebGL2 pass (fisheye + fringing,
  focus-pull blur, a whip-pan over the generator's morph at 3.5–4.2s,
  "Bruno-vision" dichromat colours, a night grade), `Player.tsx` keeps the
  `<video>` decoder in step and draws the HUD, word-by-word text and pinned
  cards, and `Finale.tsx` is the Diwali doorstep: canvas fireworks, a MacBook
  that opens onto the macOS portfolio, and diyas that light up as you reach
  for them. Hidden keys: ←/→ jump stops, V dog vision, D director's view.
- **The script** (`src/film/script.ts`): where Bruno stops in the footage,
  what he says, and the cards at each stop. Timing is computed.
- **Ask Bruno** (`src/chat/BrunoChat.tsx`, `api/`): the same Claude chat agent
  as the macOS edition (streaming, per-visitor memory, injection guardrails),
  with Bruno's persona. Facts come only from `api/shubham.md`. Has a mic button
  (browser speech recognition) so visitors can just talk.

## Run

```bash
npm install
npm run dev        # http://localhost:8092, /api/chat served by Vite
npm test
npm run build
```

Needs `ANTHROPIC_API_KEY` in `.env.local` (dev) or in the Vercel project's
environment variables (prod). `api/chat.ts` deploys as a Vercel Edge Function.
