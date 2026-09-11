# AI Voice Studio

A real-time voice AI assistant that runs **100% in the browser** — no server required. Bring your own API keys; they never leave your device.

## Features

- ??? **Real-time voice conversations** via Deepgram STT + Cartesia TTS
- ?? **Multiple LLM providers** — DeepSeek, OpenAI, Groq, OpenRouter, or custom endpoint
- ?? **Live visual workspace** — renders Mermaid diagrams and syntax-highlighted code blocks mid-conversation
- ?? **Markdown rendering** — the AI's responses render with full formatting in the chat
- ? **Custom personas** — save and reload your own system prompts
- ?? **Session timer** — configurable duration with live phase tracking
- ?? **BYOK** — API keys stored only in your browser's localStorage, never sent to any server

## Architecture

```
Browser
+-- Deepgram WebSocket  ? microphone audio ? live transcription
+-- Cartesia WebSocket  ? text chunks ? streamed TTS audio
+-- LLM fetch()         ? chat completions (streaming)
```

Everything is client-side. The optional `functions/` folder contains a Cloudflare Pages Function for persisting session history to a D1 database — but the app works fine without it (falls back to localStorage).

## Project Structure

```
ai-voice/
+-- client/
¦   +-- index.html      — full UI (setup, session, end screens + modals)
¦   +-- app.js          — all application logic
¦   +-- styles.css      — styling
+-- functions/
¦   +-- api/sessions/   — optional Cloudflare Pages Function (D1 session history)
+-- schema.sql          — D1 database schema (only needed if using Workers)
+-- wrangler.toml       — Cloudflare Pages deploy config
+-- .env.example        — reference for which keys you need
```

## Running Locally

```bash
python -m http.server 3000 --directory client
# then open http://localhost:3000
```

## Deploying to Cloudflare Pages

1. Push this repo to GitHub
2. In Cloudflare Pages, create a new project and connect your repo
3. Set **Build output directory** to `client`
4. Deploy — done. No build step needed.

## API Keys Required

Get these and enter them in the app Settings panel (??):

| Service | Get key at | Used for |
|---|---|---|
| Deepgram | console.deepgram.com | Speech-to-text |
| Cartesia | play.cartesia.ai | Text-to-speech |
| DeepSeek | platform.deepseek.com | LLM (recommended) |

Keys are saved to localStorage in your browser. They are never sent to any server.
