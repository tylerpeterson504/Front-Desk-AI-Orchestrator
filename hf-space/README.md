---
title: Qwen3-32B Chat Demo
emoji: 💬
colorFrom: indigo
colorTo: purple
sdk: static
pinned: false
---

# Qwen3-32B Chat Demo

A fully client-side chat demo for [Qwen/Qwen3-32B](https://huggingface.co/Qwen/Qwen3-32B),
streaming from Hugging Face **Inference Providers** (live via nscale / featherless-ai /
deepinfra). No backend, no GPU, no PRO plan needed — Static Spaces are free.

## How it works

- The page calls `https://router.huggingface.co/v1/chat/completions` directly from the
  browser with **the visitor's own token**, so inference is billed to their account
  (visitor-pays).
- Two sign-in options:
  1. **OAuth (implicit flow)** — add `?client_id=<your OAuth app id>` to the Space URL
     once; the app remembers it. Create an OAuth app at
     https://huggingface.co/settings/connected-applications with redirect URL set to the
     Space URL and scope `inference-api`.
  2. **Pasted token** — create a token at https://huggingface.co/settings/tokens with the
     "Make calls to Inference Providers" scope. It's kept in `sessionStorage`
     (tab-scoped, cleared on close).

## Files

- `index.html` — the whole demo (vanilla HTML/CSS/JS, streaming SSE, dark UI)
