// LLM drafting service: Google AI (Gemini) via the official SDK.
//
// Key is read from GOOGLE_API_KEY (server-side only — never shipped to the
// extension or dashboard). Falls back to a null model when the key is absent
// so tests and local dev without a key still run the template path.

const { GoogleGenerativeAI } = require('@google/generative-ai');
const perplexity = require('./perplexity');

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

let _model = null;
function getModel() {
  if (_model) return _model;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  _model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL_NAME });
  return _model;
}

function buildPrompt({ property, guestInfo, chatContext, templates, tone }) {
  const lines = [];
  lines.push('You are a hotel front-desk assistant drafting a reply to a guest in a messaging chat.');
  lines.push('Rules:');
  lines.push('- Reply with ONLY the message text to send to the guest. No preamble, no quotes, no explanations.');
  lines.push('- Keep it short (2-5 sentences), warm, and concrete.');
  lines.push('- Use ONLY the facts in the provided context. If a fact is unknown, answer generically or point to the front desk — never invent prices, times, or policies.');
  lines.push(`- Tone: ${tone === 'friendly' ? 'friendly and welcoming, still professional' : 'professional, formal, courteous'}.`);
  lines.push('- If selected templates are provided, incorporate their substance faithfully.');

  lines.push('');
  lines.push('## Property');
  if (property) {
    lines.push(`Name: ${property.name || 'unknown'}`);
    if (property.checkout_time) lines.push(`Checkout time: ${property.checkout_time}`);
    if (property.tone_guidelines) lines.push(`Tone guidelines: ${property.tone_guidelines}`);
    if (property.wifi_ssid) lines.push(`WiFi network name: ${property.wifi_ssid} (never include the WiFi password in a chat reply)`);
  } else {
    lines.push('Unknown');
  }

  lines.push('');
  lines.push('## Guest / reservation');
  if (guestInfo && Object.values(guestInfo).some(Boolean)) {
    for (const [k, v] of Object.entries(guestInfo)) {
      if (v) lines.push(`${k}: ${v}`);
    }
  } else {
    lines.push('No reservation data captured.');
  }

  lines.push('');
  lines.push('## Recent chat');
  const msgs = (chatContext && chatContext.messages) || [];
  if (msgs.length) {
    for (const m of msgs.slice(-10)) {
      lines.push(`${m.sender || 'Guest'}: ${m.text}`);
    }
  } else {
    lines.push('No chat history captured.');
  }

  lines.push('');
  lines.push('## Selected templates (staff-approved base content)');
  if (templates && templates.length) {
    for (const t of templates) {
      lines.push(`- [${t.name}] ${t.content}`);
    }
  } else {
    lines.push('None selected.');
  }

  lines.push('');
  lines.push('Draft the reply now.');
  return lines.join('\n');
}

async function draftGuestReply({ property, guestInfo, chatContext, templates, tone }) {
  const prompt = buildPrompt({ property, guestInfo, chatContext, templates, tone });

  if (perplexity.isConfigured()) {
    const result = await perplexity.complete([
      { role: 'system', content: 'You are a hotel front-desk assistant. Reply only with the guest-facing message, without citations or markdown.' },
      { role: 'user', content: prompt }
    ]);
    return result.text;
  }

  const model = getModel();
  if (!model) {
    const err = new Error('LLM not configured (PERPLEXITY_API_KEY or GOOGLE_API_KEY missing)');
    err.code = 'LLM_NOT_CONFIGURED';
    throw err;
  }
  const result = await model.generateContent(prompt);
  const text = result?.response?.text?.();
  if (!text || !text.trim()) {
    throw new Error('Empty LLM response');
  }
  return text.trim();
}

module.exports = { draftGuestReply, buildPrompt, MODEL_NAME };
