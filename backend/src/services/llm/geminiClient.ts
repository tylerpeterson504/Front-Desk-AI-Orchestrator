// Google Gemini chat completions client.
// Uses the official @google/generative-ai SDK.

import { GoogleGenerativeAI } from '@google/generative-ai';

import type { LLMResult } from './perplexityClient';

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

let _model: ReturnType<typeof GoogleGenerativeAI.prototype.getGenerativeModel> | null = null;

function getModel() {
  if (_model) return _model;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  _model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL_NAME });
  return _model;
}

export function isConfigured(): boolean {
  return Boolean(String(process.env.GOOGLE_API_KEY || '').trim());
}

export async function complete(prompt: string): Promise<LLMResult> {
  const model = getModel();
  if (!model) {
    const error = new Error('Gemini is not configured');
    error.code = 'GEMINI_NOT_CONFIGURED';
    throw error;
  }

  const result = await model.generateContent(prompt);
  const text = result?.response?.text?.();
  if (!text || !text.trim()) {
    throw new Error('Empty Gemini response');
  }
  return { text: text.trim(), model: MODEL_NAME };
}

export { MODEL_NAME };
