// Vercel Edge Function: POST /api/chat
// Set ANTHROPIC_API_KEY in the Vercel project's environment variables.

import { handleChatRequest } from "./_core";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const ip =
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  return handleChatRequest(req, ip);
}
