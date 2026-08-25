# KRD — Short-Term Memory

**Current Version:** v2 (language pass on v1 — no scope change)
**Current Status:** Under development
**Last Updated:** 25 August 2026
**POD:** Agentic Marketplace Platform
**Contributors:** PM: Ishan | Engineering: TBD | Architecture: TBD | Infrastructure: TBD | Security: TBD | Analytics: TBD | Vaani: TBD

---

# Section I: Executive Summary

## 1. Problem Statement

A user in the middle of a conversation does not repeat themselves. They say *"the second one"*, *"same address"*, *"under 1,500 now"* — and expect the agent to know what they mean and to apply the correction. That only works if the agent remembers the conversation so far.

**Short-Term Memory (STM)** is the platform capability that remembers an ongoing conversation. On every turn it loads the conversation once, gives each part of the agent exactly the slice of history it needs, runs the turn, and saves the completed exchange before the user gets their answer. Two things are kept: the **operational state** of the conversation — which one is active, which agent version it is pinned to, any paused turn — and the **conversation itself**, which is what the agent actually remembers.

Without this, every product rebuilds the same difficult parts on its own: what happens when the store is down, what happens when the user's phone retries a request that already succeeded, what happens when the conversation grows past what fits in a prompt. Those are not product problems. They are the same problem every time, and this KRD solves them once.

Three deliberate constraints. Memory lives in one fast store on the serving path, so a turn is never slowed down by durability work — the permanent copy is written afterwards, in the background. A conversation lives for six hours and then expires, which makes capacity predictable. And the conversation is only ever treated as *what the user said*, never as instructions the agent must obey — remembered text can carry a prompt injection, and it never gains authority by being remembered.

The current delivery is conversation memory. A generated summary follows in Phase 2. Facts, events, streaming and long-term memory are explicitly not in this KRD.

## 2. NSM — Success & Check Metrics

### Primary Success Metric

| Metric | Definition |
| :-: | :-: |
| **Next-turn continuity success rate** | Of the turns we told the caller were saved successfully, the percentage whose very next turn can read that complete exchange back. The bar is **100% in functional, concurrency and staging testing**; any deviation in production is an incident, not a statistic. |

### Secondary Metrics

| Metric | Definition |
| :-: | :-: |
| **Read latency** | Loading a conversation completes within **10 ms at p99** at target peak load. |
| **Write latency** | Saving a completed exchange completes within **10 ms at p99** at target peak load. |
| **Availability** | Reads and writes are available at least **99.9% of the month**. |
| **Retry correctness** | A repeat of a request that already completed returns the stored answer without re-running the agent, its tools, or the save. |
| **Concurrent turn preservation** | When two turns finish at once, both are kept, exactly once each. |
| **Node policy conformance** | Every part of the agent receives only the memory it was configured to receive, and never more than its token budget. |
| **Archive-before-expiry safety** | Every conversation is handed to permanent storage before its six hours run out, with the backlog and remaining time visible and alerted. |
| **Summary freshness (Phase 2)** | The summary keeps up with the conversation inside its configured window, and older work never overwrites newer. |
| **Vaani rollout adoption (Phase 3)** | The approved production population is using platform memory, applied only to new conversations, with a proven rollback to the previous configuration. |

### Guardrail Metrics

| Metric | Definition |
| :-: | :-: |
| **Duplicate or lost turns** | Zero duplicated turns, zero lost turns when two finish at once, zero half-saved turns. |
| **Degraded memory rate** | Turns that ran without memory, and turns whose memory was trimmed, stay under the product-agreed threshold and are always attributable to a specific cause. |
| **Fixed-expiry integrity** | Nothing — not a read, a write, a retry, a paused turn or a background job — extends the six-hour life of a conversation. |
| **No silent eviction** | The store never deletes an unexpired conversation to free space. Running out of room shows up as a visible write failure instead. |
| **Trust boundary** | Remembered conversation stays in the user's and agent's own voices, a generated summary stays labelled as generated, and neither ever becomes an instruction to the agent. |
| **Data isolation** | No conversation from another tenant, another user or another session is ever loaded, saved, replayed, summarised or archived. |
| **Diagnostic privacy** | What the user said never appears in a metric, a log or a trace. |
| **Serving latency** | Memory stays inside its own latency budget. Summary generation and archiving never run on the path the user is waiting on. |

---

# Section II: Product Requirement Document

## 1. User Stories and Capabilities

| Story ID | Persona | As a... | I want to... | So that I can... | Current Pain Point | Impact / Value if Solved |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| US-001 | End User | user in a multi-turn journey | Say "the second one" or "same address" and be understood | Get an answer without repeating myself | What I just said is often meaningless on its own | The conversation feels like a conversation |
| US-002 | End User | user changing my mind | Replace a budget, a choice or a constraint I gave earlier | Have my latest instruction be the one that counts | Old context can override what I just said | The agent keeps up with me |
| US-003 | Vaani Service | product caller | Send a conversation reference and get the answer back after memory is saved | Know the next turn will see this exchange | The answer and the history can drift apart | Predictable continuity |
| US-004 | Product Owner | tenant owner | Choose whether a memory outage degrades the answer or fails the request | Match that choice to how sensitive my journey is | One universal fallback is wrong for some products | The product owns its own degradation |
| US-005 | Product Engineer | agent configurator | Choose which memory each part of my agent receives | Avoid sending the whole conversation to everything | Full history costs tokens and distracts the model | Task-specific, cost-aware context |
| US-006 | Product Engineer | agent configurator | Set how memory is trimmed when it doesn't fit | Stay inside the model's context limit | Conversation length is unpredictable | Bounded, predictable input |
| US-007 | Runtime Engineer | runtime owner | Load the conversation once and hand out views of it | Keep every part of one turn on the same version of history | Separate reads produce mixed versions and repeated latency | Consistent execution |
| US-008 | Runtime Engineer | serving engineer | Replay a completed request instead of re-running it | Avoid charging twice and acting twice after a lost response | Network retries repeat completed work | Each request takes effect once |
| US-009 | Runtime Engineer | serving engineer | Save two overlapping turns without losing either | Keep both exchanges without re-running any tools | Simultaneous writes overwrite each other | Conflict-safe history |
| US-010 | Product Owner | product with long conversations | Turn on a background summary | Keep the gist of a long conversation without paying for it every turn | History grows with every turn | A smaller prompt on long journeys |
| US-011 | Data Platform | data owner | Receive batched conversation archives before they expire | Keep a durable, queryable record without slowing anyone down | Fast memory is deliberately short-lived | A permanent record |
| US-012 | Security Owner | security owner | Have remembered text treated as untrusted | Stop a prompt injection from gaining authority by being remembered | User text is replayed on every later turn | Safe memory reuse |
| US-013 | On-call Engineer | operator | See whether memory loaded, saved, degraded or was trimmed — without seeing content | Diagnose a memory problem quickly and privately | A successful answer can still hide a memory failure | Fast, privacy-safe diagnosis |
| US-014 | Incident Responder | incident owner | Replace a harmful pinned configuration mid-conversation | Stop bad behaviour without deleting anyone's conversation | Pinning keeps a bad release alive for hours | Audited containment |
| US-015 | Infrastructure Owner | capacity owner | Run memory at a known latency, availability and scale envelope | Support Vaani now and other products later | Conversation count grows across the whole six-hour window | Provisioned, measurable capacity |

## 2. Scope of Development

### 2.1 In Scope

1. The caller supplies the conversation reference. There is no separate "create a conversation" API.
2. Operational state and conversation memory kept as two separate records, stored together so they can be created and expire as one.
3. A six-hour fixed lifetime shared by both. Ordinary activity never extends it.
4. Creating a new conversation, or replacing an expired one, as a single all-or-nothing step — including pinning the agent version and code release.
5. One memory load per turn, and one fixed snapshot of it used to build each part of the agent's view.
6. An attempt to save the completed exchange before the answer is returned.
7. Keeping the user's words in their original language, the translated version where there is one, the complete answer, the request ID, its position in the conversation, and when it finished.
8. Recognising a repeated request, replaying the stored answer, recovering when a save's outcome is unknown, and saving two overlapping turns safely.
9. A required per-tenant choice for what happens when memory is unavailable: continue without it, or fail the request.
10. Telling the different failures apart: store error, conversation not found, half-present state, simultaneous-write conflict, summary failure, and memory that doesn't fit.
11. Per-node conversation selection: everything, the last N turns, or as many recent turns as fit a token budget.
12. A per-node token limit, an ordered list of trimming actions, and a final fallback of running with no memory at all.
13. History supplied in the original speakers' voices, a summary supplied as clearly labelled generated context, and authorisation for consequential actions enforced outside the model.
14. Paused turns stored against the conversation, and resuming them exactly once — subject to the cross-KRD alignment item in §8.
15. Audited emergency replacement of a harmful pinned configuration, using locally cached state so the turn path never has to call out.
16. Background archiving to permanent storage before expiry, in batches.
17. Phase 2: background summary generation with a configured trigger, durable background work, and protection against duplicate or out-of-order updates.
18. Full instrumentation, dashboards, alerts, runbooks, load testing, capacity planning and cost attribution.
19. An experiment-controlled Vaani rollout on new conversations only, with rollback to the previous configuration.

### 2.2 Out of Scope

1. Long-term memory, memory across conversations, user profiles, semantic search or embeddings.
2. Extracting facts and events. The contract leaves room for them; the current delivery is conversation plus summary only.
3. Generating a summary, facts or events *before* the answer goes out. The current delivery must reject that mode.
4. Anything about streaming: committing a streamed answer, delivery acknowledgement, interrupted playback, or replaying a stream.
5. Generating a *new* summary to make memory fit. Trimming may only use a summary that already exists.
6. A hard limit on conversation length, or rejecting a turn because the conversation is long.
7. A lifetime that extends with activity. Six hours absolute, from the start.
8. Each part of the agent reading the store for itself, or changing memory mid-turn for later parts.
9. Alternative storage shapes considered and not chosen (documented in §6.1).
10. A separate memory product outside this platform.
11. Analytics, evaluation or retention policy on the archive beyond the handoff contract and the launch integration.
12. The summary's model, prompt, threshold and quality bar, until the Phase 2 evaluation decision is made.

### 2.3 Phase Scope

| Phase | Included Capabilities | Explicitly Not Yet Included |
| :-: | :-: | :-: |
| **Phase 1 — 3 weeks** | The conversation foundation: storage, fixed lifetime, all-or-nothing conversation lifecycle, one load and one save per turn, availability policies, repeated-request handling, safe simultaneous saves, per-node selection, token limits, paused turns, emergency replacement, archiving, core tests. | Background summary; facts and events; streaming; the Vaani production rollout. |
| **Phase 2 — 2 weeks** | Background summary: token-threshold trigger, durable queue, worker, protection against duplicate and out-of-order updates, summary selection and trimming, and quality, freshness and adversarial evaluation. | Summary generated before the answer; facts and events; the Vaani production population. |
| **Phase 3 — 2 weeks** | Production readiness and Vaani adoption: dashboards, alerts, runbooks, load validation, Vaani configuration, experiment rollout, progressive expansion, proven rollback. | Facts and events, streaming, any further tenant rollout. |
| **Deferred / Open** | The contract keeps room for facts, events, summary-before-answer, streaming and alternative lifetimes. | Nothing is committed until there is a real product need and an evaluation gate. |

| Delivery Stage | Time Allocation | Total |
| :-: | :-: | :-: |
| **Conversation foundation** | 2d infra + 4d build + 3d developer testing + 3d staging + 3d review and hardening | 15 working days / 3 weeks |
| **Background summary** | 2d infra + 2d build + 2d testing and evaluation + 1d staging + 3d review and hardening | 10 working days / 2 weeks |
| **Production readiness and Vaani rollout** | 2d readiness + 1d build and config + 1d developer testing + 2d staging + 2d approval + 2d rollout | 10 working days / 2 weeks |

## 3. Functional Requirements

Each row is a requirement. **P1** is the conversation foundation, **P2** the background summary, **P3** production readiness and the Vaani rollout, **All** applies across every delivered phase, and **Deferred** means the contract leaves room for it but nothing is committed. Storage shapes, key layouts and field names live in §4 and §6, where they are the contract; the rows below state what must be true.

### 3.1 Session Lifecycle and Turn Path

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| SES-001 | The caller names the conversation | Every turn arrives with a conversation reference the caller generated. There is no separate API to create one first. | P1 |
| SES-002 | One active conversation per user | The platform knows which conversation is currently allowed to take turns for a given tenant and user. A different reference is treated as a new or expired conversation. | P1 |
| SES-003 | One load per turn | A turn makes a single logical load that fetches the operational state and its matching conversation memory together. | P1 |
| SES-004 | Load only what the turn needs | A normal turn reads the active conversation and its pinned configuration. A paused turn's saved state is loaded only when pausing or resuming actually needs it. | P1 |
| SES-005 | One fixed snapshot per turn | A successful load produces one snapshot that does not change for the rest of the turn. Later parts of the agent never see a background update land mid-turn. | P1 |
| SES-006 | Turn context is not memory | The current request, the effective configuration and the selected memory are combined into working context for this turn only. That combination is never stored as if the user had said it. | P1 |
| SES-007 | Starting a conversation is all-or-nothing | Creating a new conversation — or replacing an expired one — happens in one step that sets up both records, gives them the same expiry, and schedules the archive. It either fully happens or does not happen. | P1 |
| SES-008 | A replaced conversation stops taking turns | Once a newer conversation is active, the old one stays around to be archived and to expire, but accepts no new turns. | P1 |
| SES-009 | Finish the answer, then save it | The complete answer is finalised first, and what gets saved is exactly the text the caller receives. The save is attempted before the answer goes back. | P1 |
| SES-011 | Save the whole exchange or nothing | A save stores the user's words, the translation if there is one, the complete answer, the request ID, the turn's position and the completion time — as one unit. | P1 |
| SES-012 | The next turn can see it | During normal operation, a successful save is readable before the next turn loads memory. | P1 |
| SES-013 | Never a half-saved turn | The platform never stores an incomplete answer, a question with no answer, or an answer with no request identity. | P1 |
| SES-014 | Nothing reads the store directly | Parts of the agent receive memory through platform-built views. None of them reads the memory store itself. | P1 |
| SES-015 | Reading does not extend the clock | Loading memory, building views and running normally never refresh the conversation's expiry. | P1 |
| SES-016 | Blocking answers only, for now | The current delivery supports complete (non-streamed) text. Streaming and interrupted delivery stay switched off until there is a published contract for acknowledgement, ordering and retry. | All |

### 3.2 Redis State Model and Fixed TTL

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| RED-001 | One store on the serving path | The fast memory store is the only thing memory touches while the user is waiting. No database or archive work is added to the turn path. | P1 |
| RED-002 | Highly available, and proven so | Memory runs on a replicated cluster, sized and load-tested for the stated latency and availability targets. The durability boundary is the primary's acknowledgement. | P1 |
| RED-003 | Everything for one conversation is stored together | The operational state, the conversation memory and the archive schedule for one conversation are always co-located, so a multi-part update stays all-or-nothing even while the cluster is rebalancing. Key layout is in §4.4. | P1 |
| RED-006 | A stable, bounded grouping | Conversations are grouped by a deterministic function of tenant and user identity. The grouping is the platform's own — it is not a storage-shard identifier. | P1 |
| RED-008 | Six hours, fixed, shared | Both records are created with the same absolute expiry, six hours at launch. | P1 |
| RED-009 | Nothing extends it | Reads, saves, retries, paused turns, resumes, background updates and archive retries all preserve the original expiry. | All |
| RED-010 | What each record holds | Operational state holds the active conversation, the pinned agent version and code release, lifecycle times and any paused turns. Conversation memory holds the turn count, the conversation, the completed-request map and the versions of each derived representation. Fields are listed in §4.4 and §4.5. | P1 |
| RED-012 | The conversation is one value | The conversation is stored as a single ordered value, so adding a turn rewrites it. §6.1 records the accepted consequence and RED-019 the test that bounds it. | P1 |
| RED-013 | Derived memory stays out of the way | A summary — and any future derived representation — updates its own field and its own version, never overwriting the conversation or each other. | P2 |
| RED-014 | Length alone is never a rejection | A turn is never refused just because the conversation is long. Instead, conversation size and write latency are monitored. | P1 |
| RED-015 | Nothing is silently evicted | The store never deletes unexpired data to make room. Running out of capacity surfaces as a write failure and follows the tenant's availability policy. | P3 |
| RED-016 | Half a conversation is invalid | Finding only one of the two records for an active conversation is an invalid state. The platform retries, alerts and applies the tenant's policy. It must never pair half the state with empty memory or a fresh configuration. | P1 |
| RED-017 | The critical steps are all-or-nothing | Creating and replacing a conversation, saving with a version check, recording a completed request, moving a paused turn forward, preserving the expiry and scheduling the archive each happen as a single indivisible operation. | P1 |
| RED-018 | The chosen storage shapes | Launch uses the storage primitives named in §4.4. The alternatives considered and rejected are recorded in §6.1. | P1 |
| RED-019 | Prove it with real conversations | Performance tests must include realistically long conversations, to confirm that rewriting the conversation value still meets the write-latency target. | P3 |

### 3.3 Retry, Deduplication, and Concurrency

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| COR-001 | Every turn has a stable request ID | Each turn carries a request ID from the caller, and every retry of that same request reuses it. | P1 |
| COR-002 | Record that a request completed | A successful save records "this request ID produced this turn" as part of the same indivisible step. | P1 |
| COR-003 | Check before running anything | The load at the start of a turn checks whether this request already completed, before the agent runs. | P1 |
| COR-004 | Replay instead of re-running | If it did, the stored answer is returned. The agent, its tools, the summary trigger and the save are not run again. | P1 |
| COR-005 | When the save's outcome is unknown | Look up the request ID. If it is there, return the stored answer. If not, retry the same save within a bounded budget. | P1 |
| COR-006 | Turns are numbered in commit order | Each successful save takes the position it loaded, claims the next one, and stores it in the same indivisible step. | P1 |
| COR-007 | Losing a race rewrites only the memory | If another turn got there first, reload the current conversation, append the exchange that already completed, and retry only the write. | P1 |
| COR-008 | Never re-run the agent to resolve a race | The agent, its model calls, its tools and their real-world effects are never repeated just to settle a memory conflict. | P1 |
| COR-009 | Both overlapping turns survive | If two turns start from the same snapshot and both finish, both stay in the conversation, ordered by the order they were saved. | P1 |
| COR-010 | Two requests starting the same conversation | One wins and its pinned configuration is the one stored. The other reloads that stored configuration before the agent runs. | P1 |
| COR-011 | A failed step leaves no trace | A rejected or failed indivisible operation never leaves a half-written conversation, request record, paused turn or lifecycle change. | P1 |
| COR-012 | Every retry loop is bounded | Read retries, write retries, conflict retries, summary retries and archive retries each have an explicit limit and their own telemetry. | All |
| COR-013 | An unresolved conflict is a failure | A conflict still unresolved after the bounded retries is reported distinctly and alerted, and treated as a failed save — never as a quiet success. | P1 |
| COR-014 | Replay only lasts as long as the conversation | The guarantee that a repeated request replays holds only while the conversation is still alive within its six hours. | P1 |
| COR-015 | Tools must protect themselves too | Because a failed save can leave no record that the request completed, any tool that changes something real must use the request ID to make repeating it harmless. | P1 |
| COR-016 | Retries do not extend the clock | Looking up a request, retrying a save, rebasing after a conflict and replaying an answer all preserve the original expiry. | P1 |

### 3.4 Availability, Emergency Revocation, and Checkpoints

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| AVA-001 | Every tenant must choose | The behaviour when memory is unavailable is a required setting for every tenant using memory. There is no platform default and it is never inherited silently — the product must decide what it wants. | P1 |
| AVA-002 | Two allowed answers | Publishing accepts only *continue without memory* or *fail the request*. | P1 |
| AVA-003 | "Not found" and "broken" are different | Genuinely finding no conversation means it is new or expired. A store error or a half-read must never be mistaken for that. | P1 |
| AVA-004 | Retry the read first | Read failures are retried within a bounded budget before the tenant's policy is applied. | P1 |
| AVA-005 | What each policy does on a read failure | *Continue without memory*: run with just this turn's input, no history, and record that memory was unavailable. *Fail the request*: return a retriable error before the agent runs. | P1 |
| AVA-007 | Retry the save first | Save failures and unknown outcomes are retried within a bounded budget after the agent has run. | P1 |
| AVA-008 | What each policy does on a save failure | *Continue without memory*: return the completed answer, record that the save failed, and accept that later turns will not see this exchange. *Fail the request*: return a retriable error and do not report the answer as successful — the contract must state plainly that the agent and its tools may already have run. | P1 |
| AVA-010 | Vaani's choice | Vaani's rollout configuration continues without memory rather than failing the request. | P3 |
| AVA-011 | A degraded turn writes nothing | A turn that continued without memory after a read failure must not create, replace or partly write any conversation state. | P1 |
| AVA-012 | Half-present state raises an alert | Finding only one of the two records alerts an operator, as well as applying the tenant's policy. | P3 |
| AVA-013 | Check the pin against local state | Before the agent runs, the chosen configuration is checked against a locally cached list of withdrawn configurations. The turn path never calls the control plane to do this. | P1 |
| AVA-014 | Replace, don't delete | A withdrawn pinned configuration is replaced with its designated safe alternative. The conversation is not deleted and its expiry does not change. | P1 |
| AVA-015 | When the control plane is down | An instance with a valid cached list keeps using it. An instance with no valid list falls back to the platform's safe configuration and alerts. | P1 |
| AVA-016 | Emergency overrides are governed | Overrides are audited, retained for at least one conversation lifetime, usable even when the memory store is down, and mapped only to a configuration compatible with live conversation data. | P1 |
| AVA-017 | Save the pause before reporting it | A complete record of the paused turn is written before the caller is told the turn is paused. | P1 |
| AVA-018 | Resuming is one checked step | Resuming verifies the active conversation, the pause's state and the expected version, stores the accepted result, and rewrites the pause record — all in one step. | P1 |
| AVA-019 | Resume exactly once | A matching retry returns the recorded result. A conflicting result, or a stale version, is rejected. | P1 |
| AVA-020 | A pause cannot outlive its conversation | Pause updates preserve the fixed expiry, a pause cannot resume after the conversation expires, and starting a new conversation clears every pause from the old one. | P1 |
| AVA-021 | State the durability cost plainly | The design must document that a store failover can lose the most recent pause transition. This is why every tool that changes something real must be safe to repeat. | P1 |

### 3.5 Memory Representations and Lifecycle

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| REP-001 | The conversation is not optional | Conversation memory is attempted for every completed turn. It is not something a product switches on. | P1 |
| REP-002 | The summary is optional | The summary is an independent, optional representation arriving in Phase 2. No part of an agent may depend on it to run. | P2 |
| REP-003 | Facts and events are not promised | The contract reserves room for them, but they must not be claimed as current delivery until their extraction, quality and operational requirements are approved. | Deferred |
| REP-004 | Keep the user's own words | Every turn keeps the user's question in the language they said it in. | P1 |
| REP-005 | Keep the translation too | Where translation happened, the turn also keeps the translated question the agent actually saw. | P1 |
| REP-006 | Keep the complete answer | Every turn keeps the full answer text the caller received. | P1 |
| REP-007 | Keep the turn's identity | Every stored turn carries its position, its request ID and its completion time. | P1 |
| REP-008 | Each representation stands alone | The conversation and each derived representation occupy their own field with their own version. | P2 |
| REP-009 | Each derived representation knows how far it has read | Every derived representation records the latest turn it has processed. The summary exposes that point. | P2 |
| REP-010 | A missing optional value is not a failure | An enabled representation that doesn't exist yet, or is running late, is simply left out of the view. The turn continues. | P2 |
| REP-011 | Deriving never deletes | Creating a summary — or anything derived later — never deletes or compacts the stored conversation. | P2 |
| REP-012 | A generation failure keeps the old value | If generation fails, the previous value stands and the turn is recorded as running on degraded memory. A store outage is governed by the availability policy instead. | P2 |
| REP-013 | Deriving does not extend the clock | Creating or updating a derived representation never extends the conversation's life. | P2 |
| REP-014 | Background only, for now | The current delivery accepts a background summary only. Configuring it to generate before the answer fails publish validation. | P2 |
| REP-015 | What the platform owns | The shared contracts, the storage, versioning, all-or-nothing updates, publish validation, view construction, and enforcement of lifetime, token limits and safety. | All |
| REP-016 | What the product owns | Which optional representations are on, their triggers and limits, and what memory each part of its agent receives. | All |

### 3.6 Node Memory Policies and Selection

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| SEL-001 | Two levels of configuration | The conversation level decides what memory is *produced*; each part of the agent decides what it *receives*. Something is produced once and then shaped differently for each consumer. | All |
| SEL-002 | Nothing gets memory by default | A part of the agent with no memory settings receives no memory. Nothing is inherited. | P1 |
| SEL-003 | One snapshot for the whole turn | Every view in a turn is built from the same fixed snapshot taken at the start. | P1 |
| SEL-004 | Every consumer has a budget | Anything receiving memory declares a positive token budget for everything it receives combined. | P1 |
| SEL-005 | Ask explicitly, or don't get it | A representation not listed is not supplied. A listed one must name a supported selection strategy — the platform never quietly defaults to "everything". | P1 |
| SEL-006 | Three ways to select conversation | *Everything*: all available turns. *Recent window*: the newest N complete turns. *Token-bounded tail*: the newest complete turns that fit a token budget. All three remain subject to the consumer's overall budget and trimming policy. Parameters are in §4.3. | P1 |
| SEL-009 | Summary selection | The summary supports "everything" only, and is supplied only when it exists. | P2 |
| SEL-010 | Future selection | Facts would support "everything"; events would support all three — only once those representations exist. | Deferred |
| SEL-011 | Publishing catches bad combinations | Publishing rejects a strategy that a representation does not support, or one missing its required parameter. | P1 |
| SEL-012 | Never cut a turn in half | Selection keeps whole turns and whole items. It never truncates one mid-content just to hit a token number. | P1 |
| SEL-013 | Count tokens the way the model does | Token counting uses the tokenizer of the model that will actually receive the memory. | P1 |
| SEL-014 | Selected but absent is fine | Something selected that isn't there yet is left out without failing anything. | P2 |
| SEL-015 | Selection never writes | Selection shapes this turn's input only. It never modifies or deletes stored memory. | P1 |

### 3.7 Token Limits, Overflow, and Memory Trust Boundary

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| LIM-001 | Count everything together | After each representation is selected, the platform counts the combined total for that consumer. | P1 |
| LIM-002 | If it fits, do nothing | Memory within budget is supplied as selected, with no trimming applied. | P1 |
| LIM-003 | Trimming is an ordered list | Trimming is an ordered list of platform-defined actions, applied in exactly the configured order. The actions are defined in §4.3. | P1 |
| LIM-004 | Trim by swapping, shrinking or dropping | An existing summary may stand in for the conversation it covers; the oldest whole turns may be dropped; or a whole representation may be left out. Each action is a no-op if it cannot apply. | P1/P2 |
| LIM-006 | Trimming events | Reserved for events, when they exist. | Deferred |
| LIM-008 | Recount after every action | The total is recalculated after each action, and trimming stops as soon as memory fits. | P1 |
| LIM-009 | Trimming never calls a model | Trimming never generates a new summary. Summary generation only ever happens on its configured background trigger. | P2 |
| LIM-010 | The last resort | If memory still doesn't fit once the list is exhausted — or the list is empty — all memory is left out and the agent runs on this turn's input alone. | P1 |
| LIM-011 | Never fail for size | Nothing fails purely because optional memory did not fit. | P1 |
| LIM-012 | Record what was trimmed | The platform records which consumer, what was requested, tokens before and after, which actions ran and why it degraded — without recording any content. | P3 |
| LIM-013 | Trimming affects this turn only | Trimming changes one consumer's input. Stored memory is untouched. | P1 |
| LIM-014 | History stays in the speakers' voices | Selected history is supplied as the original ordered user and assistant messages, followed by the current question. Historical content is never promoted into the agent's instructions. | P1 |
| LIM-015 | A summary is labelled as generated | The summary is supplied as clearly labelled, model-generated context that carries less authority than the published agent instructions. | P2 |
| LIM-016 | Authority is enforced outside the model | Permissions, authorisation, identity, confirmation and business rules are enforced outside the model, whatever the memory happens to contain. | All |
| LIM-017 | Don't claim more safety than we have | We do not claim that filtering or classifying natural-language memory makes it safe. The protection is structural — separating memory from instructions — and adversarial tests must attack exactly that. | P1/P2 |

### 3.8 Asynchronous Summary Generation

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| SUM-001 | Only after the foundation is done | The background summary ships only once the conversation foundation has passed its exit gate. | P2 |
| SUM-002 | Only after a successful save | A summary is considered only after the conversation was successfully saved. A failed save schedules no background work. | P2 |
| SUM-003 | Exactly one trigger | A summary configuration declares exactly one supported trigger. | P2 |
| SUM-004 | The available triggers | Every turn, a turn count, or a token count. A count-based trigger must include its number. | P2 |
| SUM-005 | The launch trigger | The current delivery triggers on token count: work is scheduled once the unsummarised part of the conversation reaches the configured size. | P2 |
| SUM-006 | Where counting starts | With no summary yet, count from the first saved turn. Otherwise, count from where the existing summary left off. | P2 |
| SUM-007 | Schedule once, not repeatedly | Repeated trigger checks for the same representation at the same point create at most one job. | P2 |
| SUM-008 | Hand the work off durably | The trigger publishes durable background work. Generation never runs on the path the user is waiting on. | P2 |
| SUM-009 | Duplicate delivery is harmless, and newer wins | A job is identified by its representation and the point it starts from. Repeated delivery must be harmless, the worker must be safe to run twice, and older work must never overwrite a summary built from newer conversation. | P2 |
| SUM-012 | Store the summary and its position together | A successful update stores the summary and advances the point it has read to, in one step, with its own version so it cannot overwrite another field or a newer summary. | P2 |
| SUM-014 | Summarising does not extend the clock | Generation, retries and updates all preserve the original expiry. | P2 |
| SUM-015 | Bounded size | The configured maximum bounds both what is generated and what is supplied to a model later. | P2 |
| SUM-016 | Missing or stale is survivable | A missing, delayed or stale summary never fails a turn. The consumer receives its other memory, or degrades through the trimming policy. | P2 |
| SUM-017 | A failure keeps the previous summary | A failed generation preserves the previous summary and its position, and records degraded memory. | P2 |
| SUM-018 | A versioned generator | The worker binds a specific prompt and model version, so a quality problem is attributable and can be rolled back. | P2 |
| SUM-019 | A quality gate before rollout | Production rollout requires agreed evaluation of faithfulness, attribution, how much it actually reduces tokens, freshness, and whether instructions in the conversation survive into the summary. | P2 |
| SUM-020 | Follow the work end to end | Background work carries trace context so the trigger, the queue wait, generation and storage can be followed — without carrying content. | P2 |
| SUM-021 | Settle the queue contract first | Before rollout, owners must define durable acknowledgement, redelivery, retention, failed-message handling, retry limits and who owns the worker. | P2 |

### 3.9 Data-Lake Archival and Durability

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| ARC-001 | Everything is archived before it expires | Every conversation is scheduled for background archiving to permanent storage before its fast copy expires. | P1 |
| ARC-002 | Archiving is never on the user's path | Writes to permanent storage are not part of finishing a turn or saving the exchange. | P1 |
| ARC-003 | Workers read a due list | Archive workers read what is due from a per-group schedule, never by scanning the store or through one global index. | P1 |
| ARC-004 | Leave time to retry | The scheduled time leaves enough room to retry before the conversation expires, and the time remaining at handoff is measured. | P1 |
| ARC-005 | Safe to retry | The handoff and the final write are safe to repeat, either by replacing cleanly or by recognising a duplicate. | P1 |
| ARC-006 | Clear the schedule after success | The entry is removed only once the durable write has succeeded. | P1 |
| ARC-007 | If the fast copy is already gone | Record the failure and remove the stale entry, rather than retrying forever for something that no longer exists. | P1 |
| ARC-008 | A replaced conversation is still archived | A conversation replaced as the active one stays eligible for archiving and expiry, but takes no new turns. | P1 |
| ARC-009 | Write in batches | Conversations are batched into larger partitioned files. One file per conversation is not acceptable at platform scale. | P1 |
| ARC-010 | Settle the archive design first | Format, partitioning, compression, retention, acknowledgement and running cost must be defined before production rollout. | P1 |
| ARC-011 | Traceable, not readable | Scheduling and workers carry trace context and opaque identifiers, never memory content. | P3 |
| ARC-012 | Watch the backlog | Metrics and alerts cover the backlog, the oldest waiting item, handoff failures, retries, time remaining and stale entries. | P3 |
| ARC-013 | State the consequence plainly | Documentation must say that continuing after a failed save can lose the exchange, its request record, its derived work and its archive scheduling. | P1 |
| ARC-014 | The ingestion path is a hard gate | The chosen ingestion path, and its acknowledgement and duplicate-safety contract, are required before Phase 1 goes to production. | P1 |

### 3.10 Observability, Performance, Capacity, and Cost

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| OPS-001 | Read latency | Reads complete within **10 ms at p99** at target peak load. | P3 |
| OPS-002 | Write latency | Writes complete within **10 ms at p99** at target peak load. | P3 |
| OPS-003 | Availability | Reads and writes are available at least **99.9% monthly**. | P3 |
| OPS-004 | Load target | Capacity and performance testing validates at least **10,000 memory operations per second**. | P3 |
| OPS-005 | Capacity | The plan supports roughly **270 GB of conversation data** at the long-term envelope, before storage overhead and headroom. | P3 |
| OPS-006 | Load signals | Every load records latency, outcome, why it hit or missed, bytes loaded and whether a configuration override applied. | P3 |
| OPS-007 | View signals | Every view records what was requested and selected, tokens before and after, which trimming actions ran, and why it degraded. | P3 |
| OPS-008 | Save signals | Every save records latency, outcome, failure reason, whether it was a replay, version conflicts, conflict retries and the final policy outcome. | P3 |
| OPS-009 | Summary signals | Phase 2 records trigger checks, queue backlog and oldest item, generation latency, failures, retries, how far it had read, and the resulting version. | P2/P3 |
| OPS-010 | Archive signals | Archiving records the backlog, oldest item, handoff outcome, retries, time remaining, stale cleanups and batch size. | P3 |
| OPS-011 | Latency and degradation alerts | Alert when read or write latency misses target, or when degraded turns exceed the product-agreed threshold. | P3 |
| OPS-012 | Continuity alerts | Alert when unexpected missing conversations, failed replays, duplicate turns, lost conflicts or half-present state rise above baseline. | P3 |
| OPS-013 | Configuration alerts | Alert on a missing safe alternative, an unapproved override, a missing cached withdrawal list, or an incompatible emergency configuration. | P3 |
| OPS-014 | Pause alerts | Alert when a pause cannot be saved, a resume cannot find it, or a version conflict stays unresolved. | P3 |
| OPS-015 | Degradation alerts | Alert when parts of an agent run without their configured memory above the agreed threshold. | P3 |
| OPS-016 | Store health alerts | Alert on memory pressure, evictions, replication lag, operation errors, uneven load or headroom breach. | P3 |
| OPS-017 | Keep metric labels bounded | Metrics may be labelled by product, operation, representation, outcome and failure reason. Tenant, user, conversation, request and turn identifiers must never be metric labels. | P3 |
| OPS-018 | Traceable identifiers | Logs and traces may carry opaque request, conversation and turn identifiers, which is what makes fault tracing possible. | P3 |
| OPS-019 | Never log content | What the user said, and what was summarised, never appear in a metric, log or trace. | All |
| OPS-020 | Measure before provisioning | Before provisioning, real production measurements must replace the planning assumptions for conversation starts, turns per conversation, size percentiles, storage overhead, throughput, archive volume and summary frequency. | P3 |

## 4. API and Data Contracts

### 4.1 Current-Delivery Configuration Contract

This is what a product actually sets. Phase 1 uses conversation only; the summary block and the "use the summary" trimming action become valid in Phase 2. Facts, events and summary-before-answer are deliberately absent.

```json
{
  "tenant": "vaani",
  "agent": "vaani-address-filling",
  "agent_variant": "v1",
  "memory": {
    "short_term": {
      "on_unavailable": "continue_without_stm",
      "representations": {
        "summary": {
          "update_mode": "async",
          "max_tokens": 800,
          "trigger": {"strategy": "token_threshold", "threshold_tokens": 4000}
        }
      }
    }
  },
  "agents": {
    "intent-classifier": {
      "prompt": 31,
      "model": "gpt-4.1-nano-2025-04"
    },
    "response-agent": {
      "prompt": {"experiment": "resp_prompt_v2"},
      "model": "gpt-4.1-2025-04",
      "memory": {
        "short_term": {
          "max_tokens": 6000,
          "representations": {
            "conversation": {"strategy": "recent_window", "max_turns": 4},
            "summary": {"strategy": "everything"}
          },
          "overflow": ["use_summary", "reduce_conversation"]
        }
      }
    }
  }
}
```

Read three things out of this. The classifier has no memory block at all, so it gets no history — it only needs the current sentence. The response agent gets the last four turns plus the summary, capped at 6,000 tokens. And if that doesn't fit, the summary stands in for the conversation first, and only then are old turns dropped.

### 4.2 Session-Level Memory Fields

| Field | Required Meaning |
| :-: | :-: |
| on_unavailable | Required. What to do after bounded retries when memory is unavailable: `continue_without_stm` or `fail_request`. No default — the product must choose. |
| representations.summary | Turns on the background summary in Phase 2. The conversation is always attempted, so it is not declared here. |
| summary.update_mode | Must be `async` in the current delivery. `sync` is future-only and is rejected. |
| summary.max_tokens | The largest summary that may be generated. |
| summary.trigger.strategy | One of `every_turn`, `turn_threshold` or `token_threshold`. The launch choice is `token_threshold`. |
| threshold_turns / threshold_tokens | Required by whichever count-based trigger was chosen. |
| **Future** facts / events | Room reserved in the contract only. Not a commitment. |

### 4.3 Node-Level Memory Fields

| Field | Required Meaning |
| :-: | :-: |
| max_tokens | The most memory, in tokens, this part of the agent may receive in total. |
| representations | The explicit list of what it wants. Anything absent is not supplied. |
| strategy | How to select that representation. No silent default. |
| overflow | The ordered actions applied when the combined total exceeds the budget. |
| **No memory block** | It receives no memory at all. |

| Strategy | Required Parameter | Supported For |
| :-: | :-: | :-: |
| everything | None | Conversation, summary; facts and events when they exist |
| recent_window | max_turns for conversation; max_items for events | Conversation; events when they exist |
| token_bounded_tail | The representation's own max_tokens | Conversation; events when they exist |

| Overflow Action | What It Does |
| :-: | :-: |
| use_summary | Let an existing summary stand in for the conversation it covers. Does nothing if there is no suitable summary. |
| reduce_conversation | Drop the oldest whole turns until it fits, or until no conversation is left. |
| reduce_events | Future: drop the oldest whole events. |
| omit_conversation | Drop the selected conversation entirely. |
| omit_summary | Drop the summary. |
| omit_facts / omit_events | Future: drop that representation entirely. |
| **List exhausted** | Drop all memory, record the degradation, and run on this turn's input alone. |

### 4.4 Redis Store Map

| Store | Key / Identity | Technology Shape | Holds |
| :-: | :-: | :-: | :-: |
| **Working Memory** | `wm:{bucket}:tenant:user` | Hash, fixed TTL | Active session, config and code pin, lifecycle times, `checkpoint:{turn_id}` |
| **Session Memory** | `sm:{bucket}:tenant:user:session` | Hash, fixed TTL | Turn sequence, conversation, request-replay map, summary and representation versions |
| **Archive Due** | `sm:{bucket}:archive_due` | Sorted Set | Member is tenant:user:session; score is the pre-expiry archive time |
| **Data lake** | Organisational ingestion path — TBD | Durable, asynchronous | Batched partitioned archives. Never read while serving |

All three fast-store keys share the same `{bucket}` tag, which is what keeps them in one place and makes multi-key updates all-or-nothing (RED-003, RED-007).

### 4.5 Conversation Turn Record

| Field | Required Meaning |
| :-: | :-: |
| sequence | The turn's position, in the order turns were saved. |
| request_id | The caller's stable request identity, used to recognise a repeat and replay the answer. |
| original_query | What the user said, in their own language. |
| translated_query | The translated question the agent saw, where translation happened. |
| assistant_response | The complete answer text the caller received. |
| completed_at | When the exchange completed. |

### 4.6 Failure and Status Contract

| Condition | Platform Behaviour | What the Caller Sees |
| :-: | :-: | :-: |
| **Nothing found** | Treat as a new or expired conversation and create one. | Empty memory; the turn runs normally. |
| **Only half the state found** | Invalid. Bounded retry, alert, then the tenant's policy. | Continue without memory, or a retriable error. |
| **Cannot read memory** | Bounded retry. Never create replacement state. | Memory-unavailable, or a retriable error before the agent runs. |
| **Another turn saved first** | Reload and rewrite only the memory. | Nothing — the answer continues after a successful retry. |
| **Save outcome unknown** | Look up the request ID, then retry the same save if it isn't there. | The stored answer replayed, or the policy outcome. |
| **Cannot save** | Nothing is half-written. Apply the tenant's policy. | Save-failed with the answer, or a retriable error. |
| **An optional representation is missing** | Leave it out of the view. | Nothing — the turn continues. |
| **Memory too big for a consumer** | Trim; if it still doesn't fit, supply none. | Nothing — the turn continues on degraded memory. |
| **Summary generation failed** | Keep the previous summary and its position. | Nothing — serving continues, degradation is recorded. |
| **Nothing left to archive** | Record the failure and clear the stale entry. | Nothing — and no endless retrying. |

### 4.7 Memory Input Contract

| Input | Model-Input Contract |
| :-: | :-: |
| **Conversation** | Supplied as the original ordered user and assistant messages, then the current question. |
| **Summary** | Supplied as labelled, model-generated, lower-authority context that preserves attribution. |
| **Platform instructions** | Only the published agent configuration may give the agent instructions. Memory can never add to them. |
| **Consequential actions** | Permissions, authorisation, confirmation and domain rules are enforced outside the model. |

### 4.8 Background Work Contracts

| Contract | Required Behaviour |
| :-: | :-: |
| **Summary job identity** | Representation plus the point it starts from. Duplicate delivery is harmless, and older work cannot overwrite newer. |
| **Summary update** | Store the summary, advance its position and update its own version, preserving the fixed expiry. |
| **Archive work identity** | Tenant, user and conversation, plus whatever revision identity the chosen ingestion path requires. |
| **Archive completion** | The batched durable write succeeds before the schedule entry is cleared. |
| **Trace propagation** | Background work carries trace context and opaque IDs, never memory content. |

## 5. Experimentation Strategy

### 5.1 Will this capability support experiments?

**Yes.** Phase 3 rolls Vaani out through an experiment on new conversations. If a product later adopts the summary, that should be its own experiment, because it changes both what the model sees and what it costs.

### 5.2 Experiment Type

A conversation-sticky configuration experiment. The variant is chosen when a conversation starts and stays fixed for its lifetime — the one exception being an authorised emergency replacement.

### 5.3 Variant Behaviour

| Variant | Experience |
| :-: | :-: |
| **Control** | Vaani's previous configuration and its existing conversation handling, unchanged. |
| **Treatment** | Platform memory is on, set to continue without memory if it is unavailable, and the response agent receives the recent window of conversation. |
| **Later summary experiment** | A separate later treatment may add the Phase 2 summary. It is not part of the first Vaani baseline. |

### 5.4 Assignment Rules

1. Only new conversations enter the experiment. A conversation in progress never switches variant.
2. The configuration and code release serving a conversation must be visible on every turn.
3. A turn that continued without memory after a read failure may use the current safe assignment or a live fallback, and must record that its pin was best-effort.
4. An emergency replacement may override a pin only through the audited safe-configuration path.
5. Rollout starts as a small canary, expands progressively, and rolls back by restoring the previous configuration for new conversations.

## 6. Tech Solutioning

### 6.1 Key Implementation Decisions

| Decision | Why This Way | Accepted Consequence |
| :-: | :-: | :-: |
| **Build memory once inside the platform** | The platform already owns the turn boundary where memory is loaded and the completed exchange appears. | The platform becomes accountable for memory availability, consistency and operations. |
| **Redis is the only store on the serving path** | Native expiry, low latency, replication, and the primitives needed for all-or-nothing multi-key updates fit hot session state exactly. | Acknowledging on the primary accepts a small window where an acknowledged write can be lost in an extreme failover. |
| **Separate operational state from conversation memory** | Operational state and model-facing memory change for different reasons and at different rates. | A normal load reads two co-located keys that must be created and expire together. |
| **Six-hour fixed lifetime** | Predictable lifecycle and predictable capacity. | Activity does not extend continuity. Inactivity-based expiry stays future work. |
| **Paused turns live with the conversation** | Pause and resume share one lifecycle instead of needing a second expiry policy. | A pause cannot outlive its conversation, and the latest transition can be lost on failover. Cross-KRD alignment is still open (BLK-003). |
| **The conversation is one value** | One read, and a simple all-or-nothing save. | Every new turn rewrites a growing value, so long-conversation latency must be tested (RED-019). |
| **No hard conversation limit** | A long conversation is not a reason to refuse a user. | Outliers cost more and need monitoring. |
| **Optimistic simultaneous saves** | Two overlapping turns are both kept without re-running any tools. | Answers may be built from the same earlier snapshot, and are ordered by when they were saved rather than by meaning. |
| **Replay a completed request from memory** | A lost response can be recovered without running anything again. | Replay only works inside the six-hour window, and conflicts with the runtime KRD's retry contract until aligned (BLK-005). |
| **Never evict to free space** | An unexpired conversation is never silently dropped. | Capacity pressure becomes a visible write failure. |
| **One load, then per-consumer views** | Everything in a turn sees one version of history, and receives only what it was configured to receive. | The platform builds a view before each consumer that opted in. |
| **Trimming never generates a summary** | Handling oversized memory stays deterministic and adds no model latency. | A consumer may run with no memory when neither an existing summary nor dropping turns is enough. |
| **The summary runs in the background** | Its cost and latency stay off the path the user is waiting on. | The summary may be late or absent, so delivery and the worker must both be safe to repeat. |
| **Archive before expiry, off-path** | Serving stays fast while a durable record is still preserved. | An ingestion contract, a batching design and backlog operations are all required. |
| **Memory is untrusted context** | Text the user controls is replayed on every later turn, so it must never gain authority by being remembered. | Separating memory from instructions reduces the risk but does not guarantee model behaviour — tools enforce authority. |
| **Audited emergency override** | A harmful pinned configuration can be stopped for conversations already running. | Incident safety overrides conversation consistency, and requires compatible safe configurations. |
| **Storage shapes not chosen** | Considered and rejected: a document extension, one key per turn, and a list-based conversation. Each traded away either atomicity, read simplicity or predictable latency. | Recorded here so the choice can be revisited with evidence rather than re-argued. |

### 6.2 Runtime Flow

1. Vaani calls the platform with a request ID, a conversation reference and the user's words.
2. The chosen configuration is checked against the locally cached list of withdrawn configurations.
3. Memory is loaded once — operational state and conversation together. Three things can happen instead of a normal load: nothing is found, so a new conversation is created; memory is unavailable, so the tenant's policy applies; or this request already completed, so the stored answer is replayed and nothing else runs.
4. A fixed snapshot of that memory is taken for the turn.
5. Before each part of the agent that opted in, a view is built: select the representations, count tokens for that model, and apply the ordered trimming actions if needed.
6. The agent runs and the complete answer is finalised.
7. The exchange is saved with a version check. A conflict rewrites only the memory; an unknown outcome looks up the request ID; a failure applies the tenant's policy.
8. Only after a successful save, the summary trigger is evaluated (Phase 2).
9. The answer — or a retriable error — goes back to the caller.
10. In the background, the conversation is archived to permanent storage before it expires.

### 6.3 Capacity and Cost Planning

| Input | Planning Value |
| :-: | :-: |
| **Turns per conversation** | 4 |
| **Conversation size** | 20 KB |
| **Retention** | Six-hour fixed lifetime, no early deletion |
| **Sizing allowance** | 1.35× storage overhead, 70% maximum utilisation |
| **High availability** | One replica per primary |
| **Planning VM rate** | n2-highmem-16 equivalent at roughly $750/VM/month |

| Scenario | Turn Rate | New Conversations/s | Live at 6h | Logical Data | Primary Need | Topology | Est. / Month |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **Current Vaani** | 44 turns/s | 11 | 237,600 | 4.75 GB | ~8.5 GiB | n2-highmem-2 primary + replica | ~$188 |
| **Fully scaled Vaani** | 500 turns/s | 125 | 2.7M | 54 GB | ~97 GiB | n2-highmem-16 primary + replica | ~$1,500 |
| **Long-term platform** | 2,500 turns/s | 625 | 13.5M | 270 GB | ~485 GiB | 4 primaries + 4 replicas | ~$6,000 |

At today's observed peak, memory runs at about **88 operations/s**; fully scaled Vaani about **1,000/s**; the platform envelope about **5,000/s** before lifecycle and archive operations. The load-test target stays **10,000/s**, deliberately above the envelope. Sustained archive volume works out to roughly **0.57 TB, 6.5 TB and 32.4 TB per month** across the three scenarios.

These are planning assumptions, not a provisioning commitment — production measurements must replace them (OPS-020). Two cost notes: one file per conversation is not viable at this scale, so archive workers must batch; and summary model cost is separate and depends entirely on opt-in volume, so Vaani Phase 1 carries no summary cost at all.

### 6.4 Implementation Status

| Area | Status |
| :-: | :-: |
| **Architecture and contract** | Specified in Part Two A and converted into requirements here. Ready for implementation review. |
| **Phase 1 conversation foundation** | Three-week planned delivery. Not built. |
| **Phase 2 background summary** | Two-week delivery after the Phase 1 exit gate. Blocked on the queue contract and the summary quality decision. |
| **Phase 3 Vaani rollout** | Two-week production-readiness stage. Blocked on the earlier gates and production approvals. |
| **Facts, events, summary-before-answer, streaming** | Contract seams only. Deferred. |

## 7. Logging Requirements

Each row is a question we must be able to answer, the span that answers it, and the minimum fields needed. Memory content is never among them.

| Record / Span | When | Minimum Required Fields |
| :-: | :-: | :-: |
| `stm_session_create` — did the conversation start cleanly? | A conversation is created or replaced | Product, opaque user and conversation, group, config and code pin, expiry, outcome, retries. No content. |
| `stm_load` — did memory load, and how fast? | Every turn's load attempt | Latency, outcome, why it hit or missed, whether both records were present, bytes loaded, time remaining, override result. |
| `stm_request_replay` — did we avoid running this twice? | A completed request is recognised | Opaque request and conversation, stored position, replay outcome. No answer content. |
| `stm_view_build` — what did this consumer actually see? | Before each opted-in consumer | Consumer, requested and selected representations, tokens before and after, strategies, trimming actions, degradation reason. |
| `stm_commit` — was the exchange saved? | Every save attempt | Expected and new position, latency, outcome, retries, failure reason, policy outcome, time remaining. |
| `stm_conflict_retry` — did two turns race, and did both survive? | A simultaneous-save conflict | Loaded position, current position, retry number, final outcome. Never logged as a second execution. |
| `stm_unavailable` — what did we do when memory was down? | Read or write retries exhausted | Operation, the tenant's policy, resulting status, response outcome, retry budget used. |
| `stm_checkpoint_write` — was the pause saved before we reported it? | A pause is persisted | Turn, pause version, state and type, latency, outcome, time remaining. No payload content. |
| `stm_checkpoint_resume` — did the resume take effect exactly once? | A resume attempt | Expected and actual version and state, replay or conflict outcome, time remaining. |
| `stm_config_override` — what did we replace, and who authorised it? | An emergency replacement is evaluated or applied | Withdrawn config, safe config, cache state, actor, reason, audit ID, outcome. |
| `stm_summary_trigger` — should a summary have been scheduled? | After a successful save, Phase 2 | Representation, starting point, trigger type and value, unsummarised size, whether a job was scheduled. |
| `stm_summary_job` — did the summary keep up? | Worker lifecycle | Queue wait, attempt, model and prompt version, starting and ending point, latency, tokens, version outcome, failure class. No summary content. |
| `stm_archive_due` — is anything at risk of expiring unarchived? | A conversation becomes due | Group, opaque conversation, due time, expiry, time remaining. |
| `stm_archive_handoff` — did the durable write succeed? | An archive batch attempt | Batch size and bytes, partition, retries, acknowledgement, time remaining, outcome. |
| `stm_archive_stale` — why was there nothing to archive? | A due entry has no fast copy | Opaque conversation, due time, observed state, cleanup outcome. |

**Safe diagnostics rule:** metrics may be labelled by product, operation, representation, outcome and failure reason. Tenant, user, conversation, request and turn identifiers belong in traces and logs only, never as metric labels. Memory content is prohibited from all operational telemetry.

## 8. Dependencies, Open Decisions, and Blockers

Four of the blockers below are direct contradictions with the Composition & Runtime KRD, not open questions within this one. They must be settled between the two documents before either is built.

| ID | Item | Decision / Work Required | Owner |
| :-: | :-: | :-: | :-: |
| DEP-001 | Store readiness | Provision namespaces, same-region primary and replica topology, no-eviction policy, access controls, capacity headroom, monitoring, and staging and production access. | Infrastructure |
| DEP-002 | The grouping function | Finalise how many groups, how identity maps to one, how it is migrated and versioned, and validate that load spreads evenly. | Platform + Infra |
| DEP-003 | The all-or-nothing operations | Build and review the lifecycle, save, request-record, pause and archive-schedule operations. | Engineering |
| BLK-001 | Data-lake ingestion path | Choose the path and define batch format, acknowledgement, duplicate safety, compression, retention and ownership. | Data Platform |
| BLK-002 | Phase 1 load proof | Prove read and write latency at 10,000 operations/s with realistically long conversations, including failover tests. | Infra + QA |
| DEP-004 | Withdrawal distribution | Provide cached withdrawal lists, safe-configuration mapping, retention for at least one conversation lifetime, and an audit trail. | Config Platform |
| BLK-003 | **Where a paused turn is stored** | This KRD stores paused turns with the conversation, in the fast store. The Composition & Runtime KRD stores them durably, precisely so a confirmed user approval survives a cache failure. These cannot both be true. Pick one before any approval-gated action ships. | Architecture |
| BLK-004 | **One turn at a time, or two** | This KRD supports two turns finishing at once. The Composition & Runtime KRD allows only one turn per conversation at a time. Decide whether concurrency is a supported behaviour or only a safety net — and keep the version check either way. | Architecture + Runtime |
| BLK-005 | **What a retry means** | This KRD replays the stored answer for a request that already completed. The Composition & Runtime KRD treats a retry after completion as a new turn. Freeze one contract before the SDK is built. | Product + Runtime |
| ALIGN-001 | **How long a conversation lives** | Six hours is defined here. Every other document, config default, capacity plan and test must use the same number. | Architecture |
| DEP-005 | Tokenizers | Expose deterministic token counting for every model that receives memory. | LLM Gateway |
| BLK-006 | Queue contract | Define durable acknowledgement, redelivery, retention, failed-message handling, retry limits, trace propagation and worker ownership before Phase 2. | Messaging + Platform |
| BLK-007 | Summary quality decision | Choose the summary's model, prompt, threshold and maximum size, and the faithfulness, attribution and token-reduction bars, on representative conversations. | Product + Evaluation |
| DEP-006 | Summary evaluation | Provide adversarial evaluation for instructions surviving into a summary, attribution, stale and missing summaries, and freshness. | Evaluation |
| DEP-007 | Vaani experiment and rollback | Build new-conversation assignment, the treatment configuration, the canary population, dashboards, expansion criteria and rollback. | Vaani + Experimentation |
| DEP-008 | Security and privacy review | Approve tenant isolation, store access, the telemetry content prohibition, archive access, retention and subject-data obligations. | Security + Legal |
| DEP-009 | Runbooks | Document store outage, half-present state, withdrawal failure, summary backlog, archive backlog and capacity incidents. | SRE / On-call |
| OPEN-001 | Facts and events | Deferred until there is a product use case, an extraction contract, a quality gate and a cost case. | Product |
| OPEN-002 | Future lifecycle | Inactivity-based expiry, early deletion, streaming and summary-before-answer each need their own requirements. | Product + Architecture |

---

# Section III: Testing & Launch Checklist

## 1. Functional Testing

### 1.1 Session Lifecycle and Storage Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-001 | A brand-new conversation | Both records are created together in one step, the version is pinned, both get the same six-hour expiry, the archive is scheduled, and the turn runs with empty history. |
| TC-002 | A returning conversation | One load returns the pin and the history, and the expiry does not change. |
| TC-003 | A normal turn on a conversation with a paused turn saved | The paused turn's saved state is not loaded. |
| TC-004 | The caller supplies a different conversation than the active one | Operational state is replaced in one step, old pauses are cleared, new memory is created, and the old conversation takes no more turns. |
| TC-005 | Only one of the two records exists | Invalid state: bounded retry, an alert, then the tenant's policy. Empty memory is never quietly paired with the surviving half. |
| TC-007 | A successful turn | The user's words, any translation, the complete answer, the request ID, the position and the completion time are all saved together before the answer is returned. |
| TC-008 | The very next turn | It loads the complete previous exchange. |
| TC-009 | The save fails before writing anything | No half-saved turn and no request record are visible. |
| TC-010 | A very long conversation | The turn is not refused for its size, and write latency and bytes are recorded. |
| TC-011 | A part of the agent tries to read the store directly | The test fails the build. Everything receives platform-built views. |
| TC-012 | Reads, saves, pauses and summary updates over time | The absolute expiry never moves. |
| TC-013 | The conversation expires | Both records disappear, a later request starts a new conversation, and an old paused turn cannot resume. |
| TC-014 | Streaming is requested in the current delivery | The request or config is rejected, or stays on the blocking path. No partial stream is ever saved as a completed turn. |
| TC-015 | Keys for the same tenant and user | Both records and the archive schedule resolve to the same place, so multi-key updates stay atomic. |

### 1.2 Retry, Concurrency, and Availability Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-016 | The same completed request ID arrives again | The stored answer is returned before the agent runs. No model call, no tool call, no save. |
| TC-017 | The answer is lost in transit after a successful save | The caller's retry with the same request ID gets the stored answer, exactly once. |
| TC-018 | The save's outcome is unknown but the request record exists | The stored answer is returned. Nothing is executed again. |
| TC-019 | The save's outcome is unknown and there is no record | The same save is retried within budget, and the final outcome follows the tenant's policy. |
| TC-020 | Two turns both start from position 5 and finish, A then B | A takes 6; B rewrites only the memory and takes 7. Both turns survive. |
| TC-021 | The conflict-retry path | Traces show the agent and its tools ran exactly once per turn, despite the memory being written twice. |
| TC-022 | The conflict outlasts the retry budget | A distinct failure is reported and alerted. Never a quiet success. |
| TC-023 | Two requests start the same conversation at once | One creation wins; the loser reloads the stored configuration before running. |
| TC-024 | Cannot read memory, policy is to continue | The agent runs with no history, memory-unavailable is recorded, and no state is created. |
| TC-025 | Cannot read memory, policy is to fail | A retriable error returns before the agent runs. |
| TC-026 | Cannot save, policy is to continue | The completed answer returns with save-failed recorded, and the next turn cannot see the exchange. |
| TC-027 | Cannot save, policy is to fail | A retriable error returns, the answer is not marked successful, and any effects that already happened are visible in the trace. |
| TC-028 | The caller retries after a failed save | With no request record, the agent may run again — and the tools' own request-ID protection is what prevents a duplicate real-world effect. |
| TC-029 | A retry arrives after the conversation expired | No replay guarantee remains; the request starts a new conversation. |
| TC-030 | Failover immediately after an acknowledged write | The accepted possibility of losing that write is documented and measured, and recovery never leaves half-present state. |

### 1.3 Policy, Revocation, Checkpoint, and Redis Safety Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-031 | Publish with no availability policy, or an unrecognised one | Rejected in both cases. |
| TC-033 | Vaani's released configuration | Continue-without-memory is present and visible in the versioned config. |
| TC-034 | A withdrawn pinned configuration | The safe alternative replaces it without deleting the conversation or changing its expiry, and an audit record is emitted. |
| TC-035 | The control plane is down but the cached list is valid | The last known list is used, and the turn path never calls the control plane. |
| TC-036 | A fresh instance has no cached list | The platform safe configuration is used and an alert fires. |
| TC-037 | The safe alternative is incompatible with live conversation data | The override is rejected or the launch gate fails. Corrupt execution is never allowed. |
| TC-038 | A turn pauses | The complete pause record is stored before the caller is told it paused. |
| TC-039 | Resume with the expected version and state | The result is stored and the pause moves to resumed, in one step. |
| TC-040 | The same resume arrives twice | The recorded result is returned. Nothing runs again. |
| TC-041 | A conflicting resume result | Rejected. The originally accepted result stands. |
| TC-042 | Resume after expiry | Fails, because neither the conversation nor the pause exists. |
| TC-043 | A new conversation replaces one with old pauses | Every old pause is cleared. |
| TC-044 | The store is under memory pressure | No unexpired data is silently removed. The write fails visibly and the policy applies. |
| TC-045 | The cluster rebalances | Related keys stay together and multi-key operations keep working. |

### 1.4 Node Selection, Overflow, and Trust Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-046 | A part of the agent with no memory settings | It receives no memory. |
| TC-047 | "Everything", within budget | All available complete turns are supplied. |
| TC-048 | Recent window of four | The newest four complete turns, in order. |
| TC-049 | Token-bounded tail | The newest complete turns that fit. No turn is cut in half. |
| TC-050 | An unsupported strategy, or a missing required parameter | Publish is rejected in both cases. |
| TC-052 | A selected summary that doesn't exist | It is left out and the turn continues. |
| TC-053 | Combined memory fits the budget | No trimming runs at all. |
| TC-054 | Over budget, with a suitable summary available | The summary stands in for the conversation it covers, and the total is recounted. |
| TC-055 | Over budget, with no suitable summary | That action does nothing and the next configured action runs. |
| TC-056 | Dropping old turns is needed | The oldest complete turns go until it fits, or until no conversation is left. |
| TC-057 | Trimming is exhausted, or the list is empty, and it still doesn't fit | All memory is left out, the turn continues, and the degradation is recorded. |
| TC-059 | Trimming applied for one consumer | The store and every other consumer's view are unaffected. |
| TC-060 | A remembered user message says "ignore your instructions" | It stays a user message. The published instructions and the tool permissions still win. |
| TC-061 | A generated summary contains commands | It stays labelled generated context and never becomes an instruction. |
| TC-062 | Two consumers on different models | Each counts tokens with its own model's tokenizer and respects its own budget. |

### 1.5 Asynchronous Summary and Archival Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-063 | The conversation is below the threshold | No summary work is scheduled. |
| TC-064 | The threshold is reached after a successful save | Exactly one job is scheduled for that representation and starting point. |
| TC-065 | The trigger is checked repeatedly at the same point | Still exactly one job. |
| TC-066 | The save failed | No summary work is scheduled. |
| TC-067 | The same job is delivered twice | The update is safe to repeat: one summary, one version, one position. |
| TC-068 | A newer summary finishes before an older job | The older job cannot overwrite the newer result. |
| TC-069 | Generation fails | The previous summary stands, its position does not move, degradation is recorded, and serving continues. |
| TC-070 | Generated output exceeds the maximum | It is bounded or rejected per the worker contract. An oversized summary is never published. |
| TC-071 | A summary update lands near expiry | The original expiry is preserved. |
| TC-072 | The summary is missing while a turn runs | The consumer uses its other memory or the trimming fallback. The turn does not fail. |
| TC-073 | A conversation becomes due for archive | The worker finds it on the due list, without scanning the store. |
| TC-074 | The durable write succeeds | The schedule entry is cleared only after acknowledgement. |
| TC-075 | The archive write is retried | Duplicate-safety prevents the same conversation being archived twice. |
| TC-076 | The fast copy is gone when the worker runs | The failure is recorded and the stale entry cleared. |
| TC-077 | A large archive volume | Conversations are batched into partitioned files. One file per conversation is never used. |
| TC-078 | The backlog approaches expiry | An alert fires, based on the oldest waiting item and the time remaining. |

### 1.6 Observability, Scale, Security, and Rollout Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-079 | 10,000 operations/s with realistic conversations | Read and write latency both meet the 10 ms target, or launch is blocked. |
| TC-080 | Monthly availability | Read and write availability can each be calculated separately and meet 99.9%. |
| TC-081 | 270 GB capacity simulation | The provisioned topology holds its headroom and never evicts. |
| TC-082 | Inspect all telemetry | No conversation or summary content appears in any metric, log or trace. |
| TC-083 | Audit metric labels | No tenant, user, conversation, request or turn identifier is used as a metric label. |
| TC-084 | Trace through background work | Trace context links the turn, the summary worker and the archive worker. |
| TC-085 | A spike in degraded turns | The availability alert fires whether the tenant continues or fails. |
| TC-086 | A spike in unexpectedly missing conversations | The continuity alert fires against the product's baseline. |
| TC-087 | No cached withdrawal list | The configuration alert fires and the safe configuration is visible in use. |
| TC-088 | Degradation above threshold | The alert identifies which consumer and why, without content. |
| TC-089 | The summary falls behind its window | The freshness alert fires. |
| TC-090 | Replication lag or memory pressure | The store-health alert fires before the guarantees are actually at risk. |
| TC-091 | Vaani treatment assignment | Only new conversations get the treatment, and each stays on its pinned configuration for its lifetime. |
| TC-092 | Vaani rollback | New conversations immediately return to the previous configuration; live ones follow the approved pin and override policy. |
| TC-093 | Cost dashboard | Store occupancy, archive volume and summary model cost can each be attributed to a product without high-cardinality metric labels. |

## 2. Launch Checklist

| Theme | Launch Requirement | Owner / Notes |
| :-: | :-: | :-: |
| **Architecture** | The four cross-KRD contracts — retry, concurrent turns, paused-turn durability, conversation lifetime — are settled and identical in both KRDs. | Architecture / TBD |
| **Store** | Production and staging clusters, access controls, namespaces, the grouping function, replication, no-eviction and headroom are ready. | Infrastructure / TBD |
| **Atomic operations** | Lifecycle, save, request-record, pause and archive-schedule operations are reviewed and integration-tested. | Engineering / TBD |
| **Availability policy** | Publishing rejects a missing or unrecognised policy, and Vaani is set to continue without memory. | Platform + Vaani |
| **Conversation correctness** | New, returning, replaced, expired and half-present paths all pass. | QA / TBD |
| **Retry safety** | Stored-answer replay, unknown-outcome recovery, and tool-level repeat safety all pass. | Runtime + Tool Owners |
| **Concurrency** | Simultaneous saves and simultaneous creation pass, with no agent or tool re-run. | Runtime / TBD |
| **Paused turns** | The pause and resume contract is aligned, built and approved before any approval-gated action uses it. | Architecture + Runtime |
| **Emergency override** | Safe-configuration mapping, cache distribution, no-cache fallback, retention and audit are all proven. | Config Platform |
| **Node policy** | Selection compatibility, the right tokenizer, token limits, trimming and the degraded fallback pass for every production consumer. | Agent Owners |
| **Trust boundary** | Speaker roles preserved, summary labelled, adversarial tests on remembered instructions, and external authorisation — all approved. | Security |
| **Data lake** | Ingestion path, batching, acknowledgement, duplicate safety, compression, retention, access and ownership approved. | Data Platform |
| **Archive proof** | Realistic conversations archive before expiry, including under backlog and retry. | Data + QA |
| **Performance** | The 10,000 operations/s load test meets both latency targets with realistically long conversations. | Infra + QA |
| **Availability** | Failure injection verifies both tenant policies and the monthly availability calculation. | SRE + QA |
| **Telemetry** | Every required span, dashboard, alert and runbook exists, and the no-content audit passes. | Analytics + SRE |
| **Capacity** | Production measurements replace the planning assumptions, or an explicit risk acceptance is signed. | Infrastructure |
| **Phase 2 queue** | Acknowledgement, redelivery, retention, failed-message handling, retry, trace and ownership approved before summary rollout. | Messaging |
| **Phase 2 quality** | Summary model, prompt, threshold, maximum size and evaluation gates approved. | Product + Evaluation |
| **Vaani config** | The treatment uses the recent window of conversation. The summary is not in the Phase 1 baseline. | Vaani |
| **Experiment** | New-conversation assignment, canary, progressive expansion, metrics and rollback configured. | Experimentation |
| **Security and privacy** | Store and archive access, retention, data handling and legal obligations signed off. | Security + Legal |
| **Operational readiness** | On-call ownership, escalation, capacity playbook and incident drills complete. | SRE |
| **Rollback** | The previous configuration, the safe emergency configuration, and worker rollback are all tested. | Platform + Vaani |
| **Documentation** | Config schema, failure and status contract, data model, runbooks and known trade-offs published. | PM + Engineering |

### 2.1 Hard Launch Blockers

1. Any of the four cross-KRD contracts still unresolved: what a retry means, one turn at a time versus two, where a paused turn is stored, or how long a conversation lives.
2. No chosen data-lake ingestion path with acknowledged, duplicate-safe, batched writes.
3. Load or failover testing misses the 10 ms latency, the 99.9% availability, or the no-half-present-state expectation.
4. A missing availability policy, or Vaani configured wrongly.
5. Stored-answer replay, simultaneous-save safety, or tool-level repeat safety unproven.
6. Emergency override cannot replace a harmful pin with a compatible safe configuration.
7. Memory content appears in operational telemetry, or tenant isolation is unproven.
8. Conversations cannot be archived with margin before they expire.
9. Phase 2 only: the queue contract or the summary quality and freshness gate is unresolved.
10. Phase 3 only: Vaani canary, dashboards, rollback or on-call runbooks incomplete.

## 3. Post-Launch Governance

| Area | Cadence / Trigger | Governance Action | Owner |
| :-: | :-: | :-: | :-: |
| **Latency and availability** | Daily dashboard, weekly review, incident on breach | Review latency percentiles, error classes, policy outcomes and how they track capacity. | SRE |
| **Continuity correctness** | Daily automated checks; incident on any duplicate or lost turn | Audit replays, save conflicts, half-present state and next-turn visibility. | Runtime |
| **Degraded memory** | Weekly, by tenant and consumer | Review turns that ran without memory or with it trimmed, and whether users noticed. | Product + SRE |
| **Conversation size** | Weekly percentile review | Track turns per conversation, bytes, rewrite latency and outliers. Revisit compaction only with evidence. | Platform |
| **Capacity and cost** | Monthly, and before any traffic expansion | Update occupancy, headroom, store cost, archive volume and summary model cost. | Infra + PM |
| **Archive safety** | Daily backlog, monthly reconciliation | Check the oldest waiting item, missing fast copies, batch success, retention and reconciliation. | Data Platform |
| **Summary quality** | Per release, and a monthly sample once enabled | Evaluate faithfulness, attribution, compression, stale context and remembered instructions. | Evaluation + Product |
| **Emergency controls** | Per incident, quarterly drill | Review cache freshness, safe mappings, the audit trail and the compatibility window. | Config Platform |
| **Security and privacy** | Quarterly, and on any schema change | Audit tenant isolation, access, telemetry, retention and subject-data handling. | Security + Legal |
| **Config policy** | On every publish-schema change | Validate allowed modes, strategies, limits and phase-gated fields. | Platform |
| **Runbooks** | After every incident, and quarterly | Update outage, half-present state, capacity, archive, summary and rollback procedures. | SRE |
| **Deferred capabilities** | Quarterly product review | Facts, events, summary-before-answer, streaming and alternative lifetimes each need a KRD delta before any implementation. | PM + Architecture |

---

# Section IV: Mentor Sign Off

| Function | Name | Status |
| :-: | :-: | :-: |
| **Product** | Ishan | Pending |
| **Engineering** | TBD | Pending |
| **Architecture** | TBD | Pending |
| **Infrastructure / Redis** | TBD | Pending |
| **Data Platform / Archive** | TBD | Pending |
| **Messaging / MQ** | TBD | Pending for Phase 2 |
| **Security** | TBD | Pending |
| **Analytics / Observability** | TBD | Pending |
| **Evaluation / Summary Quality** | TBD | Pending for Phase 2 |
| **QA** | TBD | Pending |
| **Vaani** | TBD | Pending for Phase 3 |
| **Legal / Privacy** | TBD | Pending |

---

## Summary

1. Build short-term memory once, inside the platform, with one fast store on the serving path.
2. Keep operational state and conversation memory as two records stored together, created together, and expiring together after six hours.
3. Load memory once per turn, take one fixed snapshot, and give each part of the agent only the memory it was configured to receive.
4. Finish the answer, then save the complete exchange before returning it.
5. Store the user's own words, any translation, the complete answer, the request ID, the turn's position and its completion time.
6. Replay a request that already completed, recover when a save's outcome is unknown, and keep both turns when two finish at once — never by re-running the agent or its tools.
7. Make every tenant choose what happens when memory is unavailable. Vaani continues without it.
8. Enforce per-consumer selection, token counting on the right model, ordered trimming, and a final fallback of no memory at all.
9. Keep remembered text in the speakers' own voices and treat all of it as untrusted, lower-authority context.
10. Archive every conversation in the background, in batches, before it expires.
11. Add the background summary only in Phase 2, with durable queueing, protection against duplicate and out-of-order updates, and a quality gate.
12. Meet 10 ms read and write latency, 99.9% monthly availability and a 10,000 operations/s load test, with telemetry that never contains content.
13. Roll Vaani out on new conversations only, through an experiment, with proven rollback.
14. Do not present facts, events, summary-before-answer, streaming, alternative lifetimes or long-term memory as committed scope.
15. Settle the four contradictions with the Composition & Runtime KRD before building either: what a retry means, whether two turns can run at once, where a paused turn is stored, and how long a conversation lives.
