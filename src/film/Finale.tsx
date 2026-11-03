import { useEffect, useRef, useState } from "react";
import { LINKS } from "./script";

// Diwali at the doorstep: fireworks you can launch by clicking the sky, a
// MacBook that opens onto Shubham's macOS portfolio, and five diyas that light
// up as you reach for them. Each diya is a way to reach Shubham; light all
// five and the sky answers.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  size: number;
}

interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  hue: number;
}

const HUES = [42, 330, 200, 120, 28, 280, 50];

const DIYAS = [
  { label: "Ask Bruno", action: "chat" as const },
  { label: "Email", href: LINKS.email },
  { label: "LinkedIn", href: LINKS.linkedin },
  { label: "GitHub", href: LINKS.github },
  { label: "Replay", action: "replay" as const },
];

const Diya = ({ lit, label }: { lit: boolean; label: string }) => (
  <svg viewBox="0 0 80 70" className={`diya-svg ${lit ? "lit" : ""}`} aria-hidden="true">
    <defs>
      <radialGradient id="diya-glow">
        <stop offset="0" stopColor="#FFD27A" stopOpacity="0.9" />
        <stop offset="1" stopColor="#FF8A2A" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="diya-clay" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#C8642E" />
        <stop offset="1" stopColor="#7A3517" />
      </linearGradient>
    </defs>
    <circle className="diya-halo" cx="40" cy="30" r="30" fill="url(#diya-glow)" />
    <path className="diya-flame" d="M40 12 C46 22 47 30 40 36 C33 30 34 22 40 12 Z" fill="#FFC64D" />
    <path className="diya-core" d="M40 22 C43 27 43 31 40 34 C37 31 37 27 40 22 Z" fill="#FFF5D6" />
    <path d="M8 40 C14 60 66 60 72 40 C60 46 20 46 8 40 Z" fill="url(#diya-clay)" />
    <path d="M8 40 C20 46 60 46 72 40 C62 36 18 36 8 40 Z" fill="#E08A4A" />
    <path d="M14 50 C28 54 52 54 66 50" stroke="#F2C14E" strokeWidth="1.6" fill="none" strokeDasharray="2 3" />
    <title>{label}</title>
  </svg>
);

const Finale = ({ onAsk, onReplay }: { onAsk: () => void; onReplay: () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const launchRef = useRef<(x: number, y: number, big?: boolean) => void>(() => {});
  const [lit, setLit] = useState<boolean[]>(() => DIYAS.map(() => false));
  const allLit = lit.every(Boolean);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const particles: Particle[] = [];
    const rockets: Rocket[] = [];
    let raf = 0;
    let last = performance.now();
    let nextAuto = 0.4;
    let w = 0;
    let h = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const burst = (x: number, y: number, hue: number, big: boolean) => {
      const n = big ? 140 : 80;
      const speed = (big ? 5.2 : 3.6) * (h / 600);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const s = speed * (0.4 + Math.random() * 0.6);
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 1.1 + Math.random() * 0.9, hue: hue + (Math.random() - 0.5) * 30, size: 1.2 + Math.random() * 1.4 });
      }
    };

    launchRef.current = (x, y, big = false) => {
      rockets.push({ x, y: h, vy: -(h * 1.3), targetY: y, hue: HUES[Math.floor(Math.random() * HUES.length)] });
      if (big) for (let i = 0; i < 4; i++) setTimeout(() => launchRef.current(w * (0.15 + Math.random() * 0.7), h * (0.08 + Math.random() * 0.25)), i * 180);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      nextAuto -= dt;
      if (nextAuto <= 0) {
        nextAuto = 0.9 + Math.random() * 1.4;
        launchRef.current(w * (0.1 + Math.random() * 0.8), h * (0.06 + Math.random() * 0.28));
      }

      // Trails: fade the previous frame instead of clearing it.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy * dt;
        ctx.fillStyle = `hsla(${r.hue},100%,75%,0.9)`;
        ctx.fillRect(r.x - 1, r.y, 2, 6);
        if (r.y <= r.targetY) {
          burst(r.x, r.y, r.hue, Math.random() < 0.3);
          rockets.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life > p.max) {
          particles.splice(i, 1);
          continue;
        }
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.045 * (h / 600);
        p.x += p.vx;
        p.y += p.vy;
        const k = 1 - p.life / p.max;
        ctx.fillStyle = `hsla(${p.hue},100%,${55 + k * 25}%,${k})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + k * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (allLit) {
      const c = canvasRef.current!.getBoundingClientRect();
      launchRef.current(c.width / 2, c.height * 0.18, true);
    }
  }, [allLit]);

  const light = (i: number) => setLit((prev) => (prev[i] ? prev : prev.map((v, j) => (j === i ? true : v))));

  const activate = (i: number) => {
    light(i);
    const d = DIYAS[i];
    if (d.action === "chat") onAsk();
    else if (d.action === "replay") onReplay();
    else if (d.href) window.open(d.href, d.href.startsWith("mailto:") ? "_self" : "_blank", "noopener");
  };

  return (
    <div className="finale" onClick={(e) => e.stopPropagation()}>
      <canvas
        ref={canvasRef}
        className="finale-sky"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          launchRef.current(e.clientX - r.left, e.clientY - r.top);
        }}
      />
      <div className="finale-title">
        <p className="finale-deva" lang="hi">शुभ दीपावली</p>
        <h2>Happy Diwali, from Shubham &amp; Bruno</h2>
      </div>

      <div className="finale-mac">
        <a className="macbook" href={LINKS.macPortfolio} target="_blank" rel="noopener noreferrer" aria-label="Open Shubham's macOS portfolio">
          <div className="mb-lid">
            <div className="mb-screen">
              <img src="/film/mac-portfolio.jpg" alt="Shubham's macOS-style portfolio" />
              <span className="mb-glare" />
            </div>
          </div>
          <div className="mb-base">
            <span className="mb-notch" />
          </div>
        </a>
        <p className="mb-line">You can know more about Shubham on his MacBook.</p>
        <a className="mb-cta" href={LINKS.macPortfolio} target="_blank" rel="noopener noreferrer">
          <span className="mb-cta-label">Open his MacBook</span>
          <span className="mb-cta-url">connect.madebyshubham.in ↗</span>
        </a>
      </div>

      <ul className="diyas">
        {DIYAS.map((d, i) => (
          <li key={d.label}>
            <button
              className={`diya ${lit[i] ? "is-lit" : ""}`}
              onPointerEnter={() => light(i)}
              onFocus={() => light(i)}
              onClick={() => activate(i)}
            >
              <Diya lit={lit[i]} label={d.label} />
              <span>{d.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Finale;
