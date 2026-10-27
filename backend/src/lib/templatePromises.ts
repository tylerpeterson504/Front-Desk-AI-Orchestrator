/**
 * No-promise template rule (see docs/adr/ADR-002-guest-tone-and-no-promise-rule.md).
 *
 * Templates must never promise a follow-up or guarantee that a request will
 * be fulfilled unless the agent explicitly chooses that wording at send time.
 * This module detects promise-style content so the template service can
 * reject it at create/update time.
 */

// Each entry matches a phrasing family that commits the hotel to an outcome
// or a timeline. Patterns are case-insensitive.
const PROMISE_PATTERNS: RegExp[] = [
  /\b(?:we|i|you)(?:\s+will|'ll|\s+are\s+going\s+to|\s+am\s+going\s+to)\s+(?:fix|repair|resolve|replace|take\s+care\s+of|address|handle|follow\s+up|get\s+back\s+to|reach\s+back\s+out|check\s+back)\b/i,
  /\b(?:we|i|you)(?:\s+will|'ll|\s+are\s+going\s+to|\s+am\s+going\s+to)\s+(?:send|bring|deliver|provide)\s+(?:it|this|one|a\s+\w+|the\s+\w+)\s+(?:right\s+)?(?:up|over|out)?\s*(?:shortly|immediately|right\s+away|soon|asap)?\b/i,
  /\b(?:our|the)\s+(?:team|staff|housekeeping|maintenance)\b[^.]{0,200}\b(?:is\s+going\s+to|will)\s+(?:fix|repair|resolve|replace|take\s+care\s+of|address|handle)\b[^.]{0,200}\b(?:today|tomorrow|tonight|immediately|right\s+away|shortly|soon|by\s+the\s+end\s+of\s+the\s+(?:day|shift))\b/i,
  /\b(?:consider\s+it\s+done|it'?s\s+as\s+good\s+as\s+done|done\s+deal|rest\s+assured)\b/i,
  /\b(?:guarantee|guaranteed)\b/i,
  /\bwill\s+be\s+(?:fixed|repaired|resolved|replaced|ready|completed|taken\s+care\s+of)\s+(?:today|tomorrow|tonight|immediately|right\s+away|by\s+the\s+end\s+of\s+the\s+(?:day|shift)|by\s+\d(?::\d+)?(?:\s*(?:am|pm))?)\b/i,
  /\byour\s+\w+\s+(?:will|would|'ll)\s+be\s+(?:ready|available|resolved|fixed)\b/i,
  /\broom\s+will\s+be\s+ready\b/i,
  /\bwe(?:\s+will|'ll)\s+update\s+you\s+(?:shortly|soon|today|later)\b/i,
  /\bcall\s+you\s+back\b/i,
  /\blook\s+into\s+(?:it|this|that)\s+(?:today|now|right\s+away)\b/i
];

export interface PromiseCheckResult {
  hasPromise: boolean;
  matchedPattern?: string;
}

/**
 * Check template content for promise-style wording.
 * Returns a plain result object so callers decide how to react; the service
 * turns this into a ValidationError.
 */
export function findTemplatePromises(content: string): PromiseCheckResult {
  if (typeof content !== 'string' || !content) {
    return { hasPromise: false };
  }

  const normalized = content.replace(/[\u2018\u2019]/g, "'");
  for (const pattern of PROMISE_PATTERNS) {
    if (pattern.test(normalized)) {
      return { hasPromise: true, matchedPattern: pattern.source };
    }
  }

  return { hasPromise: false };
}
