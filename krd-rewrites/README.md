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
| `KRD_Short_Term_Memory.md` | AMP Architecture, Part Two A — Memory | `KRD_Short_Term_Memory` (Drive) |
| `KRD_Eval_Platform.md` | AMP Architecture, Part Three — Evaluation | `KRD_Eval_Platform` (Drive) |

## Rules learned on later passes

**Infrastructure design belongs in §6, not §3.** An infrastructure-heavy KRD will
try to put key layouts, storage primitives and field lists into Functional
Requirements. Those are real contracts, but they are §4 and §6 contracts. A
requirement row says what must be true — "everything for one conversation is
stored together, so a multi-part update stays all-or-nothing" — and points at the
section that carries the layout. That way the PM can defend the guarantee and the
engineer still has the spec.

**Surface real contradictions, don't smooth them.** Where a KRD contradicts
another KRD, say so in the blocker row, in both documents, naming what each one
claims and why they cannot both be true. Simplifying language must never soften a
blocker into an open question.

**A vendor's name is not a requirement.** An adopted-platform KRD will name the
vendor and its component stores in every other requirement row. Name it once,
where the decision is made (§6.1) and where the layout is the contract (§4). A
requirement row says what must be true — "one tenant's query never scans
another's data" — not which product provides it. The exception is a requirement
*about* the vendor relationship, like "forking the core is prohibited", where the
constraint is the point.

**State what the requirement is protecting against.** A guardrail whose reason is
missing gets negotiated away. "A dropped span raises an alert" is a nag; "a
dropped span silently removes a case from a report, so a release decision gets
made on incomplete data" is a rule someone will defend. One clause is usually
enough.

**Name a cross-KRD dependency where it actually bites.** Where a KRD's headline
metric is defined by work owned in another KRD, say so in the blockers table and
in the summary. A gate that depends on someone else's change classification is
worth stating plainly, not leaving as one row among twenty-five.
