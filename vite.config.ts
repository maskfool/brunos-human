import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { execFileSync } from "node:child_process";
import path from "path";

// Serves /api/chat inside `npm run dev` using the same handler that runs as a
// Vercel Edge Function in production. Reads ANTHROPIC_API_KEY from .env.local.
const localChatApi = (): Plugin => ({
  name: "local-chat-api",
  configureServer(server) {
    // Keep api/_profile.ts in step with api/shubham.md while developing.
    const regenerateProfile = () => {
      try {
        execFileSync("node", [path.resolve(__dirname, "scripts/gen-profile.mjs")], {
          stdio: "inherit",
        });
      } catch (err) {
        console.error("[local-chat-api] could not regenerate profile", err);
      }
    };
    regenerateProfile();
    server.watcher.add(path.resolve(__dirname, "api/shubham.md"));
    server.watcher.on("change", (file) => {
      if (file.endsWith("shubham.md")) regenerateProfile();
    });

    server.middlewares.use("/api/chat", async (req, res) => {
      try {
        const { handleChatRequest } = await import("./api/_core");
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const request = new Request("http://localhost/api/chat", {
          method: req.method,
          headers: { "content-type": "application/json" },
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        });
        const response = await handleChatRequest(request, req.socket.remoteAddress ?? "local");
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        if (response.body) {
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        }
        res.end();
      } catch (err) {
        console.error("[local-chat-api]", err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Local API error" }));
      }
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Make .env.local's ANTHROPIC_API_KEY visible to the dev middleware
  // (server-side only — never exposed to the client bundle).
  const env = loadEnv(mode, process.cwd(), "");
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

  return {
    server: {
      host: "::",
      port: 8092,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), localChatApi()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
