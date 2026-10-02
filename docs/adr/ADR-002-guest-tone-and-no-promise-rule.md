# ADR 002: Guest response tone and no-promise template rule

## Status

Accepted (2026-09-24)

## Context

Front desk agents send guest messages from templates. The product rules:

- Default template responses use a professional tone.
- Agents can switch the tone of a message (the dashboard exposes a
  tone selector) before sending.
- Templates must never promise a follow-up or guarantee request
  fulfillment unless the agent explicitly chooses that wording.

## Decision

1. Tone is a per-message property selected by the agent at send time.
   The professional tone is the default; the agent's explicit choice
   overrides it for that message only.
2. No template shipped in the codebase or seeded in the database may
   contain wording that promises a follow-up or guarantees that a request
   will be fulfilled (for example "we will fix this today" or "consider it
   done"). Acceptable alternatives state the action taken without a
   commitment: "I have shared this with our maintenance team", "I have
   logged your request".
3. This is a content rule enforced at template creation and review time.
   It is not enforced in code in this pass; a validation pass over the
   template service is a follow-up.

## Consequences

- Template authors need a checklist when adding or editing templates.
- Automated linting of template content (a service-level check for
  promise phrases) is a candidate follow-up task.
