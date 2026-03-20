# MCPXplore

> **Don't like something? Fork it and fix it.** This repo is public — you're free to take it, change it, and make it yours.

## Disclaimer

- This is a **hobby project** built to scratch a personal itch. Nothing more.
- I will add whatever features **I** want. Feature requests from others will be dismissed.
- Bugs will probably go unsolved.
- Help requests or questions will most likely go ignored.
- This entire codebase was written by **Claude 4.6** and **Cursor's Composer 2**. Not a single line of code was written or even read by a human. Don't try to make sense of it. I'm honestly surprised it works.

If any of that bothers you, see the line at the top about forking.

---

## What is this?

MCPXplore is a desktop utility built to **explore, debug, and troubleshoot MCP servers**. If you're building or integrating [Model Context Protocol](https://modelcontextprotocol.io/) servers and need a quick way to poke at their endpoints, this is what it's for.

The core idea: connect to one or more MCP servers, browse everything they expose (tools, resources, prompts), call tools by hand, run semantic search across tool catalogs, and — crucially — drop into a chat to see how different LLMs actually behave when given those tools. That last part matters because model behavior during tool selection and tool calling varies wildly between providers, and having a lightweight sandbox to compare them side by side saves a lot of guesswork.

## Features

- **Multi-server MCP management** — connect to any number of MCP servers (stdio or remote HTTP/SSE), reconnect on launch, and monitor connection status in real time.
- **Full MCP inspection** — list and call tools, read resources and resource templates, list and get prompts, view raw JSON, and browse call history.
- **LLM chat with tool use** — stream responses from OpenAI-compatible providers while the model calls MCP tools mid-conversation. Stop generation at any time.
- **Smart tool selection** — choose which tools the model sees: all tools, a manual pick list, semantic search (embedding similarity), or agentic mode (LLM-assisted tool discovery).
- **MongoDB integration** (optional) — sync discovered MCP tools into a collection, build search/vector indexes for smart tool selection, and persist chat history across sessions.
- **Multiple LLM & embedding providers** — configure OpenAI, Azure OpenAI, Fireworks, OpenRouter, Voyage, and more from the settings UI.
- **Capability change detection** — fingerprints server capabilities and reacts when tools, resources, or prompts change.
- **Cross-platform** — builds for macOS (dmg), Windows (nsis), and Linux (AppImage/deb).

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop framework | Electron 33 |
| Bundler | electron-vite + Vite 6 |
| UI | React 19, TypeScript, Tailwind CSS v4 |
| State management | Zustand |
| MCP | @modelcontextprotocol/sdk |
| LLM client | openai (OpenAI-compatible) |
| Database | MongoDB driver |
| Icons | lucide-react |
| Packaging | electron-builder |

## Getting Started

**Prerequisites:** A JavaScript runtime and package manager — [Bun](https://bun.sh/), Node.js + npm, Deno, whatever you prefer. The examples below use Bun but nothing here is Bun-specific.

```bash
# Install dependencies
bun install    # or: npm install

# Run in development mode (hot reload)
bun run dev    # or: npm run dev
```

## Building

```bash
# Production build (unpackaged)
bun run build

# Platform-specific installers
bun run build:mac
bun run build:win
bun run build:linux
```

Output goes to `dist/`.

## Architecture at a Glance

```
src/
├── main/        # Electron main process — MCP clients, LLM streaming, MongoDB, config & encryption
├── preload/     # Typed IPC bridge (contextBridge) — no raw ipcRenderer in the renderer
└── renderer/    # React UI — chat, MCP explorer, settings, Zustand stores
```

The main process manages MCP connections, streams LLM completions, and handles config persistence (API keys encrypted via Electron's safeStorage). The renderer talks to main exclusively through a typed IPC API exposed by the preload script. The renderer is fully sandboxed.

## License

Do whatever you want with it.
