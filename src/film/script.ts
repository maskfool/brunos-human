// The film's script: where Bruno stops in the footage, what he says, and the
// cards that pop up in the scene. Every fact about Shubham here comes from
// api/shubham.md (the profile the chat agent uses), so the two never disagree.

import profileImg from "@/assets/profile.jpeg";

export const EMAIL = "shubham1996saini@gmail.com";
export const LINKS = {
  email: `mailto:${EMAIL}`,
  github: "https://github.com/maskfool",
  linkedin: "https://www.linkedin.com/in/frontendshubham/",
  macPortfolio: "https://connect.madebyshubham.in",
};

export const FOOTAGE = {
  src: "/film/bruno-run.mp4",
  poster: "/film/poster.jpg",
  last: "/film/last.jpg",
  /** Last usable frame, in seconds of footage. */
  end: 7.95,
  /** The AI generator morphs the lane into the house here; a whip-pan hides it. */
  morph: [3.5, 4.2] as const,
};

// Cards are Bruno's scrapbook notes: `kicker` and `note` are his handwriting,
// so they're in his voice. The facts in them still come from the profile.
export type Card =
  | { kind: "person"; kicker: string; title: string; meta: string; body: string; photo: string; note: string }
  | { kind: "list"; kicker: string; title: string; meta?: string; items: string[]; note?: string }
  | { kind: "project"; kicker: string; title: string; body: string; image: string; tags: string[]; live: string; github?: string; note?: string }
  | { kind: "chips"; kicker: string; title: string; chips: string[]; learning: string[]; note: string };

export interface Chapter {
  id: string;
  label: string;
  /** Second of footage where Bruno stops. */
  at: number;
  /** Point in the footage the cards pin to (0–1 of the frame). */
  anchor: { x: number; y: number };
  lines: string[];
  cards: Card[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: "hello",
    label: "Hello",
    at: 1.2,
    anchor: { x: 0.47, y: 0.33 },
    lines: [
      "Woof! I'm Bruno, and yes, I'm wearing a GoPro. 🐾",
      "It's Diwali, and I'm running home to my human, Shubham Saini. Come along.",
    ],
    cards: [
      {
        kind: "person",
        kicker: "this is MY human!",
        title: "Shubham Saini",
        meta: "Gurgaon, India",
        body: "From React components to AI agents.",
        photo: profileImg,
        note: "my human ♥"
      },
    ],
  },
  {
    id: "work",
    label: "His job",
    at: 2.4,
    anchor: { x: 0.375, y: 0.3 },
    lines: [
      "He's been shipping React and Node products for 7+ years. He's an SDE-2 at Nagarro now.",
      "He rebuilt a shopping app for 100K+ people a month: +15% conversion. Then a login revamp: +30% retention.",
    ],
    cards: [
      {
        kind: "list",
        kicker: "where he goes every day",
        title: "SDE-2 · Nagarro",
        meta: "Aug 2019 – present · 7+ years",
        note: "big numbers. very good boy.",
        items: [
          "E-commerce PWA, 100K+ monthly users → +15% conversion",
          "Health & beauty auth revamp → +30% retention",
          "Wallet PWA for a major retail group",
        ],
      },
    ],
  },
  {
    id: "builds",
    label: "His builds",
    at: 3.45,
    anchor: { x: 0.45, y: 0.38 },
    lines: [
      "Now he builds applied AI, end to end. CtxVault gives every AI coding tool one shared memory.",
      "And PaisaBachao: say what you spent out loud, and a Claude advisor says a strict yes or no.",
    ],
    cards: [
      {
        kind: "project",
        kicker: "he made this!",
        note: "(not a chew toy)",
        title: "CtxVault",
        body: "MCP server: save a session in Claude Code, resume it in Codex.",
        image: "/projects/ctxvault.jpg",
        tags: ["MCP", "TypeScript", "Node.js"],
        live: "https://ctxvault.madebyshubham.in/",
        github: "https://github.com/maskfool/ctxvault",
      },
      {
        kind: "project",
        kicker: "and this!",
        note: "it says no to treats too",
        title: "PaisaBachao",
        body: "Voice expense logging, a strict Claude advisor, local-first data.",
        image: "/projects/paisabachao.jpg",
        tags: ["React", "Claude AI", "Voice"],
        live: "https://paisabachao.madebyshubham.in",
      },
    ],
  },
  {
    id: "craft",
    label: "How he works",
    at: 5.7,
    anchor: { x: 0.48, y: 0.43 },
    lines: [
      "He tests his AI properly. One of his apps can't ship unless it hits 85% accuracy with zero made-up answers.",
      "Everything he's shipped is TypeScript and Node. He's learning Python and LangChain now, and says so.",
    ],
    cards: [
      {
        kind: "chips",
        kicker: "stuff he's good at",
        title: "Evals over vibes",
        note: "still learning (like me with “sit”)",
        chips: ["LLM apps", "Agents & tools", "RAG", "MCP", "Evals", "TypeScript", "React", "Node.js"],
        learning: ["Python", "LangChain", "Vector DBs"],
      },
      {
        kind: "list",
        kicker: "more things he made",
        title: "More AI builds",
        items: ["sql-agent: plain English → SQL", "Accessibility Analyzer: WCAG + AI fixes", "EventFlo: eval-gated event AI"],
      },
    ],
  },
  {
    id: "home",
    label: "Home",
    at: FOOTAGE.end,
    anchor: { x: 0.5, y: 0.42 },
    lines: [
      "And this is home. Happy Diwali from both of us! 🪔",
      "He's looking for Applied AI roles. Remote first, Gurgaon works too.",
      "Want the full story? It's all on his MacBook. Come on in.",
    ],
    cards: [
      {
        kind: "list",
        kicker: "psst… are you hiring?",
        title: "Hiring for applied AI?",
        note: "bark at him here ↑",
        items: ["Applied AI roles", "Remote first · Gurgaon / Delhi NCR", "Part-time contract work: yes", EMAIL],
      },
    ],
  },
];

// ── Timeline ─────────────────────────────────────────────────
// Film time t is the only real state. Everything else (which frame of
// footage is on screen, the speed ramps, captions, blur) is derived from it,
// so pausing, seeking and scrubbing all just set t.

/** Footage plays at its real speed: slowing 24fps footage down makes it judder. */
export const RUN_RATE = 1;
/** Film seconds to ramp from a standstill to full speed, or back. */
const RAMP = 0.35;
/** Pause after the last line before the finale takes over. */
const END_HOLD = 0.4;
/** Words appear at roughly reading speed (characters per second). */
export const READ_CPS = 26;

// Time to let the text animate in, then be read, before Bruno runs on.
const lineDuration = (text: string) => Math.min(6, Math.max(2.4, text.length / 19 + 1));

export interface Cue {
  chapter: number;
  line: number;
  text: string;
  start: number;
  end: number;
}

export interface ChapterTiming {
  runStart: number;
  stopStart: number;
  stopEnd: number;
}

const buildTimeline = () => {
  let t = 0;
  let from = 0;
  const chapters: ChapterTiming[] = [];
  const cues: Cue[] = [];
  CHAPTERS.forEach((ch, ci) => {
    const runStart = t;
    t += (ch.at - from) / RUN_RATE + RAMP;
    from = ch.at;
    const stopStart = t;
    ch.lines.forEach((text, li) => {
      const d = lineDuration(text);
      cues.push({ chapter: ci, line: li, text, start: t, end: t + d });
      t += d;
    });
    chapters.push({ runStart, stopStart, stopEnd: t });
  });
  return { chapters, cues, duration: t + END_HOLD };
};

export const TIMELINE = buildTimeline();

export interface FilmState {
  /** Second of footage on screen. */
  video: number;
  /** 0 standing still … 1 full speed. */
  speed: number;
  chapter: number;
  stopped: boolean;
  /** Seconds since Bruno came to a stop (0 while running). */
  stoppedFor: number;
  cue: Cue | null;
  /** Seconds into the current cue. */
  cueTime: number;
}

/** Footage covered after tau film seconds of a run lasting dur (trapezoid speed). */
const runPos = (tau: number, dur: number) => {
  if (tau <= RAMP) return (RUN_RATE * tau * tau) / (2 * RAMP);
  if (tau <= dur - RAMP) return RUN_RATE * (RAMP / 2 + (tau - RAMP));
  const left = dur - tau;
  return RUN_RATE * (dur - RAMP) - (RUN_RATE * left * left) / (2 * RAMP);
};

export const filmStateAt = (t: number): FilmState => {
  const { chapters, cues } = TIMELINE;
  let ci = chapters.findIndex((c) => t < c.stopEnd);
  if (ci === -1) ci = chapters.length - 1;
  const c = chapters[ci];
  const from = ci === 0 ? 0 : CHAPTERS[ci - 1].at;

  if (t < c.stopStart) {
    const dur = c.stopStart - c.runStart;
    const tau = Math.max(0, t - c.runStart);
    const speed = Math.max(0, Math.min(1, tau / RAMP, (dur - tau) / RAMP));
    return { video: from + runPos(tau, dur), speed, chapter: ci, stopped: false, stoppedFor: 0, cue: null, cueTime: 0 };
  }

  const cue = cues.find((q) => q.chapter === ci && t >= q.start && t < q.end) ?? (t >= c.stopEnd ? cues[cues.length - 1] : null);
  return {
    video: CHAPTERS[ci].at,
    speed: 0,
    chapter: ci,
    stopped: true,
    stoppedFor: t - c.stopStart,
    cue,
    cueTime: cue ? t - cue.start : 0,
  };
};
