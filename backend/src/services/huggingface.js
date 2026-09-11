// Hugging Face Inference client.
// Uses the OpenAI-compatible chat completions endpoint at router.huggingface.co,
// so no SDK dependency is needed — same shape as the Mistral client.
//
// The default model is Qwen/Qwen3-32B, matching the public Space demo
// (hf-space/) so the dashboard copilot and the Space behave the same way.
//
// Qwen3 models "think" by default: reasoning is streamed in
// `reasoning_content` and `content` stays null until the reasoning pass ends.
// For copilot drafting we disable thinking explicitly (fast, deterministic,
// text-only answers) and, as a belt-and-braces measure, strip any residual
// <think>…</think> block from the content.

const DEFAULT_TIMEOUT_MS = 30_000;
const MODEL_NAME = process.env.HUGGINGFACE_MODEL || 'Qwen/Qwen3-32B';
const BASE_URL = process.env.HUGGINGFACE_BASE_URL || 'https://router.huggingface.co';

function isConfigured() {
  return Boolean(String(process.env.HUGGINGFACE_TOKEN || '').trim());
}

// Some Qwen3 serving stacks ignore chat_template_kwargs and inline the
// reasoning into content wrapped in <think> tags. Remove it if present.
function stripThinking(text) {
  return String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function complete(messages, options = {}) {
  if (!isConfigured()) {
    const error = new Error('Hugging Face is not configured');
    error.code = 'HUGGINGFACE_NOT_CONFIGURED';
    throw error;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    const error = new Error('Messages are required');
    error.code = 'INVALID_MESSAGES';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    // vLLM-based serving stacks ignore chat_template_kwargs; the /no_think
    // soft switch embedded in the system (or first) message is the reliable
    // way to suppress Qwen3's reasoning pass there.
    const disableThinking = !(options.enableThinking ?? false);
    const effectiveMessages = disableThinking && messages.length && messages[0].role === 'system'
      ? [{ ...messages[0], content: `${messages[0].content}\n\n/no_think`.trim() }, ...messages.slice(1)]
      : disableThinking && messages.length
        ? [{ role: 'system', content: '/no_think' }, ...messages]
        : messages;
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || MODEL_NAME,
        messages: effectiveMessages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens || 500,
        // Qwen3: turn off the reasoning pass so `content` carries the answer.
        // Some serving stacks (vLLM on Inference Providers) ignore
        // chat_template_kwargs, so we ALSO append the /no_think soft switch
        // to the system prompt — the officially supported fallback.
        chat_template_kwargs: { enable_thinking: options.enableThinking ?? false }
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`Hugging Face request failed with status ${response.status}`);
      error.code = 'HUGGINGFACE_REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const message = payload?.choices?.[0]?.message;
    // Prefer `content`; fall back to reasoning_content in case the server
    // still routed the whole answer through the thinking channel.
    const raw = (message?.content && String(message.content).trim())
      ? message.content
      : message?.reasoning_content || '';
    const text = stripThinking(raw);
    if (!text) {
      throw new Error('Empty Hugging Face response');
    }
    return { text, model: payload.model || options.model || MODEL_NAME };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { complete, isConfigured, MODEL_NAME };
