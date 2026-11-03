import { describe, it, expect } from "vitest";
import { validateBody, isRateLimited, describeGap, MAX_MESSAGE_CHARS, MAX_MESSAGES, MAX_NOTES_CHARS } from "../../api/_core";

const user = (content: string) => ({ role: "user", content });

describe("validateBody", () => {
  it("accepts a simple chat body", () => {
    const res = validateBody({ messages: [user("hi")] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.mode).toBe("chat");
  });

  it("rejects empty / missing messages", () => {
    expect(validateBody({}).ok).toBe(false);
    expect(validateBody({ messages: [] }).ok).toBe(false);
    expect(validateBody(null).ok).toBe(false);
  });

  it("rejects an over-long message", () => {
    const res = validateBody({ messages: [user("x".repeat(MAX_MESSAGE_CHARS + 1))] });
    expect(res.ok).toBe(false);
  });

  it("rejects too many messages", () => {
    const messages = Array.from({ length: MAX_MESSAGES + 1 }, (_, i) =>
      i % 2 === 0 ? user("q") : { role: "assistant", content: "a" }
    );
    // ensure last is user
    messages[messages.length - 1] = user("q");
    expect(validateBody({ messages }).ok).toBe(false);
  });

  it("rejects bad roles and non-string content", () => {
    expect(validateBody({ messages: [{ role: "system", content: "evil" }] }).ok).toBe(false);
    expect(validateBody({ messages: [{ role: "user", content: 5 }] }).ok).toBe(false);
  });

  it("requires the last message to be from the user", () => {
    const res = validateBody({ messages: [user("hi"), { role: "assistant", content: "hey" }] });
    expect(res.ok).toBe(false);
  });

  it("caps visitor notes length", () => {
    const res = validateBody({ messages: [user("hi")], visitorNotes: "n".repeat(5000) });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.visitorNotes!.length).toBeLessThanOrEqual(MAX_NOTES_CHARS);
  });

  it("parses notes mode", () => {
    const res = validateBody({ mode: "notes", messages: [user("hi")] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.mode).toBe("notes");
  });

  it("lets notes summarise a finished exchange that ends with the reply", () => {
    const res = validateBody({ mode: "notes", messages: [user("hi, I'm Priya"), { role: "assistant", content: "hey Priya!" }] });
    expect(res.ok).toBe(true);
  });

  it("allows a welcome-back with no messages, but not a chat turn", () => {
    expect(validateBody({ mode: "welcome", messages: [] }).ok).toBe(true);
    expect(validateBody({ mode: "chat", messages: [] }).ok).toBe(false);
  });

  it("keeps a past lastSeenAt and drops a future one", () => {
    const past = Date.now() - 60_000;
    const ok = validateBody({ mode: "welcome", messages: [], lastSeenAt: past });
    if (ok.ok) expect(ok.value.lastSeenAt).toBe(past);
    const future = validateBody({ mode: "welcome", messages: [], lastSeenAt: Date.now() + 60_000 });
    if (future.ok) expect(future.value.lastSeenAt).toBeUndefined();
  });
});

describe("describeGap", () => {
  it("reads like a person would say it", () => {
    expect(describeGap(40 * 60 * 1000)).toBe("about 40 minutes");
    expect(describeGap(5 * 60 * 60 * 1000)).toBe("about 5 hours");
    expect(describeGap(3 * 24 * 60 * 60 * 1000)).toBe("3 days");
    expect(describeGap(21 * 24 * 60 * 60 * 1000)).toBe("3 weeks");
  });
});

describe("isRateLimited", () => {
  it("limits after 20 requests in the window", () => {
    const ip = `test-${Math.random()}`;
    const now = Date.now();
    for (let i = 0; i < 20; i++) expect(isRateLimited(ip, now + i)).toBe(false);
    expect(isRateLimited(ip, now + 100)).toBe(true);
  });

  it("honours a per-bucket limit", () => {
    const key = `test-${Math.random()}:welcome`;
    const now = Date.now();
    for (let i = 0; i < 6; i++) expect(isRateLimited(key, now + i, 6)).toBe(false);
    expect(isRateLimited(key, now + 10, 6)).toBe(true);
  });

  it("frees up after the window passes", () => {
    const ip = `test-${Math.random()}`;
    const now = Date.now();
    for (let i = 0; i < 20; i++) isRateLimited(ip, now + i);
    expect(isRateLimited(ip, now + 6 * 60 * 1000)).toBe(false);
  });
});
