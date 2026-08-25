# KRD language pass — house rules

These are the rules applied when rewriting a KRD from engineering language into
product language. The mandated section structure never changes: every `Section`,
numbered heading and sub-heading stays exactly where it was, and Req IDs and test
IDs stay stable so engineering and QA references keep working.

## What changes

**Write the outcome, not the mechanism.** A requirement says what must be true for
a user, a PM or the business. How it is achieved belongs in §6 Tech Solutioning.

- Before: *"Apply turnBudgetMs/Budget.MaxLatency across model and tool work. On exhaustion, cancel in-flight work and return a typed budget error."*
- After: *"A time limit applies across all model and tool work in a turn. On exhaustion, stop the work where possible and return a clear timeout failure."*

**Internal names come out of the requirement text.** Field names, package names,
class names, HTTP mechanics and framework types are engineering vocabulary. Keep
them only where the name *is* the contract — §4 (API and Data Contracts), §6
(Tech Solutioning) and §7 (Logging).

- `default_config_id` → "the live pointer"
- `agent_variant` → "the agent code version"
- `seq` assigned by the API stream assembler → "position, assigned in one place as messages go out"
- `ErrorKind` → "a defined failure type"
- `amp` package → "the platform boundary"

**Name the parts in domain words.** "Sub-agent" → *specialist*. "Resource" →
*data source* / *read-only information*. "Graph" → *agent* or *flow*. "Session" →
*conversation*. "Hot store" → *live conversation cache*. "Idempotency: keyed" →
*safe to repeat with a key*.

**Say why, where the why is the point.** A guardrail a PM can't justify is a
guardrail that gets negotiated away. Two extra clauses buy that: *"a misbehaving
agent can never hang a user"*, *"a user's confirmed intent must not be lost to a
cache failure"*.

**Prose over pseudo-code.** ASCII flow diagrams and call-stack sketches become
numbered steps. Large JSON becomes a field table plus one short worked example
with a line saying what to read out of it.

**Logging as questions.** Each log record is titled with the question it answers
("what did this cost and how long did it take?"), then its fields. A PM can then
tell whether the log set is sufficient.

## What gets trimmed

- Requirements that restate a table elsewhere in the doc. Three retry-class rows
  collapse into one row plus a pointer to the retry table in §4.4.
- Test cases with identical expected results — merged into one case covering both
  paths, keeping the lower ID.
- Transport rows that are one decision, not three.

Nothing in scope is dropped. If a requirement is genuinely redundant it is merged,
never deleted, and the surviving row carries both behaviours.

## What never changes

Section structure and order. Req IDs and test IDs. Phase labels
(Launch / Next / Open / Target / Provisional / Deferred). Launch blockers. Metric
definitions and their numbers. Owners. Anything in Section IV.

## Files

| File | Source architecture doc | Source KRD |
| --- | --- | --- |
| `KRD_Agent_Composition_and_Runtime.md` | AMP Architecture, Part One — Composition & Runtime | `KRD_Agent_Composition_and_Runtime` (Drive) |
