import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Lens, footageToScreen, type LensParams } from "./lens";
import { CardStack } from "./Cards";
import Finale from "./Finale";
import { CHAPTERS, FOOTAGE, READ_CPS, RUN_RATE, TIMELINE, filmStateAt, type Cue, type FilmState } from "./script";

// The film. No player chrome: it loads, holds the title for two seconds, and
// runs. Film time t is the clock; the footage, its speed ramps, the lens,
// the text and the cards are all derived from t every frame. The <video>
// element is only a frame source that gets nudged to follow t.

export interface PlayerHandle {
  replay: () => void;
}

/** How long the title holds before Bruno sets off. */
const INTRO_MS = 2000;

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Look of a held frame, given how long Bruno has been stopped. */
const heldLook = (chapter: number, stoppedFor: number) => {
  const last = chapter === CHAPTERS.length - 1;
  return {
    blur: smooth(0, 0.6, stoppedFor) * (last ? 0.16 : 0.42),
    zoom: 1 + 0.035 * smooth(0, 6, stoppedFor),
    night: last ? smooth(0.3, 3, stoppedFor) * 0.7 : 0,
    hold: smooth(0, 0.8, stoppedFor),
  };
};

/** Every lens setting for film time t. */
const lensAt = (t: number, st: FilmState, ended: boolean) => {
  const [m0, m1] = FOOTAGE.morph;
  const whip = smooth(m0 - 0.02, m0 + 0.25, st.video) * (1 - smooth(m1 - 0.3, m1 + 0.05, st.video));
  if (ended) return { blur: 0.22, whip: 0, night: 0.78, zoom: 1.05, hold: 1 };
  if (st.stopped) return { ...heldLook(st.chapter, st.stoppedFor), whip };
  // Running again: the previous stop's focus pull, push-in and drift ease away.
  if (st.chapter === 0) return { blur: 0, zoom: 1, night: 0, hold: 0, whip };
  const prev = TIMELINE.chapters[st.chapter - 1];
  const look = heldLook(st.chapter - 1, prev.stopEnd - prev.stopStart);
  const k = 1 - smooth(0, 0.45, t - TIMELINE.chapters[st.chapter].runStart);
  return { blur: look.blur * k, zoom: 1 + (look.zoom - 1) * k, night: look.night * k, hold: look.hold * k, whip };
};

/** Bruno's line, word by word: each word fades up as you'd read it. */
const Line = ({ cue }: { cue: Cue }) => {
  let chars = 0;
  return (
    <p className="line">
      {cue.text.split(" ").map((w, i) => {
        const delay = chars / READ_CPS;
        chars += w.length + 1;
        return (
          <span key={i} style={{ animationDelay: `${delay.toFixed(2)}s` }}>
            {w}{" "}
          </span>
        );
      })}
    </p>
  );
};

const Player = forwardRef<PlayerHandle, { onAsk: () => void }>(({ onAsk }, ref) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lensRef = useRef<Lens | null>(null);
  const pinRef = useRef<SVGSVGElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const hudTime = useRef<HTMLSpanElement>(null);
  const hudBpm = useRef<HTMLSpanElement>(null);
  const hudBatt = useRef<HTMLSpanElement>(null);
  const dbgRef = useRef<HTMLPreElement>(null);
  const dbgGraph = useRef<HTMLCanvasElement>(null);

  const tRef = useRef(0);
  const playingRef = useRef(false);
  const endedRef = useRef(false);
  const visionRef = useRef(0);
  const visionTarget = useRef(0);
  const frameDirty = useRef(true);

  const [ready, setReady] = useState(false);
  const [noGl, setNoGl] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [view, setView] = useState({ chapter: 0, stopped: false, cueKey: "", showCards: false, titleOut: false });
  const [vision, setVision] = useState(false);
  const [debug, setDebug] = useState(false);
  // The clip's own sound (paws, panting, crackers). Browsers only allow audio
  // after a tap, so it starts muted with a nudge pointing at the button.
  const [sound, setSound] = useState(false);
  const [soundHint, setSoundHint] = useState(false);

  const duration = TIMELINE.duration;

  const play = useCallback(() => {
    if (tRef.current >= duration) tRef.current = 0;
    playingRef.current = true;
    endedRef.current = false;
    setStarted(true);
    setEnded(false);
  }, [duration]);

  const seekChapter = useCallback(
    (i: number) => {
      const idx = Math.max(0, Math.min(CHAPTERS.length - 1, i));
      const c = TIMELINE.chapters[idx];
      // Land just before he pulls up, so you see him slow into the stop.
      tRef.current = idx === 0 ? 0 : Math.max(c.runStart, c.stopStart - 0.8);
      play();
    },
    [play]
  );

  useImperativeHandle(ref, () => ({ replay: () => seekChapter(0) }), [seekChapter]);

  // Load the whole clip up front (it's small), so playback never waits on the network.
  useEffect(() => {
    let url = "";
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(FOOTAGE.src);
        const blob = await res.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
      } catch {
        url = FOOTAGE.src; // stream it instead
      }
      const v = videoRef.current;
      if (v && !cancelled) v.src = url;
    })();
    return () => {
      cancelled = true;
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current!;
    const onData = () => {
      setReady(true);
      frameDirty.current = true;
    };
    const onSeeked = () => (frameDirty.current = true);
    v.addEventListener("loadeddata", onData);
    v.addEventListener("seeked", onSeeked);
    try {
      lensRef.current = new Lens(canvasRef.current!);
    } catch (e) {
      console.warn("[lens] falling back to plain video:", e);
      setNoGl(true);
    }
    return () => {
      v.removeEventListener("loadeddata", onData);
      v.removeEventListener("seeked", onSeeked);
    };
  }, []);

  // Title holds for two seconds, then the film runs by itself.
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(play, INTRO_MS);
    setSoundHint(true);
    const hide = window.setTimeout(() => setSoundHint(false), 9000);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(hide);
    };
  }, [ready, play]);

  const toggleSound = () => {
    const next = !sound;
    // Set it inside the tap itself, which is what lets the browser play audio.
    if (videoRef.current) videoRef.current.muted = !next;
    setSound(next);
    setSoundHint(false);
  };

  // Canvas sizing.
  useEffect(() => {
    const el = frameRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const c = canvasRef.current!;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The render loop.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let fps = 60;
    let ui = { chapter: -1, stopped: false, cue: "", cards: false, titleOut: false };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

      if (playingRef.current) {
        tRef.current += dt;
        if (tRef.current >= duration) {
          tRef.current = duration;
          playingRef.current = false;
          endedRef.current = true;
          setEnded(true);
        }
      }
      const t = tRef.current;
      const st = filmStateAt(t);
      const v = videoRef.current!;

      // Keep the decoder on the frame the film wants. While running it just
      // plays (never slower than 0.35×, which would judder); only a stop
      // pauses it and snaps to the exact frame.
      let drift = 0;
      if (v.readyState >= 2) {
        const target = Math.min(st.video, FOOTAGE.end);
        drift = v.currentTime - target;
        if (!playingRef.current || st.stopped) {
          if (!v.paused) v.pause();
          if (Math.abs(drift) > 0.02 && !v.seeking) v.currentTime = target;
        } else {
          const rate = Math.max(0.35, RUN_RATE * st.speed);
          if (Math.abs(v.playbackRate - rate) > 0.02) v.playbackRate = rate;
          if (v.paused) void v.play().catch(() => {});
          if (Math.abs(drift) > 0.25 && !v.seeking) v.currentTime = target;
        }
        if (lensRef.current && (frameDirty.current || !v.paused)) {
          lensRef.current.upload(v);
          frameDirty.current = false;
        }
      }

      visionRef.current += (visionTarget.current - visionRef.current) * Math.min(1, dt * 5);
      const look = lensAt(t, st, endedRef.current);
      const intro = !playingRef.current && t === 0 && !endedRef.current;
      const T = now / 1000;
      const params: LensParams = {
        blur: intro ? 0.55 : look.blur,
        whip: look.whip,
        night: look.night,
        zoom: intro ? 1.04 : look.zoom,
        time: T,
        vision: visionRef.current,
        dim: intro ? 0.2 : 0,
        // A held camera never sits perfectly still.
        shift: [
          look.hold * (0.0045 * Math.sin(T * 0.55) + 0.0015 * Math.sin(T * 1.9)),
          look.hold * (0.0035 * Math.sin(T * 0.8 + 1.3) + 0.001 * Math.sin(T * 2.3)),
        ],
      };
      lensRef.current?.render(params);

      // Pin line from a point in the scene to the cards.
      const frame = frameRef.current;
      const pin = pinRef.current;
      if (frame && pin) {
        const fr = frame.getBoundingClientRect();
        const cr = cardsRef.current?.getBoundingClientRect();
        const a = CHAPTERS[st.chapter].anchor;
        const p = footageToScreen(a.x - params.shift[0], a.y - params.shift[1], fr.width, fr.height, look.zoom);
        const dot = pin.querySelector("circle")!;
        const line = pin.querySelector("line")!;
        dot.setAttribute("cx", p.x.toFixed(1));
        dot.setAttribute("cy", p.y.toFixed(1));
        line.setAttribute("x1", p.x.toFixed(1));
        line.setAttribute("y1", p.y.toFixed(1));
        line.setAttribute("x2", (cr ? cr.left - fr.left : fr.width * 0.65).toFixed(1));
        line.setAttribute("y2", (cr ? cr.top - fr.top + 40 : fr.height * 0.24).toFixed(1));
      }

      // HUD readouts.
      if (hudTime.current) {
        const pad = (n: number) => String(n).padStart(2, "0");
        hudTime.current.textContent = `00:${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}:${pad(Math.floor((t % 1) * 24))}`;
      }
      if (hudBpm.current) {
        const effort = st.stopped ? Math.max(0, 1 - st.stoppedFor / 5) * 0.8 : Math.max(0.6, st.speed);
        hudBpm.current.textContent = String(Math.round(92 + 66 * effort + 3 * Math.sin(now / 400)));
      }
      if (hudBatt.current) hudBatt.current.textContent = `${Math.round(94 - (t / duration) * 9)}%`;

      if (dbgRef.current) {
        dbgRef.current.textContent = [
          `film t    ${t.toFixed(2)}s / ${duration.toFixed(1)}s`,
          `footage   ${st.video.toFixed(3)}s  (decoder ${v.currentTime.toFixed(3)}s)`,
          `drift     ${(drift * 1000).toFixed(0)} ms`,
          `decoder   ${v.paused ? "paused" : `${v.playbackRate.toFixed(2)}×`}  ${st.stopped ? "HOLD" : "RUN"}`,
          `lens      blur ${look.blur.toFixed(2)} whip ${look.whip.toFixed(2)} night ${look.night.toFixed(2)} zoom ${look.zoom.toFixed(3)}`,
          `fps       ${fps.toFixed(0)}`,
        ].join("\n");
      }
      if (dbgGraph.current) drawGraph(dbgGraph.current, t);

      const cue = st.cue && !endedRef.current ? `${st.cue.chapter}-${st.cue.line}` : "";
      const cards = st.stopped && !endedRef.current && st.stoppedFor > 0.2;
      const titleOut = t > 1.4 || endedRef.current;
      if (st.chapter !== ui.chapter || st.stopped !== ui.stopped || cue !== ui.cue || cards !== ui.cards || titleOut !== ui.titleOut) {
        ui = { chapter: st.chapter, stopped: st.stopped, cue, cards, titleOut };
        setView({ chapter: st.chapter, stopped: st.stopped, cueKey: cue, showCards: cards, titleOut });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  useEffect(() => {
    visionTarget.current = vision ? 1 : 0;
  }, [vision]);

  // Hidden keys for the curious: ←/→ jump stops, V dog vision, D director's view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable], .chat")) return;
      const st = filmStateAt(tRef.current);
      if (e.key === "ArrowRight") seekChapter(st.chapter + (st.stopped ? 1 : 0));
      else if (e.key === "ArrowLeft") seekChapter(st.chapter - 1);
      else if (e.key === "v") setVision((s) => !s);
      else if (e.key === "d") setDebug((s) => !s);
      else if (e.key === "m") document.querySelector<HTMLButtonElement>(".sound")?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seekChapter]);

  const chapter = CHAPTERS[view.chapter];
  const cue = view.cueKey ? TIMELINE.cues.find((q) => `${q.chapter}-${q.line}` === view.cueKey) ?? null : null;

  return (
    <div className="player">
      <div ref={frameRef} className="frame">
        <video ref={videoRef} className={`footage ${noGl ? "footage-plain" : ""}`} muted playsInline preload="auto" poster={FOOTAGE.poster} />
        <canvas ref={canvasRef} className={`lens ${ready ? "lens-on" : ""}`} />

        {/* GoPro HUD */}
        <div className={`hud ${started && !ended ? "hud-on" : ""}`} aria-hidden="true">
          <span className="hud-corner tl" />
          <span className="hud-corner tr" />
          <span className="hud-corner bl" />
          <span className="hud-corner br" />
          <div className="hud-top">
            <span className="hud-rec">● REC</span>
            <span className="hud-cam">BRUNO CAM 01</span>
            {vision && <span className="hud-vision">BRUNO-VISION</span>}
            <span className="hud-gap" />
            <span>
              ♥ <span ref={hudBpm}>120</span> BPM
            </span>
            <span className="hud-batt">
              <i /> <span ref={hudBatt}>94%</span>
            </span>
          </div>
          <div className="hud-bottom">
            <span ref={hudTime}>00:00:00:00</span>
            <span>GURGAON · DIWALI</span>
          </div>
        </div>

        {/* Sound: the footage's own audio, nothing else. */}
        <div className={`sound-wrap ${ready ? "sound-on" : ""}`}>
          {soundHint && !sound && (
            <button className="sound-hint" onClick={toggleSound}>
              Tap to listen with audio
            </button>
          )}
          <button
            className={`sound ${sound ? "is-on" : ""} ${soundHint && !sound ? "is-nudging" : ""}`}
            onClick={toggleSound}
            aria-label={sound ? "Mute" : "Unmute"}
            title={sound ? "Mute (M)" : "Unmute (M)"}
          >
            {sound ? (
              <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            ) : (
              <svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            )}
          </button>
        </div>

        {/* Pin from the scene to the cards */}
        <svg ref={pinRef} className={`pin ${view.showCards ? "pin-on" : ""}`} aria-hidden="true">
          <line />
          <circle r="5" />
        </svg>
        <div ref={cardsRef} className="cards-wrap">
          <CardStack key={chapter.id} cards={chapter.cards} visible={view.showCards} />
        </div>

        <div className="lines" aria-live="polite">
          {cue && <Line key={view.cueKey} cue={cue} />}
        </div>

        {/* Opening title: holds for two seconds, then lifts as Bruno sets off. */}
        <div className={`title ${view.titleOut ? "title-out" : ""} ${ready ? "title-in" : ""}`}>
          <p className="title-kicker">Shubham Saini · shot on Bruno's GoPro</p>
          <h1>Bruno's Human</h1>
          <p className="title-sub">A Diwali run home, and everything you should know about the guy waiting there.</p>
        </div>
        {!ready && <div className="loading" aria-label="Loading" />}

        {ended && <Finale onAsk={onAsk} onReplay={() => seekChapter(0)} />}

        {debug && (
          <div className="debug">
            <p className="debug-title">
              Director's view <span>D to close</span>
            </p>
            <pre ref={dbgRef} />
            <canvas ref={dbgGraph} width={300} height={110} />
            <p className="debug-note">Footage time against film time: flat steps are held frames, the curves are speed ramps. One WebGL2 pass does the lens.</p>
          </div>
        )}
      </div>
    </div>
  );
});

/** Director's view graph: footage seconds (y) against film seconds (x). */
const graphPoints = Array.from({ length: 240 }, (_, i) => {
  const t = (i / 239) * TIMELINE.duration;
  return { t, v: filmStateAt(t).video };
});

const drawGraph = (c: HTMLCanvasElement, t: number) => {
  const ctx = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const x = (tt: number) => 6 + (tt / TIMELINE.duration) * (w - 12);
  const y = (v: number) => h - 8 - (v / FOOTAGE.end) * (h - 16);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(242,182,91,0.12)";
  for (const ch of TIMELINE.chapters) ctx.fillRect(x(ch.stopStart), 0, x(ch.stopEnd) - x(ch.stopStart), h);
  ctx.strokeStyle = "#F2B65B";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  graphPoints.forEach((p, i) => (i ? ctx.lineTo(x(p.t), y(p.v)) : ctx.moveTo(x(p.t), y(p.v))));
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x(t), y(filmStateAt(t).video), 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText("footage", 8, 12);
  ctx.fillText("film →", w - 44, h - 2);
};

Player.displayName = "Player";
export default Player;
