# proto

A canvas for prototyping interfaces fast. Create nodes — each node is half chat, half window. The window renders the HTML that the chat prompts the model into producing. Fork a node to branch an idea and compare variants side by side.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000, paste your [OpenRouter](https://openrouter.ai/) API key into the top bar, and create a node.

## How it works

- Each node has its own model (defaults to `anthropic/claude-fable-5`) and its own chat history.
- Every reply is a full self-contained HTML document, rendered in a sandboxed iframe. Each turn fully replaces the previous render; the old render stays visible until the new one is ready.
- Forking copies the chat history and the last rendered artifact.
- The whole canvas (nodes, positions, chats, artifacts) and your API key persist in localStorage. The key is only sent to the server per-request and never stored there.

## Stack

Next.js (App Router) + Tailwind + [React Flow](https://reactflow.dev/) + OpenRouter.
