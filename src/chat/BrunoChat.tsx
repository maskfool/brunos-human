import { useEffect, useRef, useState, type ReactNode } from "react";
import { EMAIL } from "@/film/script";

// "Ask Bruno": the chat drawer. Same agent plumbing as the macOS portfolio's
// Messages app (streamed replies paced like texting, per-visitor memory), with
// Bruno as the persona and a mic button so you can just talk to him.

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  at?: number;
}

const HISTORY_KEY = "bruno-chat-history";
const NOTES_KEY = "bruno-chat-notes";
const MAX_INPUT_CHARS = 1000;
// Keep requests small: the visitor-notes memory covers older context.
const CONTEXT_WINDOW = 20;
// A gap this long counts as a new visit and earns a welcome-back.
const NEW_VISIT_GAP_MS = 30 * 60 * 1000;
// Mirrors RESET_MARKER in api/_core.ts: drop whatever was streamed before it.
const RESET_MARKER = "\u001e";

const GREETING =
  "Woof! 🐾 Bruno here. Well, AI Bruno.\n\nAsk me anything about my human: his work, his AI projects, whether he's open to new roles. I know everything about him.";

const SUGGESTIONS = [
  "What's his best AI project?",
  "Is he open to new roles?",
  "How did he get into AI?",
  "What's his tech stack?",
];

// localStorage can throw (private mode, blocked storage); the chat still works without it.
const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch { /* not persisted, that's fine */ }
  },
  remove: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch { /* nothing to clear */ }
  },
};

const freshChat = (): ChatMessage[] => [{ role: "assistant", content: GREETING, at: Date.now() }];

const loadHistory = (): ChatMessage[] => {
  try {
    const parsed = JSON.parse(storage.get(HISTORY_KEY) ?? "null");
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(
        (m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim()
      );
      if (valid.length > 0) return valid;
    }
  } catch { /* corrupted storage → fresh chat */ }
  return freshChat();
};

const toApi = (messages: ChatMessage[]) =>
  messages.filter((m) => m.content.trim()).map(({ role, content }) => ({ role, content }));

/** A reply is sent as separate bubbles, split on blank lines. */
const toBubbles = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const typingPause = (bubble: string) => Math.min(1600, Math.max(500, 300 + bubble.length * 18));

/** Plays a streamed reply back bubble by bubble, like someone texting. */
const playReply = async (
  body: ReadableStream<Uint8Array>,
  show: (text: string, more: boolean) => void,
  signal: AbortSignal
): Promise<string> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let finished = false;
  let failure: unknown = null;
  let wake = null as (() => void) | null;

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        wake?.();
      }
    } catch (e) {
      failure = e;
    } finally {
      finished = true;
      wake?.();
    }
  })();

  let shown = 0;
  let resets = 0;
  for (;;) {
    if (signal.aborted) return "";
    const resetCount = raw.split(RESET_MARKER).length - 1;
    if (resetCount !== resets) {
      resets = resetCount;
      shown = 0;
    }
    const bubbles = toBubbles(raw.slice(raw.lastIndexOf(RESET_MARKER) + 1));
    const ready = finished ? bubbles.length : Math.max(0, bubbles.length - 1);
    if (shown < ready) {
      if (shown > 0) await sleep(typingPause(bubbles[shown]));
      if (signal.aborted) return "";
      shown += 1;
      show(bubbles.slice(0, shown).join("\n\n"), !(finished && shown === bubbles.length));
      continue;
    }
    if (finished) {
      if (failure) throw failure;
      return bubbles.join("\n\n");
    }
    await new Promise<void>((resolve) => (wake = resolve));
    wake = null;
  }
};

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+)/g;

const renderInline = (text: string): ReactNode[] =>
  text.split(INLINE_TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("http"))
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    if (part.includes("@") && !part.includes(" "))
      return (
        <a key={i} href={`mailto:${part}`}>
          {part}
        </a>
      );
    return part;
  });

// Speech-to-text, where the browser has it (Chrome, Edge, Safari).
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
const RecognitionCtor = (): (new () => Recognition) | null => {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => Recognition) | null;
};

export const BrunoFace = ({ size = 36 }: { size?: number }) => (
  <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
    <circle cx="32" cy="32" r="32" fill="#F6DFAE" />
    <path d="M14 22 C8 26 7 40 12 46 C16 49 20 44 20 38 Z" fill="#C68A44" />
    <path d="M50 22 C56 26 57 40 52 46 C48 49 44 44 44 38 Z" fill="#C68A44" />
    <ellipse cx="32" cy="34" rx="18" ry="19" fill="#EBBE7A" />
    <ellipse cx="32" cy="44" rx="10" ry="8" fill="#F4D7A2" />
    <circle cx="25" cy="31" r="2.6" fill="#2B1C14" />
    <circle cx="39" cy="31" r="2.6" fill="#2B1C14" />
    <ellipse cx="32" cy="40" rx="4.4" ry="3.2" fill="#3A2820" />
    <path d="M29 47 Q32 54 35 47 Z" fill="#E86A7C" />
  </svg>
);

const BrunoChat = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Bumped on every reply and on "clear", so late responses can tell they're stale.
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const memoryEpochRef = useRef(0);
  const memoryQueueRef = useRef<Promise<void>>(Promise.resolve());
  const welcomedRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const canListen = typeof window !== "undefined" && !!RecognitionCtor();

  useEffect(() => {
    storage.set(HISTORY_KEY, JSON.stringify(messages.slice(-60)));
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing, open]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 250);
    else recRef.current?.stop();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Visitor memory: after each exchange, fold it into short notes about who
  // this visitor is. Updates run one at a time so a slow one can't clobber newer notes.
  const rememberExchange = (history: ChatMessage[]) => {
    const epoch = memoryEpochRef.current;
    memoryQueueRef.current = memoryQueueRef.current.then(async () => {
      if (memoryEpochRef.current !== epoch) return;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "notes", messages: toApi(history.slice(-10)), visitorNotes: storage.get(NOTES_KEY) ?? "" }),
        });
        const data = res.ok ? await res.json() : null;
        if (memoryEpochRef.current === epoch && typeof data?.notes === "string") storage.set(NOTES_KEY, data.notes);
      } catch { /* memory is optional */ }
    });
  };

  const runReply = async (payload: Record<string, unknown>, { quiet = false, onDone }: { quiet?: boolean; onDone?: (reply: string) => void }) => {
    const run = ++runRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    let started = false;
    window.setTimeout(() => runRef.current === run && !started && setTyping(true), 350);

    const show = (text: string, more: boolean) => {
      if (runRef.current !== run) return;
      const first = !started;
      started = true;
      setTyping(more);
      setMessages((prev) =>
        first
          ? [...prev, { role: "assistant", content: text, at: Date.now() }]
          : [...prev.slice(0, -1), { ...prev[prev.length - 1], content: text }]
      );
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "request failed");
      }
      const reply = await playReply(res.body, show, controller.signal);
      if (!reply) throw new Error("empty reply");
      if (runRef.current === run) onDone?.(reply);
    } catch (e) {
      if (controller.signal.aborted || runRef.current !== run || quiet || started) return;
      const msg =
        e instanceof Error && e.message.includes("Slow down")
          ? e.message
          : `Ruff, I lost my train of thought 😅 Try again in a bit, or email my human: ${EMAIL}`;
      setMessages((prev) => [...prev, { role: "assistant", content: msg, at: Date.now() }]);
    } finally {
      if (runRef.current === run) {
        setBusy(false);
        setTyping(false);
        abortRef.current = null;
      }
    }
  };

  // Back after a while? Bruno says hi first.
  useEffect(() => {
    if (!open || welcomedRef.current) return;
    welcomedRef.current = true;
    const history = messagesRef.current;
    const lastAt = [...history].reverse().find((m) => m.at)?.at;
    if (!history.some((m) => m.role === "user") || !lastAt || Date.now() - lastAt < NEW_VISIT_GAP_MS) return;
    void runReply(
      { mode: "welcome", messages: toApi(history.slice(-6)), visitorNotes: storage.get(NOTES_KEY) ?? "", lastSeenAt: lastAt },
      { quiet: true }
    );
  }, [open]);

  const send = (text: string) => {
    const trimmed = text.trim().slice(0, MAX_INPUT_CHARS);
    if (!trimmed || busy) return;
    recRef.current?.stop();
    const history: ChatMessage[] = [...messages, { role: "user", content: trimmed, at: Date.now() }];
    setMessages(history);
    setInput("");
    inputRef.current?.focus();
    void runReply(
      { messages: toApi(history.slice(-CONTEXT_WINDOW)), visitorNotes: storage.get(NOTES_KEY) ?? "" },
      { onDone: (reply) => rememberExchange([...history, { role: "assistant", content: reply }]) }
    );
  };

  const clearChat = () => {
    runRef.current += 1;
    memoryEpochRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    storage.remove(HISTORY_KEY);
    storage.remove(NOTES_KEY);
    setBusy(false);
    setTyping(false);
    setMessages(freshChat());
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = RecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    const before = input ? `${input.trim()} ` : "";
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join("");
      setInput((before + said).slice(0, MAX_INPUT_CHARS));
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      inputRef.current?.focus();
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const bubbles = messages.flatMap((m, i) => toBubbles(m.content).map((text, j) => ({ key: `${i}-${j}`, role: m.role, text })));
  const showSuggestions = messages.length <= 1 && !busy;

  return (
    <>
      <div className={`chat-scrim ${open ? "on" : ""}`} onClick={onClose} />
      <aside className={`chat ${open ? "on" : ""}`} aria-label="Ask Bruno" aria-hidden={!open}>
        <header className="chat-head">
          <BrunoFace />
          <div className="chat-who">
            <p className="chat-name">Bruno</p>
            <p className="chat-status">{typing ? "typing…" : "Shubham's Labrador · AI · knows everything"}</p>
          </div>
          <button className="icon-btn" onClick={clearChat} title="Clear chat & forget me" aria-label="Clear chat and forget me">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close chat">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div ref={scrollRef} className="chat-log" aria-live="polite">
          {bubbles.map((b, k) => (
            <div key={b.key} className={`msg msg-${b.role} ${bubbles[k - 1]?.role === b.role ? "msg-joined" : ""}`}>
              <div className="msg-bubble">{renderInline(b.text)}</div>
            </div>
          ))}
          {typing && (
            <div className="msg msg-assistant">
              <div className="msg-bubble dots" aria-label="Bruno is typing">
                <span /><span /><span />
              </div>
            </div>
          )}
        </div>

        {showSuggestions && (
          <div className="chat-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}

        <div className="chat-input">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={MAX_INPUT_CHARS}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={listening ? "Listening… just talk" : "Ask Bruno about Shubham…"}
          />
          {canListen && (
            <button className={`mic ${listening ? "mic-on" : ""}`} onClick={toggleMic} aria-label={listening ? "Stop listening" : "Speak your question"} title="Speak instead of typing">
              <svg viewBox="0 0 24 24" width="18" height="18"><rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          )}
          <button className="send" onClick={() => send(input)} disabled={!input.trim() || busy} aria-label="Send">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        <p className="chat-foot">AI dog, real facts: answers come only from Shubham's own profile.</p>
      </aside>
    </>
  );
};

export default BrunoChat;
