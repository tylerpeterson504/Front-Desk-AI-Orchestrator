# Qwen3-32B Chat Demo (Static Space)

Browser-side chat with [Qwen/Qwen3-32B](https://huggingface.co/Qwen/Qwen3-32B) via the
Hugging Face Inference API (`router.huggingface.co/v1/chat/completions`, SSE streaming).

No backend, no build step — the Space is a single `index.html`.

**Visitors provide their own HF token** (enter it at the top; it is stored in
`localStorage` in their browser and sent only to the Inference API).

Deployed at: https://huggingface.co/spaces/Nolaboy299/qwen3-32b-chat
