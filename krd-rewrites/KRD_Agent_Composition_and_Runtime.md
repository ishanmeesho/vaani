# KRD — Agent Composition & Runtime

**Current Version:** v2 (language pass on v1 — no scope change)
**Current Status:** Under development
**Last Updated:** 25 August 2026
**POD:** Agentic Marketplace Platform
**Contributors:** PM: Ishan Sharma | Engineering: Prashant | Architecture: Karthik | Security: TBD | Analytics: TBD

---

# Section I: Executive Summary

## 1. Problem Statement

A conversational agent is made of parts that change at very different speeds. A prompt gets tuned in an afternoon. A model is swapped every few months. The flow of the conversation itself changes rarely. Today those parts are written into product code, so the slowest thing in the list sets the pace for everything: improving one line of a prompt needs a code release, and every product team rebuilds its own login, logging, cost tracking and error handling on the way.

This capability separates the two. **Composition** is how an agent is assembled from its parts — the prompt, the model, the tools it may use, and the read-only information it may consult, each named and versioned. **Runtime** is what happens when a user speaks: the platform picks the exact version this conversation should run, assembles the agent, runs the back-and-forth between model and tools, returns the answer, and records precisely what ran.

Two consequences matter for the business. A PM can change agent behaviour and see it live the same day. And when a conversation goes wrong, we can say which prompt, model or tool caused it — because every conversation records the exact versions it used.

The agent itself remembers nothing between turns. Conversation history lives outside it, so any server can serve any turn and a deploy never drops a conversation mid-sentence.

## 2. NSM — Success & Check Metrics

### Primary Success Metric

| Metric | Definition |
| :-: | :-: |
| **Behaviour-change lead time** | A change to how an agent behaves — its prompt, model, tool access, tuning or flow — reaches production in **under 4 hours** once it has passed its evaluation gate, and a bad change is rolled back within minutes. |

### Secondary Metrics

| Metric | Definition |
| :-: | :-: |
| **Model adoption lead time** | A newly available model can be tested across every agent in about **1 week** and be live in about **1 month**. |
| **Fault attribution** | When a conversation goes wrong, an engineer can name the responsible prompt, model, tool or platform step within **15 minutes**. |
| **Version traceability** | Every conversation records exactly what served it: the agent version, the config, the prompt versions, the model, the tools it was allowed, and its experiment assignment. |
| **Cost attribution** | Spend is measurable per conversation, per agent, per model call and per tool, and can be read against conversation length and business outcomes. |
| **Stateless serving** | Any healthy server can serve any turn of any conversation, because history lives outside the server. |

### Guardrail Metrics

| Metric | Definition |
| :-: | :-: |
| **Production quality** | The bug rate is no worse than today's non-agentic experience. Quality is judged on the whole conversation; per-component scores are diagnostics, not the goal. |
| **Availability** | Platform-owned infrastructure targets **≥99.9%**. The complete experience also depends on an external model provider we do not run, provisionally around **99.5%**, until gateway data tells us otherwise. |
| **Failure contract** | A failed turn always ends in a clear, typed failure. Never a hang, never silence, never an answer that looks successful but isn't. |
| **Runaway protection** | A turn that runs too long is cut off, and an agent that keeps calling tools in a loop is stopped. A misbehaving agent can never hang a user. |
| **Data isolation** | No conversation can reach another tenant's or another user's data. Proving this at the tool boundary is a **launch blocker**. |
| **High-impact actions** | No action that changes something real (a return, a cancellation) ships until user approval and safe resume are built and tested. |
| **Latency ownership** | Every platform step measures and bounds its own time. End-to-end speed belongs to the product: for voice, p99 under 3 s from the user finishing speaking to the first sound of the reply is the product's goal, not a platform-wide promise. |

---

# Section II: Product Requirement Document

## 1. User Stories and Capabilities

| Story ID | Persona | As a... | I want to... | So that I can... | Current Pain Point | Impact / Value if Solved |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| US-001 | PM / Engineer | prompt owner | Change and version a prompt without a code release | Improve behaviour in hours and undo it safely | Prompt changes wait for a release train | Same-day iteration, with a record of exactly what changed |
| US-002 | Engineer | agent owner | Publish a complete agent version and go live by switching one pointer | Deploy or roll back the whole thing at once | Half-applied changes are impossible to reproduce | Coherent releases and rollback in minutes |
| US-003 | Experiment Owner | experiment owner | Assign agent versions through the central experiment service, once per conversation | Compare variants without changing the experience mid-conversation | Switching a user mid-chat confuses them and corrupts the read | Sticky, attributable experiments |
| US-004 | Product Engineer | product engineer | Combine several specialist sub-agents, each with its own prompt, model and tools | Give each task the right capability and no more | One shared set of tools and one model for everything is over-permissive and wasteful | Safer, cheaper, task-fit agents |
| US-005 | Product Engineer | product engineer | Run fixed step-by-step flows and open-ended agents on the same platform | Use the simplest structure each task needs | Two runtimes means doing the platform work twice | Predictable where possible, flexible where needed |
| US-006 | Platform Engineer | platform engineer | Keep product code independent of the underlying agent framework | Replace or upgrade the framework without rewriting products | Framework-specific code locks us in | The framework choice stays reversible |
| US-007 | Internal Service | internal service | Call an agent by name, waiting for the answer or streaming it | Use one response contract for chat and voice | Everyone integrating differently produces different bugs | One stable, multi-tenant way to consume agents |
| US-008 | End User | user in a multi-turn conversation | Keep talking even when a different server handles the next turn | Get coherent help without dropped conversations | State held inside a server is lost on deploy or failure | Reliable continuity and easy scaling |
| US-009 | User | user who doesn't speak English | Have my words translated once on the way in and the reply translated back | Use the agent while the core stays testable in one language | Language handling duplicated across every prompt, search and eval | One place to fix language quality |
| US-010 | Security Owner | security owner | Carry the trusted user identity into every tool call and require approval for high-impact actions | Be sure the model can never grant itself permission | Prompt injection can make the model claim an identity it doesn't have | Enforced isolation and safe actions |
| US-011 | On-call Engineer | on-call engineer | Follow one conversation across specialists, model calls, tools and versions | Find the responsible part in minutes | Disconnected logs can't explain an end-to-end failure | Fast diagnosis and accountable changes |
| US-012 | Model Platform | model platform owner | Route every model call through the LLM gateway using stable model names | Handle keys, quotas, usage, cost and vendor churn once | Direct provider integrations duplicate controls and expose vendor churn | One governed path to models |
| US-013 | Client-Service Developer | client-service developer | Consume ready-made events instead of raw stream bytes | Get reconnect, ordering and completion handling for free | Streaming turns every consumer into a fragile state machine | Consistent integrations, fewer edge-case bugs |
| US-014 | Agent Builder | agent builder | Reuse existing flows and tools and write code only for genuinely new behaviour | Stand up most new agents through configuration | Every new agent needs bespoke engineering today | Shorter build cycles and a clear line between config and code |

## 2. Scope of Development

### 2.1 In Scope

1. APIs to register tenants and named agents, create prompt versions and agent versions, and promote or roll back what is live.
2. Assembling an agent from behaviour and flow defined in code, plus prompt, model, tool, data-source and tuning choices defined in config.
3. Several specialist sub-agents inside one agent, each with its own model, prompt, tools and data access.
4. One runtime that serves both fixed flows and open-ended, model-driven agents.
5. A self-hosted open-source agent framework behind a platform-owned boundary, starting with Eino and keeping Google ADK as a proven alternative.
6. Experiment assignment through Meesho's central experiment service, decided once per conversation.
7. A multi-tenant API to run a turn, with one turn at a time per conversation, history held outside the server, and time and loop limits on every turn.
8. Tool and data-source registries, the ways tools are called, retry-safety rules, tools executed on the client, and the design for approval-gated actions.
9. One fixed set of response message types, used identically whether the answer is streamed or returned complete.
10. Translation as an optional step at the edge of the agent, with an English-only core and both language versions recorded.
11. A thin connector from the framework to the existing LLM gateway.
12. Conversation-level tracing, exact-version attribution, cost and usage capture, typed failures, rate limits, and safety enforcement at the tool boundary.
13. Storage for configs, live conversation history, paused approvals, and a permanent record of every conversation.
14. An SDK for internal product services. Device apps stay product-owned and never call the platform directly.

### 2.2 Out of Scope

1. The Memory platform, beyond the connection points this runtime needs. Long-term memory has its own KRD.
2. The Evaluation platform, beyond the publish gate and producing the traces evaluation reads. Datasets, scorers and self-improvement have their own KRD.
3. A no-code authoring UI. What is required here is the API and data model any future UI — or coding agent — will call.
4. Training, fine-tuning or hosting models. We consume frontier models through the gateway.
5. Analytics/BI agents and inline AI features as products of this platform, though they may reuse parts of it.
6. Mobile apps calling the platform directly. Product services remain the trusted caller.
7. Handing a live conversation to a human operator.
8. A backup model provider at launch.
9. A persistent always-open connection path at launch.
10. Automatic detection of model quality drift and model-deprecation migration at launch; the hooks are designed now, built later.
11. End-to-end product latency promises. The platform measures its own steps; prompts, tools, agent depth, model choice, speech recognition and UI stay product-owned.
12. The full privacy programme for the permanent conversation record. Legal sign-off, retention, access control and deletion obligations still apply before launch.

### 2.3 Phase Scope

| Phase | Included Capabilities | Explicitly Not Yet Included |
| :-: | :-: | :-: |
| **Launch** | Answers returned complete (not streamed); read-only tools only; prompt and config lifecycle; one version pinned per conversation; central experiment assignment; stateless servers; translation step; one turn at a time; request tracing; publish gates; full tracing; a per-user turn cap; clear typed errors. | Streaming and replay; talking over the agent; actions that change state; approvals and resume; backup provider; human handoff. |
| **Next** | Streaming; reconnect and replay; progress messages; pause and resume; durable approvals and client-executed tools; state-changing tools once safety gates pass; server-side interruption; reuse of assembled agents if not done at launch. | Self-improving evaluation and user-journey context, which belong to the Evaluation and Memory KRDs. |
| **Deferred / Triggered** | Model drift detection; deprecation migration; backup model; shorter trace retention; on-device translation; always-open connection path. | Built only when a named trigger or POC justifies them. |

**Needs alignment:** The target design assembles an agent once per version and reuses it; the earlier phasing put that under "Next". Engineering must decide whether launch assembles per request, caches per server, or ships the full target. This KRD treats reuse as the target and leaves the launch depth open (see DEC-007).

## 3. Functional Requirements

Each row is a requirement. **Launch** is required for the first production release. **Next** is designed now, built after launch. **Open** needs a decision or a POC before it can be built. **Target** is where the design is heading, with launch phasing still to confirm.

### 3.1 Authoring, Versioning, and Release Lifecycle

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| LIF-001 | Register an agent | A team can create a named agent inside its own workspace through an API. The name is identity only; everything that decides behaviour lives in separate versions. | Launch |
| LIF-002 | Prompts are versioned and never edited in place | Every prompt is stored as a fixed, numbered version owned by the team. A config always points at an exact prompt and version, and changing a prompt never requires a code release. | Launch |
| LIF-003 | Prompts that return structured answers | A prompt version can declare the shape of the answer it expects, for when the reply must be read as data — a product list, an order summary — rather than as prose. | Launch |
| LIF-004 | Draft versions and released versions | Teams create draft versions to test and evaluate. Promotion copies a passed draft into a released version and records which draft it came from. Neither can be edited afterwards. | Launch |
| LIF-005 | Go live and roll back by switching one pointer | Each agent has one live pointer. Going live means pointing it at a released version; rolling back means pointing it at an earlier one. Nothing is edited in place. | Launch |
| LIF-006 | The gate matches the size of the change | Anything that changes behaviour — prompt, model, tool access, approval setting, creativity settings, flow, or a brand-new agent — must pass full evaluation. Operational-only changes such as a timeout or a budget need a smoke check, not a full evaluation. | Launch |
| LIF-007 | Code lands before config | A version cannot go live if the agent code it was tested against is not yet running on every server. Config must never reach a server that cannot build it. | Launch |
| LIF-008 | Only your own building blocks | At publish time, every prompt, tool and data source must belong to the team or be explicitly shared with it. References to another tenant's private assets are rejected. | Launch |
| LIF-009 | No release ahead of its safety net | A version containing an action that needs user approval cannot be released until approval and safe resume are live in production. | Launch |
| LIF-010 | Named owners, nothing hard-deleted | Every prompt, tool and data source has a named owner. Retired items are marked retired rather than deleted, so past conversations can still be explained. | Launch |
| LIF-011 | Emergency override | An authorised person can force a change or rollback that also pulls conversations already in flight onto the new version, taking effect within about a second. | Launch |
| LIF-012 | Every deploy is logged | Every move of the live pointer, ordinary or forced, records the agent, the version moved from and to, who did it, why, and when. | Launch |
| LIF-013 | A publishing outage does not stop conversations | Publishing and serving may share one service, but if publishing goes down, agents already serving traffic keep working. | Launch |

### 3.2 Agent Composition, Build, and Engine Abstraction

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| CMP-001 | What lives in code, what lives in config | The shape of an agent — its steps, routing, loops, safety hooks, and the tools themselves — stays in code. What a PM tunes — which prompt, which model, which tools, and settings such as limits — lives in config. | Launch |
| CMP-002 | One agent, several specialists | An agent can combine fixed steps with one or more specialist sub-agents. A specialist is one model, one prompt, and its own restricted set of tools and data sources. | Launch |
| CMP-003 | Each specialist configured on its own | Prompt, model, creativity settings, tool-loop limit, tools and data sources are set per specialist, so a cheap classifier and an expensive responder can live inside the same agent. | Launch |
| CMP-004 | Permission by construction | A specialist is handed only the tools it was granted. A tool it wasn't granted is never offered to the model at all, rather than being offered and then refused. | Launch |
| CMP-005 | Readable, pinned references | Configs name prompts, tools and data sources by name and version, not by opaque ID, so a reviewer can read a change and understand it. | Launch |
| CMP-006 | Each version names the code it was tested against | Changing a prompt, model or tool creates a new config on the same agent code. Changing the flow itself requires new code and a new code version. | Launch |
| CMP-007 | Flow logic never moves into config | Routing, entry points and branching are never expressed in config. A genuinely new flow is an engineering change. Repeated shapes may later become reusable templates. | Launch |
| CMP-008 | Assemble before running | The agent is assembled and its parts bound before the turn begins. Running a turn takes only that turn's input and returns results. | Launch |
| CMP-009 | Assemble once, reuse | Target: assemble each released version once per server and reuse it across conversations. How much of this ships at launch is an open decision (DEC-007). | Target |
| CMP-010 | Simultaneous first requests share one assembly | If several first requests for a version arrive at once, the agent is assembled once and shared. A failed assembly is never cached or shared, so the next request tries again cleanly. | Launch |
| CMP-011 | Tools and flows ship with the service | Flow templates, tools and data sources ship inside the service and are looked up by name. They are code under review, not editable rows in a table. | Launch |
| CMP-012 | Translation is an optional step | Translation is a reusable step an agent can switch on. Agents that must not translate — address capture, for example — simply leave it out. | Launch |
| CMP-013 | Specialists exposed as tools | When a model must choose between a small set of specialists, each specialist is offered to it as a tool it can call. | Target |
| ENG-001 | One internal boundary | Platform, API and product code depend only on the platform's own interfaces, never on the underlying agent framework. Framework-specific code stays inside one adapter. | Launch |
| ENG-002 | One vocabulary for everything that happens in a turn | Whatever framework is underneath, a running turn reports the same short list of events: a message, part of a message, a tool call, a tool result, a pause for approval, an error, and done. | Launch |
| ENG-003 | One way to run a turn | Running a turn takes the turn's input and returns a stream of those events. Assembling the agent is a separate step. | Launch |
| ENG-004 | The adapter absorbs the difference | Each adapter maps its framework's streaming, tool-calling and resume behaviour onto platform events, and implements anything the framework is missing. | Launch |
| ENG-005 | Platform guarantees survive a framework change | User identity, conversation history, paused-turn storage, tracing, budgets, approvals and error types are platform-owned, so they do not change if the framework does. | Launch |
| ENG-006 | Two ways to resume a paused turn | A paused turn resumes either on a yes/no approval or on a result handed back from the client. Both are separate entry points that return the same stream of events. | Next |
| ENG-007 | A paused turn resumes where it paused | Paused-turn state belongs to the adapter that created it, so a paused conversation resumes on the same framework and build. Resuming across frameworks is not required. | Next |
| ENG-008 | Prove the swap | A production-shaped POC runs the same use cases and the same response contract on both Eino and Google ADK, with everything above the boundary unchanged. A new framework should be an adapter project, not a product rewrite. | POC |

### 3.3 Dispatch, Experiments, API, and Turn Identity

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| DSP-001 | Declare the experiments an agent takes part in | An agent version declares which experiments it depends on, so the platform knows what to resolve when a conversation starts. | Launch |
| DSP-002 | Decide once, at the start of a conversation | On a new conversation, ask the central experiment service once and map the answer to a released version. With no active assignment, use the agent's live default. | Launch |
| DSP-003 | Pin the version for the whole conversation | The chosen version is recorded on the conversation. Every later turn uses that exact version, prompt, model and tool set. | Launch |
| DSP-004 | If the experiment service is unavailable, default immediately | A slow or failed experiment lookup pins the default for the whole conversation. Do not retry on every turn. | Launch |
| DSP-005 | Record the exposure | The experiment, the variant, the chosen version and where the decision came from are recorded on the conversation and in the permanent record, so exposure can be joined to outcomes. | Launch |
| DSP-006 | A winning variant becomes the default the same way | Promoting a winner is the same pointer move as any other deploy. No separate mechanism. | Launch |
| DSP-007 | Ordinary deploys never disturb a live conversation | An ordinary deploy affects only new conversations; conversations in flight finish on the version they started with. Only a forced incident change overrides that. | Launch |
| API-001 | Call an agent by name | Running a turn is one endpoint addressed by the agent's name, not by a tenant ID or an internal identifier. | Launch |
| API-002 | Authenticate the calling service | The internal calling service authenticates with a tenant credential. That credential establishes which tenant it is, and it may only act for users belonging to that tenant. | Launch |
| API-003 | Every turn carries who it is for | Every turn carries the user's ID and type — consumer, supplier or internal. The platform adds tenant, conversation, request and language context. | Launch |
| API-004 | What a request contains | A request carries the conversation ID, the user's input, and whether the caller wants the answer streamed. Text at launch, with image or audio attachments where the chosen model supports them. | Launch |
| API-005 | One contract, two delivery modes | Waiting for the answer returns the complete ordered set of messages. Streaming sends the same sequence as it is produced. Product logic must never have to care which mode it is in. | Launch/Next |
| API-006 | Publishing endpoints | Registering a new version and promoting it are API calls under the named agent. | Launch |
| API-007 | Every turn has an ID | The server generates a unique, time-ordered ID for each turn, with no central ID service, so turns can be grouped by conversation and read in order. | Launch |
| API-008 | One turn at a time per conversation | Only one turn may run per conversation. Until talking-over is supported, a second turn is refused with a clear "try again" error; later it may replace the first. | Launch |
| API-009 | What happens on a retry | The caller's request ID is logged. A retry while the original is still running is refused; a retry after it finished is a new turn. Tool retry-safety rules prevent a duplicated real-world effect. | Launch |
| API-010 | Only the owner can resume | Before resuming a paused turn, confirm the authenticated caller and user own that conversation and turn. Knowing a turn ID is not permission. | Next |
| API-011 | Tenant isolation everywhere | Tenant identity applies to every config lookup, prompt resolution, conversation read or write, paused turn, trace, tool grant and permanent record. | Launch |

### 3.4 Runtime Execution and Control

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| RUN-001 | One turn, end to end | Take the input, establish who it is for, load the conversation's pinned version and history, assemble or reuse the agent, run the model-and-tool loop, translate if wired, send the messages, and save the completed turn. | Launch |
| RUN-002 | One runtime for fixed flows and open-ended agents | Both run on the same platform, and one agent may mix them. | Launch |
| RUN-003 | History lives outside the agent | Prior history is loaded from a shared store and new messages are appended after each turn. The agent holds no conversation state between calls. | Launch |
| RUN-004 | Any server can serve any turn | Servers hold no conversation state, so deploys drain traffic instead of dropping conversations. | Launch |
| RUN-005 | The model-and-tool loop | Keep going — model, tool call, result, model again — until the agent is done, fails, runs out of budget, pauses, or is interrupted. | Launch |
| RUN-006 | Independent tools run together | Tools the model asks for in the same step run in parallel up to a configured limit, while the messages the user sees stay in a single predictable order. | Launch |
| RUN-007 | Save what happened | Save the messages, how the turn ended, the version and code that served it, the experiment assignment, usage, timings and any errors. | Launch |
| RUN-008 | A turn cannot run forever | A time limit applies across all model and tool work in a turn. On exhaustion, stop the work where possible and return a clear timeout failure. | Launch |
| RUN-009 | A tool loop cannot run forever | A per-specialist cap on tool rounds stops a model looping on tools indefinitely. | Launch |
| RUN-010 | Everything is cancellable from day one | Every model call, tool call, translation step and adapter carries a cancellation signal from the start, even though user interruption ships later. Retrofitting this would mean rework. | Launch |
| RUN-011 | Talking over the agent | When built, interrupting is distinct from cancelling. The device stops the audio locally first; the server then stops the work in flight. | Next |
| RUN-012 | Cancelling cannot undo what already happened | If a tool has already committed a real-world effect, cancelling does not reverse it. Recovery depends on that tool being safe to repeat or having a compensating action. | Launch |
| RUN-013 | Every failure has a name | Gateway, provider, translation, tool, framework, approval-timeout, budget, cancellation and interruption failures each map to a defined failure type and a message the caller can see. | Launch |
| RUN-014 | Time every layer separately | Measure version lookup, history load, agent assembly, translation, gateway, each model call, each tool, message assembly and saving — separately, so a slow turn can be explained. | Launch |
| RUN-015 | Voice constraints at launch | While answers are returned complete rather than streamed, products keep replies to roughly 80–100 tokens and play a local filler line after about 1.5 s of silence. Both are provisional product rules, not platform constants. | Provisional |

### 3.5 Tools, Resources, Idempotency, and Pause/Resume

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| TLR-001 | Actions and information are different things | Anything that may change state is a tool. Read-only information is a data source. Grants, logs and traces keep the two distinct. | Launch |
| TLR-002 | Tools are registered in code | Tool and data-source implementations are registered in code by name and version. Config grants access to them; config never contains anything executable. | Launch |
| TLR-003 | Where a tool runs | A tool may run inside the service, through MCP, as an HTTP call, or on the client. Its registration decides which. | Launch/Next |
| TLR-004 | Sensible defaults, limited overrides | The tool's code declares its default timeout and retry policy. A specialist's grant may override permitted values such as timeout and whether approval is needed. Everything stays inside the turn's overall time limit. | Launch |
| TLR-005 | No general-purpose "call anything" tool | An HTTP tool must declare its exact method, address, inputs and expected response. A tool that can call arbitrary addresses — bypassing per-tool safety settings — is rejected at registration. | Launch |
| TLR-006 | Every call is identifiable | Every tool call carries a unique ID. For a tool that runs on the client, the same ID travels out and back so the result is matched to the right request. | Launch/Next |
| TLR-007 | Every tool declares whether it is safe to repeat | Each tool declares itself safe to repeat, safe with a key, or never repeatable. The platform uses this only when deciding whether a failed or replayed call may run again. Behaviour per class is in §4.4. | Launch |
| TLR-008 | Retry follows that declaration | A safe tool may be retried silently. A keyed tool is retried with the same key so the downstream service recognises it as the same request (Next). A tool that is never repeatable is not retried after an unclear failure; the failure is returned instead. | Launch/Next |
| TLR-011 | Replaying history never re-runs a tool | When a paused turn resumes by replaying what happened, recorded tool results are fed back in. A real-world action is never performed a second time. | Next |
| TLR-012 | Authority comes from the platform, never the model | Tools receive the user's identity from the platform. Any tenant, user or owner value the model produces is ignored unless independently verified. | Launch blocker |
| TLR-013 | Tools that run on the user's device | A client-executed tool is sent as an action with its call ID, and the turn waits until the product service or device returns a result or acknowledgement. | Next |
| PRS-001 | One kind of pause | A turn pausing emits the same event whether it is waiting for a person's approval or for a client-side result. | Next |
| PRS-002 | Two ways to resume | A yes/no approval and a result-bearing resume are separate entry points that continue the same turn and return the same events. | Next |
| PRS-003 | A pending approval must survive anything | Paused turns are stored durably, not in the short-lived conversation cache. A user's confirmed intent must not be lost to a cache failure. The stored state must contain everything needed to finish the turn. | Next |
| PRS-004 | Resume exactly once | Resuming is a single atomic step from pending to resumed. Only one caller can win. | Next |
| PRS-005 | Duplicate and conflicting decisions | The same decision sent twice returns "already done" and changes nothing. A contradictory decision after the fact returns a clear error. | Next |
| PRS-006 | Approval can outlive the conversation cache | A paused turn holds everything it needs, so it can be completed after the live conversation record has expired, starting a fresh record if necessary. | Next |
| PRS-007 | Keep resumed pauses briefly | A resumed pause is kept for about a day so late duplicates get a consistent answer, then archived with the conversation. | Provisional |
| PRS-008 | Read-only at launch | At launch, agents get read-only tools only, unless approval and per-user authorisation are complete and verified. | Launch blocker |

### 3.6 Typed Output, Streaming, and SDK

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| OUT-001 | Six kinds of message | An agent replies with six message types only: text, structured data, a client action, a progress update, turn framing, and an error. | Launch |
| OUT-002 | The set grows, it never breaks | New types may be added, never changed or removed. A consumer that meets a type it does not know ignores it and carries on. | Launch |
| OUT-003 | Every message is identifiable and ordered | Every message carries the turn it belongs to, its own ID, its position, and which specialist produced it. Position is assigned in one place — as messages go out — so order is never ambiguous even when several specialists and tools produce output at once. | Launch |
| OUT-005 | Waiting and streaming return the same thing | Waiting for the answer returns the same ordered messages as an array, with the same fields and the same ending, as streaming would have sent. | Launch |
| OUT-006 | Streaming sends the same messages sooner | Streaming emits messages and partial text as they become available, without changing what the messages mean. | Next |
| OUT-007 | Product payloads pass through untouched | Structured data and client actions are carried through exactly as the product produced them. The platform does not define or validate product-specific shapes; the producing agent and consuming product own that contract at both ends. | Launch |
| OUT-008 | Structured answers from the model are parsed against the prompt | When the model is asked to produce structured data, it is read using the shape declared on that prompt version. | Launch |
| OUT-009 | What happens when the model's answer doesn't fit | Decide whether a mismatch is handed back to the model to retry or ends the turn. Structured model answers do not ship until this is settled. | Open |
| OUT-010 | Every response ends deliberately | Every response ends with an explicit end, interrupted, or error. A connection that simply stops is a failure, not a success. | Launch |
| OUT-011 | Partial answers are not rewritten as successes | If something fails after part of the answer was sent, keep what the user already received and add a clear error. Never present it as complete. | Next |
| OUT-012 | Big payloads don't block the conversation | Keep streamed messages small. Send a reference for large data and let the product fetch it separately, so nothing else waits behind it. | Next |
| STR-001 | Choose the connection by what the turn needs | The choice is driven by whether the turn needs a channel back from the client, not by whether it is chat or voice. | Next |
| STR-002 | The three paths | Server-to-client turns, including most chat, use a one-way stream with reconnect support. Turns needing upstream audio, interruption or client-executed tools use a two-way connection. Internal hops use a schema-defined stream and are converted at the edge. | Next |
| STR-005 | A stream must survive quiet moments and network gear | Buffering and compression are off on streaming routes, idle timeouts are raised, and a keep-alive is sent roughly every 20 seconds during quiet periods. Otherwise the user gets nothing until the connection closes. | Next |
| STR-007 | Deploys drain, they don't cut off | On deploy, stop accepting new turns, let in-flight streams finish within a grace window, then exit, staggering reconnects. | Next |
| STR-008 | Reconnecting picks up where it left off | A short buffer of each turn's messages is kept outside the server, so on reconnect any server can resend what was missed, with duplicates removed by position. | Next |
| SDK-001 | The SDK is for internal services | The SDK ships for internal product services. Device apps never call the platform directly and stay free to use their own protocols. | Launch/Next |
| SDK-002 | The SDK absorbs the hard parts | Reconnect, replay, deduplication and ordering, detecting the end, handling an error after partial output, stall detection, and matching client-tool results are handled by the SDK, not by each consumer. | Next |
| SDK-003 | Old app versions must still work | Any new server capability needs a plain-text or existing-type fallback, because app capabilities reach users at app-update speed, not config speed. | Launch |
| SDK-004 | The streaming architecture is not decided | The proposed always-open-connection edge design is exploratory and needs its own POC before we commit. | Open POC |

### 3.7 Translation and LLM Gateway

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| TRN-001 | Translate at the edge of the agent | For an agent that opts in, the user's words are translated to English on the way in and the reply is translated back on the way out. | Launch |
| TRN-002 | The core works in one language | Inside the agent, prompts, model reasoning, search, memory and evaluation all work in English. Language quality then has exactly one place to fix. | Launch |
| TRN-003 | Keep both versions of the text | Traces and the permanent record hold both the original and the translated text, so a speech-recognition problem, a translation problem and a model problem can be told apart. | Launch |
| TRN-004 | Protect names | Brands, product names and addresses survive translation unchanged. Address flows may skip translation entirely and send the original text to the model. | Launch |
| TRN-005 | Count the translation time | Each translation hop is measured separately and included in the turn's timing breakdown. | Launch |
| TRN-006 | Which languages we launch with | The supported languages and the quality bar are a product decision, made before launch. | Open |
| TRN-007 | Translation can move to the device later | Keep the step replaceable, so it can retire if speech recognition on the device handles translation in future. | Deferred |
| GWT-001 | Every model call goes through the gateway | All model calls route through Meesho's LLM gateway. Tools and data sources do not. | Launch |
| GWT-002 | A thin connector per framework | A small connector speaks the gateway's protocol, reads back usage, and maps gateway failures onto platform failure types. | Launch |
| GWT-003 | Configs name gateway models, not providers | A provider change behind the gateway must not require a config change here, as long as the gateway's model name stays the same. | Launch |
| GWT-004 | We never hold provider keys | Provider credentials never appear in a config or on a server running agents. | Launch |
| GWT-005 | One place that knows what each model is | The gateway path resolves a model name to its provider, capabilities, pricing, context limit and whether it is being retired. Whether the gateway actually provides this must be confirmed by discovery. | Launch/Open |
| GWT-006 | Usage and cost on every call | Every model call returns tokens in and out and a computed cost, stamped with the pricing version used, so historical costs stay reproducible. | Launch |
| GWT-007 | Quotas per tenant | Per-tenant rate limits are enforced. On breach, return a clear rate-limit error immediately rather than silently queueing. | Launch |
| GWT-008 | Retry only when it is safe | Retry only when the connection failed or timed out before the model started answering. Never retry after generation has begun — that risks paying twice or sending a duplicate answer. | Launch |
| GWT-009 | Health per model | Latency and error rates are tracked per model and provider path. | Launch |
| GWT-010 | Failures are told apart | Quota, provider down, content filter, timeout, invalid request and gateway-internal failures are distinct in the platform's failure taxonomy. | Launch |
| GWT-011 | Watch for silent quality drift | Replay a fixed set of conversations per model on a schedule and alert when quality changes without any change on our side. | Post-launch |
| GWT-012 | Model retirement | Flag every config using a model being retired and produce a migration report before the provider shuts it off. | Post-launch |
| GWT-013 | Room for a backup model | Leave the hook for a pre-tested backup model, but do not run a second provider at launch. | Deferred |
| GWT-014 | Streaming through the gateway | Gateway streaming arrives with the platform's streaming phase. | Next |
| GWT-015 | Gateway discovery | Confirm protocol, usage fields, model naming, retirement signals, caller identity, failure types, quotas and health data before locking the implementation. | Open blocker |

### 3.8 Data Stores, Deployment, and Scale

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| DAT-001 | Configs in a relational database | Tenants, agents, draft versions, released versions and prompt versions live in a standard relational database. Versions are never edited in place. | Launch |
| DAT-002 | Whether we need our own model table | Keep the model as a name in config unless gateway discovery shows we need our own table for capabilities, cost, latency, context limits and retirement. | Open |
| DAT-003 | Live conversation history in a fast cache | Conversation history — and, in the streaming phase, the short replay buffer — lives in a highly available cache with a time limit, provisionally about an hour. | Launch/Next |
| DAT-004 | What a normal turn actually reads | A normal turn reads the conversation record. Config is fetched only when a version is first assembled and then reused; the experiment service is not called again. | Launch |
| DAT-005 | Pending approvals in durable storage | A paused approval or client-tool wait is stored durably, because a user's confirmed action must survive a cache failure. | Next |
| DAT-006 | A permanent record of every conversation | Every conversation is appended to a permanent, unchangeable log tiered to object storage. Serving never reads it. | Launch |
| DAT-007 | Analytics rebuilt from that record | Analytics, evaluation and journey views are derived from the permanent record, so a pipeline failure can be reprocessed rather than losing data. | Launch |
| DAT-008 | Servers hold nothing that matters | Agents run on interchangeable servers. Only code and assembled agents live in memory. | Launch |
| DAT-009 | Every conversation records what served it | Code release, agent code version, released config, prompt, model and tool references, and experiment assignment are stored with the conversation. | Launch |
| DAT-010 | Where we accept loss and where we do not | A conversation in flight may be lost in a rare cache failover. A confirmed approval or the permanent conversation record may never be lost. | Launch |
| DAT-011 | Old versions age out on their own | Assembled agents are cached per version, capped by size, and allowed to go cold as pinned conversations finish. No explicit cleanup step is needed. | Target |
| DAT-012 | What adding servers cannot fix | Adding servers handles our own compute. The real limits are the model providers' rate limits and the model bill; both are tracked as capacity constraints, not autoscaling problems. | Launch |

### 3.9 Trust, Safety, Privacy, and Operations

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| SEC-001 | Only the platform and the published config carry authority | The model, the user's words, the content it reads and the arguments it produces are all untrusted input. | Launch |
| SEC-002 | Tool results are data, not orders | Results returned by our own services are trusted as data but never treated as instructions that can change policy. | Launch |
| SEC-003 | Label where content came from | Content is labelled as seller-authored, Meesho-authored or user-generated before the model ever sees it. | Launch blocker |
| SEC-004 | Untrusted text stays boxed | Seller- and user-authored text sits in an explicit data block and can never grant permissions or alter the agent's instructions. | Launch |
| SEC-005 | One user can never reach another's data | The trusted user identity is bound into every tool and data-source call, and we must prove an agent cannot read or change another user's data — including under a deliberate prompt-injection attack. | Launch blocker |
| SEC-006 | Downstream services check ownership too | Downstream services enforce ownership themselves as a second line of defence. An identifier produced by the model is never sufficient. | Launch blocker |
| SEC-007 | A per-user cap from day one | A generous cap on turns per hour per user, from launch, so a public voice surface never becomes an unlimited free AI endpoint. Tuned with real data. | Provisional |
| SEC-008 | Legal sign-off before we store conversations | Storing raw conversations requires legal sign-off, plus defined access control, retention, deletion and audit obligations, even though the full privacy programme comes later. | Launch blocker |
| OPS-001 | One trace per conversation | One trace spans the whole multi-turn conversation — specialists, translation, model calls, tools, pauses and the messages sent. | Launch |
| OPS-002 | Traces feed evaluation too | The same conversation record serves operations and, later, evaluation. We do not build a second pipeline for launch. | Launch |
| OPS-003 | Cost we can act on | Usage and cost roll up by turn, conversation, agent, model and tool. From launch we watch cost against conversation length, but no user is ever cut off for cost. | Launch |
| OPS-004 | A cost ceiling, defined but switched off | A per-conversation cost limit exists as a switch, left off until data and an owner decide the value and whether it advises or enforces. | Open |
| OPS-005 | A clear floor when things break | When the gateway, model, translation or runtime cannot finish, return a clear failure marked retryable or not, and let the product choose what the user sees. | Launch |
| OPS-006 | Report our uptime honestly | Platform availability is reported separately from the availability of the model provider we do not control. Provider uptime is never presented as our guarantee. | Launch |
| OPS-007 | Keep every trace until it costs too much | Trace everything at launch. Reduce retention only when tracing cost crosses an agreed threshold, and even then keep errors, slow turns and conversations flagged by evaluation. | Deferred trigger |
| OPS-008 | No human takeover | An operator taking over a live conversation is out of scope for this phase. | Out of scope |

## 4. API and Data Contracts

### 4.1 Invocation Contract

One endpoint runs a turn, addressed by the agent's name. The tenant comes from the authenticated calling service; the request names the end user it is acting for.

`POST /v1/agent/{agent_name}/turns`

| Field | What it carries |
| :-: | :-: |
| `principal` | Who the turn is for: the user's ID and type (consumer, supplier or internal). |
| `session_id` | Which conversation this turn belongs to. |
| `input` | What the user said, plus any supported attachment. |
| `enable_streaming` | Whether the caller wants the answer streamed or returned complete. |

Every message in the response carries the server-generated turn ID.

**Contract note:** the Stage-2 POC addressed agents by tenant and internal ID. The name-based endpoint above is the target contract.

### 4.2 Agent Configuration Contract

This is the artefact a PM changes: which prompt, which model, which tools, and a few limits. It contains no flow logic — no routing, no branching, no ordering.

```json
{
  "tenant": "vaani",
  "agent": "vaani-shopping-assistant",
  "agent_variant": "v1",
  "agents": {
    "intent-classifier": {
      "prompt": {"name": "intent-classifier", "version": 31},
      "model": "gpt-4.1-nano-2025-04"
    },
    "response-agent": {
      "prompt": {"name": "response-agent", "version": 32},
      "model": "gpt-4.1-2025-04",
      "sampling": {"temperature": 0.4, "maxTokens": 800},
      "maxToolIterations": 4,
      "tools": [{"name": "search_products", "version": 5, "timeoutMs": 800}],
      "resources": [{"name": "catalog", "version": 7}, {"name": "order_state", "version": 3}]
    },
    "support-agent": {
      "prompt": {"name": "support-agent", "version": 12},
      "model": "gpt-4.1-2025-04",
      "tools": [
        {"name": "initiate_return", "version": 4, "timeoutMs": 3000, "approval": true},
        {"name": "cancel_order", "version": 2, "timeoutMs": 3000, "approval": true}
      ],
      "resources": [{"name": "order_state", "version": 3}, {"name": "return_policy_faq", "version": 5}]
    }
  },
  "tunables": {"turnBudgetMs": 8000, "maxConcurrency": 4}
}
```

Three things to read out of this example. The cheap classifier and the expensive responder are different models in the same agent. The classifier is granted no tools at all, so it cannot search. And both actions that change something real are marked as needing approval.

**Validation rule:** each building block declares which settings it accepts, and publishing checks the config against those declarations. Settings are values only; anything that decides flow stays in code.

### 4.3 Response Message Types

| Type | Purpose |
| :-: | :-: |
| text | What the agent says, tagged for voice or display. May arrive in pieces when streaming. |
| data | Structured, product-owned content to render — a product list, an order summary. |
| action | Something for the client to do: a one-way effect, or a request that expects a result back. |
| status | Progress, not content — "searching…". |
| control | Turn framing: start, keep-alive, end, or interrupted. The final one may carry usage. |
| error | A failure, with its category and whether it is worth retrying. |

### 4.4 Tool Descriptor and Retry Contract

| Field | Required Meaning |
| :-: | :-: |
| name + version | Stable identity in the code registry, referenced by config. |
| integration_mode | Where the tool runs: in the service, through MCP, over HTTP, or on the client. |
| idempotency | Safe to repeat, safe with a key, or never repeatable. Decides retry and replay behaviour. |
| timeout / retry defaults | Declared by the tool itself; a per-agent grant may override permitted values. |
| approval | Whether this action must pause for the user to confirm. |
| owner / status | A named owner, and whether the tool is active or retired. Retired versions stay resolvable. |

| Idempotency | What happens after an unclear failure | Example |
| :-: | :-: | :-: |
| safe | Retry quietly within policy — repeating it harms nothing. | search_products |
| keyed | Retry with the same key so the downstream service recognises the same request. | initiate_return |
| none | Never retry. Return the failure and let the user or product try again. | a non-idempotent legacy action |

### 4.5 Store Map

| Store | Holds | Technology Shape | Read While Serving? |
| :-: | :-: | :-: | :-: |
| **Config** | Tenants, agents, the live pointer, draft and released versions, prompts | Relational DB | Only on first assembly, then reused |
| **Runtime (hot)** | Live conversation history; streaming replay buffer | Highly available cache, ~1h provisional | Every turn |
| **Checkpoints** | Paused approvals and client-tool waits | Durable DB | Only on pause and resume |
| **Durable record** | Every conversation, permanent and unchangeable | Append-only log → object store | Never — offline only |
| **Derived warehouse** | Analytics, evaluation and journey views | Rebuildable warehouse tables | Never — offline only |

## 5. Experimentation Strategy

### 5.1 How will the platform be tested?

We will run today's Vaani experience on the new platform and compare stability, checking that business metrics stay broadly in range. This cannot produce a significant business-metric result, because the user-facing experience is deliberately the same. What we are testing is the platform underneath it.

### 5.2 Will this capability support experiments?

**Yes.** A variant is just an ordinary released agent version. The experiment layer only chooses between them; it introduces no new kind of thing to manage.

### 5.3 Experiment Type

Central user-level assignment, decided once at the start of a conversation and held for that whole conversation.

### 5.4 Variant Behaviour

| Variant | Experience |
| :-: | :-: |
| **Control / Default** | The conversation runs the agent's current live version. |
| **Treatment A** | The conversation runs the candidate version the central experiment service returned. |
| **Treatment B+** | More released versions can be mapped by the same service. We do not own the bucketing or the statistics. |
| **Experiment unavailable** | The conversation pins the default immediately and never switches later. |

### 5.5 Assignment Rules

1. Ask the central experiment service only when a conversation starts.
2. Map the answer to a released version; fall back to the live default if there is no mapping.
3. Record the chosen version and the experiment exposure on the conversation and in the permanent record.
4. Never move a user between variants mid-conversation.
5. Promote a winner by moving the live pointer. Conversations already running finish on their pinned version unless an incident override says otherwise.

## 6. Tech Solutioning

*[Prashant — please add relevant design links here]*

### 6.1 Key Implementation Decisions

| Decision | Why This Way | Undo Cost |
| :-: | :-: | :-: |
| **Adopt and self-host an open-source runtime** | Execution logic is hard-won; a managed product adds cost and cloud lock-in without giving us a capability we cannot run ourselves. | Low |
| **Start with Eino; keep Google ADK as the alternative** | Eino gives typed graphs in Go today and overlaps least with what the platform must own. The dual-engine POC keeps the reversal credible. | Low |
| **Own a minimal abstraction over the framework** | Keeps framework types out of product code, so a new framework is an adapter project rather than a rewrite. | Medium |
| **Behaviour and wiring in code; leaf bindings in config** | The two change at different rates for different reasons. Avoids both release-bound prompts and a home-grown JSON programming language. | Medium |
| **Immutable versions; one live pointer** | Deploy and rollback are a pointer move, and historical behaviour is exactly reproducible. | Low |
| **Prompts shared in a table; tools and data sources in code** | Prompts are PM-edited and shared. Tools and data sources need code review and structural permissions. | Low |
| **Translate once, inside the agent** | Language quality gets one attributable boundary, and prompts, search, memory and evaluation stay English-only. | Medium |
| **Stateless servers over shared stores** | Any server serves any turn, deploys drain cleanly, and each kind of state is stored according to how it is used. | High |
| **Launch with complete answers; stream later** | Streaming's failure modes deserve their own POC. Waiting for the answer is the same contract, aggregated. | Low |
| **Six message types; product-owned payloads** | Clients dispatch by type and ignore what they don't know, and the platform never becomes a schema registry for every product UI. | Medium |
| **Resolve experiments once per conversation** | Keeps the experience coherent and the experiment readable. Bucketing and statistics stay with the central service. | Low |
| **Every model call through the LLM gateway** | Keys, quotas, usage, cost and vendor churn are handled once. Pending gateway discovery. | Low |
| **Treat the model as untrusted** | Prompt injection arrives through content our own marketplace hosts, so authority must come from the platform and the published config. | High |

### 6.2 Runtime Flow

1. The request arrives and the calling service is authenticated; tenant and user identity are established.
2. The conversation's pinned version is read — or, if this is a new conversation, the experiment service is asked once and the answer pinned.
3. The agent for that version is assembled, or an already-assembled one is reused.
4. Conversation history is loaded from the shared store.
5. The agent runs: translate if wired, call the model through the gateway, dispatch tools carrying the trusted user identity, and pause for approval if required (Next).
6. Messages are assembled in order and returned — complete, or streamed as produced.
7. History is appended to the live store and the conversation is written to the permanent record.

### 6.3 Implementation Status

- A dual-engine POC exercised intent routing, product search, order tracking, an approval-gated action, a client-executed tool and a fixed address flow, all behind one platform boundary.
- Output above the boundary was identical on both frameworks, and the POC surfaced real edge cases: how a strict provider handles empty instructions on resume, and how a failed assembly behaves under simultaneous first requests.
- The in-process interfaces and the adapter boundary are proven. The network services, production stores, gateway connector, streaming transport and SDK, approval system and per-user authorisation design are still to be built or validated.
- Eino is a starting lean, not an irreversible commitment.

## 7. Logging Requirements

Each row is a question we must be able to answer, and the minimum data needed to answer it. Event names and transport formats are an implementation detail; the data must be queryable. Sensitive content follows the permanent-record privacy controls.

| Record / Span | When | Minimum Required Fields |
| :-: | :-: | :-: |
| **Turn** — what happened on this turn? | Turn accepted, rejected, completed, interrupted or failed | Tenant, user ID and type, conversation, turn, caller request ID, agent name, language, timestamps, how it ended |
| **Version choice** — why did this conversation run this version? | A version is pinned, or forced | Default or experiment, experiment and variant, released version, agent code version, force epoch |
| **Assembly** — was assembly slow or reused? | Agent assembly starts and ends | Config version, code version, adapter, cache hit or miss, duration, success or error. Failed assemblies are never cached |
| **Specialist** — which specialist handled this? | The agent enters or leaves a specialist | Specialist, parent agent, why it was routed there, input and output message IDs, duration |
| **Translation** — was the problem language or the model? | Each crossing in or out | Direction, original text, translated text, language, latency, model, error |
| **Model call** — what did this cost and how long did it take? | Every gateway call | Specialist, model and provider, prompt name and version, tokens in and out, cost, pricing version, latency, retries, failure type |
| **Tool call** — did the tool work, and for whom? | Dispatch and result | Name and version, call ID, where it ran, retry-safety class, timeout, approval, retries, latency, result or error, user context |
| **Approval** — who approved what, and when? | Pause, decision, resume, expiry | Pause, turn and call IDs, state change, decision or result, who decided, timestamps, duplicate or conflict outcome |
| **Message** — what did the user actually receive, in what order? | A message goes out | Turn, message ID, position, type, specialist, channel or name, payload metadata, ending phase |
| **Conversation record** — can we reconstruct this conversation exactly? | History append and archive | Exact versions, full messages, code version, trace ID, usage and cost, errors, retention and privacy attributes |
| **Deploy log** — who changed what is live? | The live pointer or a forced override changes | Agent, from version, to version, who, why, when, forced or not |
| **Metrics** — how is the platform doing overall? | Aggregated reporting | Latency by layer, model and tool; errors by type; cost per turn, conversation, agent and tool; conversation length; provider quota usage |

## 8. Dependencies, Open Decisions, and Blockers

| ID | Item | Decision / Work Required | Owner |
| :-: | :-: | :-: | :-: |
| BLK-001 | Per-user data authorisation | Design how tools declare what they touch, bind the trusted identity everywhere, make downstream services check ownership, and prove it holds under attack. Must close before launch. | Security + Platform |
| BLK-002 | Gateway discovery | Confirm the protocol, usage and cost fields, model naming, quotas, failure types, health data, retirement signals and streaming support. | Model Platform |
| BLK-003 | Conversation-record privacy | Legal sign-off, plus retention, access and deletion obligations for storing raw conversations. | Legal + Privacy |
| DEC-001 | Cost ceilings | Who sets limits per agent, tenant or conversation, when the limit is switched on, and whether it advises or enforces. | Product + Finance + Platform |
| DEC-002 | Launch languages | Which source languages we support and to what quality bar; validate protected names and added latency. | Product + Language |
| DEC-003 | Model table | Whether gateway data is enough, or we need our own table for model capabilities, cost, latency, context and retirement. | Architecture |
| DEC-004 | Observability backend | POC Langfuse against a self-hosted alternative on the platform's tracing seam. | SRE + Platform |
| DEC-005 | Structured-answer failures | Retry with the error, or end the turn — and what the retry limit is. | Product + Tech |
| DEC-006 | Streaming and SDK architecture | Validate the transport choices, proxy settings, replay store, drain behaviour, SDK state machine and the always-open-connection direction. | Platform |
| DEC-007 | Cold start and reuse | Measure assembly and model warm-up, and settle whether reuse is a launch or Next capability. Pre-warm only if the data demands it. | Platform |
| DEC-008 | Config governance | Today's logged promotion API is enough for one team. Define the review and approval model before self-serve or a second tenant. | Product + Platform |
| DEC-009 | Provisional timings | Confirm conversation cache lifetime (~1h), how long a resumed pause is kept (~1 day), keep-alive interval (~20s), silence filler (~1.5s), and voice reply length. | Tech + Product |
| DEC-010 | Backup provider | Define the trigger and the economics for a pre-tested backup model. Not needed at launch. | Architecture + Finance |
| DEC-011 | Old app versions | How product services find out what an old app can handle, and what text fallback they send instead. | Client Platform |

---

# Section III: Testing & Launch Checklist

## 1. Functional Testing

### 1.1 Authoring and Release Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-CFG-001 | Two tenants create an agent with the same name | Each resolves only for its own tenant. |
| TC-CFG-002 | Try to edit an existing prompt or config version | Rejected. A new version must be created instead. |
| TC-CFG-003 | Promote a draft version that passed evaluation | A new released version is created, recording the draft it came from. The draft is preserved. |
| TC-CFG-004 | Change a prompt, model, tool grant or creativity setting, then change only a timeout | The first needs full evaluation before release. The second needs only a smoke check. |
| TC-CFG-005 | Release a version whose agent code is missing on one server | Rejected until the code is deployed everywhere. |
| TC-CFG-006 | Reference another tenant's private prompt or tool | Publish rejected with an ownership error. |
| TC-CFG-007 | Release a version containing an approval-required action before approval exists | Publish rejected. |
| TC-CFG-008 | Move the live pointer forward, then back | New conversations use the chosen version; rollback completes in minutes and is logged. |
| TC-CFG-009 | Force a rollback twice in a row | Both forced events are processed distinctly, and each records who did it and why. |

### 1.2 Composition and Dispatch Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-CMP-001 | One agent has a classifier and a responder on different prompts and models | Each call uses exactly the prompt and model configured for that specialist. |
| TC-CMP-002 | The responder is granted the search tool; the classifier is not | Only the responder is ever offered the search tool. |
| TC-CMP-003 | Run a fixed address-capture flow | The fixed path runs; the model never chooses the order of steps. |
| TC-CMP-004 | Run an open-ended product-discovery agent | The model may call its permitted tools repeatedly until it is done or hits a limit. |
| TC-CMP-005 | Two first requests for the same version arrive together; then a first assembly fails transiently | One successful assembly is shared. A failure is not cached, and a later request retries and succeeds. |
| TC-CMP-006 | Start a new conversation during an active experiment, then continue it | The experiment service is called once and the version pinned. Later turns never re-resolve. |
| TC-CMP-007 | The experiment service is unavailable when a conversation starts | The conversation pins the default immediately and stays on it. |
| TC-CMP-008 | Deploy a new version while a conversation is in progress | The live conversation finishes on its old version; new conversations get the new one. |
| TC-CMP-009 | Force an incident update while older conversations are pinned | Those conversations are pulled onto the forced version. |
| TC-CMP-010 | Switch the POC suite from Eino to Google ADK | The same use cases and the same responses, with only the adapter changing. |

### 1.3 API and Runtime Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-RUN-001 | Call an agent with a valid tenant credential and user | The agent resolves inside that tenant, and the trace records tenant and user. |
| TC-RUN-002 | The request tries to claim a different tenant | Ignored. The credential is authoritative. |
| TC-RUN-003 | A second turn arrives while the first is running, including a retry of the same request | The second is refused with a clear "turn in progress" error. Nothing runs twice, and both attempts are linked in the logs. |
| TC-RUN-004 | Retry after the original turn finished | Treated as a new turn. Any real-world effect still follows the tool's retry-safety rules. |
| TC-RUN-005 | The second turn of a conversation lands on a different server | It loads the history and the pinned version, and the answer stays coherent. |
| TC-RUN-006 | The model asks for several independent tools in one step | They run in parallel within limits, and the user still sees messages in one predictable order. |
| TC-RUN-007 | A turn runs past its time limit, or a model keeps calling tools | Work is stopped and a clear failure is returned. No further tool calls. |
| TC-RUN-008 | Cancel a request while model or tool work is in flight | Cancellation propagates promptly, and an effect that already committed is not reported as undone. |
| TC-RUN-009 | The gateway, translation or framework fails | The caller gets a clear failure marked retryable or not. Never a hang. |
| TC-RUN-010 | Send a supported attachment, then an unsupported one | The supported one reaches a compatible model and is recorded. The unsupported one fails validation up front with a clear error. |
| TC-RUN-011 | Investigate a slow turn | The trace attributes time separately to version lookup, history, translation, model, tools, assembly and saving. |

### 1.4 Tool, Authorization, and Resume Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-TOL-001 | Each retry-safety class hits an unclear failure | Safe: retried quietly. Keyed: retried with the same key, and the downstream service treats it as one request. Never-repeatable: not retried, and the failure is returned. |
| TC-TOL-002 | A paused turn resumes by replaying what happened | Recorded tool results are fed back in. No tool runs a second time. |
| TC-TOL-003 | Register a tool that can call any address | Registration rejected. |
| TC-TOL-004 | A client-executed tool goes to the device and returns a result | The same call ID pairs request and result, and the turn resumes exactly once. |
| TC-AUT-001 | The model names a different user or order owner in its tool arguments | The trusted identity is used instead, and the downstream ownership check blocks the access. |
| TC-AUT-002 | A prompt injection asks a tool for another user's data | Blocked at the tool boundary and again downstream. The attempt is traced. |
| TC-PRS-001 | The model chooses an approval-required action | The turn pauses and is saved durably before anything happens in the real world. |
| TC-PRS-002 | The same approval is submitted twice | The first resumes the turn; the second returns "already done" and changes nothing. |
| TC-PRS-003 | A contradictory decision arrives after the first one completed | A clear conflict error. No state change. |
| TC-PRS-004 | The live conversation record expires while an approval is pending | The paused turn still resumes and completes into a valid record. |
| TC-PRS-005 | Try to resume a paused turn on a different framework or build | Rejected or routed back to the one that created it. Never reinterpreted. |

### 1.5 Output, Streaming, and SDK Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-OUT-001 | Send all six message types | The consumer handles each correctly. |
| TC-OUT-002 | Send a message type the consumer has never seen | It is ignored, and the rest of the turn — including the ending — still works. |
| TC-OUT-003 | Several specialists and tools produce output at once | Positions are unique and increasing in the order the user receives them. |
| TC-OUT-004 | A product's structured payload passes through the platform | It arrives exactly as produced. |
| TC-OUT-005 | The model's structured answer matches, then violates, the declared shape | A match is parsed and sent as expected. A violation follows the agreed policy — and this test blocks launch for structured model answers. |
| TC-OUT-006 | Ask for the answer complete rather than streamed | The same ordered messages arrive as an array, with the same ending. |
| TC-OUT-007 | A stream ends with no ending message | The SDK treats the turn as failed, not complete. |
| TC-STR-001 | A stream drops partway, then replays with duplicates and out of order | Reconnect resends what was missed from any server, and the SDK deduplicates and reorders. |
| TC-STR-002 | The model goes quiet for longer than the network's idle limit | The keep-alive holds the connection open and nothing is buffered up. |
| TC-STR-003 | Deploy while streams are active | Servers drain within the grace window, and no client sees a silent success. |
| TC-STR-004 | A large payload arrives while text and progress continue | A reference is streamed and the large fetch does not block smaller messages. |
| TC-SDK-001 | An old app cannot handle a new message type or client action | The product service falls back to text or an existing type. |

### 1.6 Translation, Gateway, Safety, and Operations Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-TRN-001 | A translation-enabled agent receives Hindi | It is translated to English, the agent runs, the reply is translated back, and both forms are recorded. |
| TC-TRN-002 | An address flow with translation switched off | The original text reaches the model directly, with no translation step in the trace. |
| TC-TRN-003 | Input contains brand, product and address names | They come through translation unchanged. |
| TC-GWT-001 | An agent tries to call a provider directly | Prevented, by architecture and code review. Every model call goes through the gateway. |
| TC-GWT-002 | A tenant exceeds its gateway quota | A clear rate-limit failure is returned immediately. |
| TC-GWT-003 | The connection fails before the model starts answering, then fails after it has begun | The first is retried within policy. The second is not — no double charge, and the partial answer and failure are handled explicitly. |
| TC-SEC-001 | Seller-authored content arrives without a provenance label | It is blocked from reaching the model. |
| TC-SEC-002 | Seller text contains "ignore your instructions" | It stays data and cannot change identity or tool permissions. |
| TC-SEC-003 | A user exceeds the per-user turn cap | That user gets a clear rate-limit outcome. No other user or tenant is affected. |
| TC-OPS-001 | Diagnose a bad production conversation | One trace gives the exact versions of config, code, prompt, model and tools, and the responsible layer is identified within the target time. |
| TC-OPS-002 | A conversation runs to many turns | Cost tracking reflects the growing history cost, and no user is cut off while enforcement is off. |
| TC-OPS-003 | The model provider is unavailable | A clear failure is returned, and provider-dependent availability is reported separately from ours. |

## 2. Launch Checklist

| Theme | Launch Requirement | Owner / Notes |
| :-: | :-: | :-: |
| **Architecture** | The platform boundary and adapter design are approved, and the reasons that would make us change framework are written down. | Architecture / Tech — TBD |
| **Engine POC** | The two-framework parity suite passes, including the simultaneous-request tests. | Platform — TBD |
| **Gateway** | Discovery is complete and the connector, quotas, usage and cost, model naming, failures and health data are signed off. | Model Platform — TBD |
| **Authorisation** | Per-user authorisation for tools and data is built and tested against deliberate attack. | Security / Platform — TBD |
| **Tenant auth** | Internal caller credentials and the rules for who a caller may act for are implemented. | Security — TBD |
| **Config schema** | Tenant, agent, prompt, draft and released version storage is built, with versions that cannot be edited. | Backend — TBD |
| **Publish gates** | Change classification, the evaluation hook, ownership checks, code-before-config and the approval dependency are all enforced. | Backend / Eval — TBD |
| **Promotion** | The live pointer, rollback, forced override and deploy log are verified. | Platform — TBD |
| **Runtime** | The complete-answer path, one-turn-at-a-time, request tracing, limits, cancellation and typed failures are verified. | Platform — TBD |
| **Session store** | The conversation cache, its lifetime, the history contract, tenant separation and failover behaviour are tested. | SRE — TBD |
| **Durable record** | The permanent conversation record, its access controls and the offline pipeline are in place. | Data Platform — TBD |
| **Privacy** | Legal and privacy sign-off for storing raw conversations, with retention, access and deletion defined. | Legal / Privacy — TBD |
| **Translation** | Launch languages, the quality bar, protected names and the latency budget are approved. | Product / Language — TBD |
| **Tools** | The launch tool set is read-only, with complete descriptions, strict HTTP validation, timeouts and retry-safety classes. | Tool Owners — TBD |
| **Output contract** | The six message types, the ending rules, ordering, payload policy and the SDK's complete-answer mode are frozen. | Platform / Clients — TBD |
| **Observability** | Conversation tracing, per-layer timing, exact versions, usage and cost, alerts and the on-call query path are live. | SRE / Analytics — TBD |
| **Rate limits** | Per-tenant gateway quotas and the per-user turn cap are configured, with clear errors. | Platform — TBD |
| **Reliability** | The availability runbook, provider-down behaviour and graceful deploy drain are verified. | SRE — TBD |
| **Evaluation dependency** | The launch evaluation gates and the rollback path are available. The deeper Evaluation KRD may follow separately. | Eval Platform — TBD |
| **Launch review** | Every blocker is closed, and every remaining open decision has an owner and a trigger. | Product + Tech — TBD |

### 2.1 Hard Launch Blockers

1. Per-user authorisation and downstream ownership checks, proven against prompt injection.
2. Gateway discovery complete, with every required behaviour either available or worked around.
3. Legal and privacy sign-off for storing raw conversations.
4. Provenance labelling on seller- and user-authored content before any of it reaches a model.
5. No state-changing or approval-required action in a released version until durable approval and resume are ready.
6. Every turn ends in a clear typed outcome, and every conversation has a complete trace.

## 3. Post-Launch Governance

| Area | Cadence / Trigger | Governance Action | Owner |
| :-: | :-: | :-: | :-: |
| **Conversation quality** | Weekly at first | Review sampled conversations and evaluation flags, and diagnose down to the prompt, specialist or tool. | Product + Eval |
| **Cost and conversation length** | Weekly / budget review | Track cost per conversation and against turn count, and decide when a cost ceiling is switched on. | Product |
| **Model health** | Per release and on a schedule | Watch latency and errors per model; add drift detection and retirement migration. | Model Platform |
| **Prompt and config ownership** | On publish, and quarterly | Check owners, retired items and stale versions, and watch for the point where self-serve governance is needed. | Agent Owners |
| **Tool safety** | On any tool change | Review the tool's description, identity binding, retry-safety class, approval class and downstream ownership check. | Security + Tool Owner |
| **Rate limits** | After traffic changes | Tune tenant and user caps using abuse, latency and quality data. | Platform |
| **Trace retention** | When the cost threshold is crossed | Move from keeping everything to keeping everything briefly plus flagged conversations long-term. | SRE + Privacy |
| **Streaming phase** | Before the Next release | Run the transport and SDK POC: buffering, replay, drain, ordering and client tools. | Platform |
| **Approval phase** | Before any state-changing action | Threat-model and load-test durable pauses, resume-exactly-once, expiry and replay. | Security + Platform |
| **Framework reassessment** | When ADK reaches parity in Go, or Eino falls short | Re-run the parity suite. Change only when the evidence beats the cost of switching. | Architecture |

---

# Section IV: Mentor Sign Off

| Function | Name | Status |
| :-: | :-: | :-: |
| **Product** | Ishan | Pending |
| **Tech / Platform** | TBD | Pending |
| **Architecture** | TBD | Pending |
| **Security / Privacy** | TBD | Pending |
| **Model Platform / Gateway** | TBD | Pending |
| **Analytics / DS** | TBD | Pending |
| **QA** | TBD | Pending |
| **SRE / Operations** | TBD | Pending |
| **Business / Pod** | TBD | Pending |

---

## Summary

Build Composition & Runtime as a multi-tenant platform where an agent's parts are named, versioned and changeable without a code release, and where every conversation can be explained afterwards.

1. Teams register named agents and create prompt and agent versions that are never edited in place.
2. The shape of an agent stays in code; the prompt, model, tools and limits stay in config, so a PM can change behaviour and an engineer owns the flow.
3. One agent can hold several specialists, each with its own model, prompt and strictly limited tools.
4. Fixed flows and open-ended agents run on the same platform, behind a boundary that keeps the underlying framework replaceable.
5. Going live and rolling back are one pointer move, and every move is logged.
6. Experiments are decided once per conversation and pinned, so a user never switches variant mid-sentence.
7. Every turn carries an authenticated caller and a trusted user identity, and only one turn runs per conversation at a time.
8. History lives outside the servers, so any server can serve any turn and a deploy never drops a conversation.
9. Every turn has a time limit and a tool-loop limit, and can be cancelled cleanly.
10. Tools are code, granted per specialist, and their authority comes from the platform — never from what the model says.
11. Launch ships read-only tools. Actions that change something real wait for durable approval and safe resume.
12. Every reply uses one set of six message types, identical whether the answer is streamed or returned complete.
13. Translation happens once at the edge, the core stays English-only, and both language versions are recorded.
14. Every model call goes through the LLM gateway, which owns keys, quotas, usage, cost and vendor churn.
15. Configs live in a relational database, live conversations in a fast cache, approvals in durable storage, and every conversation in a permanent record.
16. Every conversation is traced with its exact versions, per-layer timing and attributed cost — which is what makes 15-minute fault attribution possible.
