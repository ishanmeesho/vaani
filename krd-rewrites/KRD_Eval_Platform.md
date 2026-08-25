# KRD — Eval Platform

**Current Version:** v2 (language pass on v1 — no scope change)
**Current Status:** Under development
**Last Updated:** 25 August 2026
**POD:** Agentic Marketplace Platform
**Contributors:** PM: Ishan | Engineering: TBD | Architecture: TBD | Security: TBD | Data: TBD | Analytics: TBD
**Source Basis:** Agentic Marketplace Platform — Architecture, Part Three: Evaluation

---

# Section I: Executive Summary

## 1. Problem Statement

You cannot protect an agent with ordinary tests. Ask the same question twice and two different answers can both be right, so there is no expected string to compare against. "Correct" is a judgment across several things at once — is it factual, is it helpful, is it safe, is it in the right language, did it use the right tool, did it finish the job. And an agent can get worse without anyone changing a line of code, because the model changed underneath it or users started phrasing things differently.

So today we test in production. Vaani reads conversation dumps, rewrites prompts, and deploys straight to live. MAS can score an uploaded spreadsheet, but a person still picks the traces, reads the scores and works out what to change, every time, for every client. That leaves three holes: **nothing stops a bad change before users see it**, **a failure in production never becomes a test**, and **rare scenarios are never covered at all**.

The Eval Platform turns every conversation into evidence and closes the first two holes. A change that affects behaviour is replayed against a trusted set of test cases, in an isolated sandbox that cannot reach anything real. LLM judges score the results. A person reads the report case by case and decides whether the change may ship — and the release path will not accept a change that skipped this. After launch, a sample of real production conversations is scored continuously, and a bad one can be turned into a test case with one click, so the test set grows exactly where users actually hit problems.

The third hole — generating synthetic users to cover rare scenarios — is deliberately left for a later design.

Two things are true throughout and worth stating plainly. **No score ever changes production by itself**: judges inform a human decision, they do not make it. And **evaluation never touches anything real**: a replayed agent cannot cancel an order, because the sandbox it runs in has no route and no credential to do so.

## 2. NSM — Success & Check Metrics

### Primary Success Metric

| Metric | Definition |
| :-: | :-: |
| **Evaluation-gated behaviour-change coverage** | **100% of changes that affect behaviour** have a valid evaluation result and an explicit human approval before they can go live. The release path enforces this. It is not a checklist someone can skip under deadline pressure. |

### Secondary Metrics

| Metric | Definition |
| :-: | :-: |
| **Trace freshness** | A finished conversation is searchable within **1 minute at p99**. |
| **Common-query latency** | The everyday searches — by project, environment, conversation, config version, turn — return in **under 500 ms**. |
| **Model evaluation lead time** | A newly available model can be evaluated across every agent in about **1 week**, assuming the test sets and judges already exist. |
| **Offline self-service** | An authorised PM, ops reviewer or engineer can start an evaluation on any test set and any config version themselves, without a platform engineer running it for them. |
| **Run completeness** | A run counts only if every test case ran and every case that ran received every required score. Incomplete runs are excluded from comparisons rather than shown as partial results. |
| **Production feedback loop** | Badly scored real conversations are findable and can be turned into durable test cases, so the test sets grow where real failures happen. |

### Guardrail Metrics

| Metric | Definition |
| :-: | :-: |
| **Production isolation** | **Zero evaluation traffic reaches production data or production services.** A sandbox has no route and no credential to get there. |
| **Tenant isolation** | No tenant can read, edit, run, score or promote another tenant's traces, test sets, judges, reports or credentials. |
| **Evidence durability** | Once a trace is accepted it survives restarts and downstream failures. A dropped trace is treated as a platform failure worth paging for — because it silently removes a case from a report. |
| **Human control** | No score, offline or online, ever promotes, rolls back, throttles or blocks anything in production. |
| **Online safety** | Online evaluation informs and alerts. It never becomes a control loop over production. |
| **Reproducibility** | The same config, test set, mocked world, judge versions and run settings can be reconstructed after the fact. |
| **Cost attribution** | Judge and real-model spend lands on the project that owns it, because evaluation runs on that project's own model connection. |

---

# Section II: Product Requirement Document

## 1. User Stories and Capabilities

| Story ID | Persona | As a... | I want to... | So that I can... | Current Pain Point | Impact / Value if Solved |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| US-001 | Agent PM | agent owner | Run a candidate prompt, model, tool or code version against a trusted test set before release | See what improved and what got worse before users do | Changes ship blind, or get reviewed after the fact | Production stops being the test environment |
| US-002 | Ops reviewer | operations reviewer | Filter real conversations and turn one or many into test cases in the same sitting | Grow coverage from real failures instead of authoring cases from a blank page | Useful production evidence is anecdotal and gets lost | The test sets keep improving |
| US-003 | PM / Content | test-case owner | Edit the expected answer and the recorded world around it | Fix a bad production answer and still keep the case replayable | A minted case can preserve the wrong answer or stale dependency output | Curation becomes review, not authoring |
| US-004 | Eval author | evaluator author | Define several versioned judges with their own rubrics | Measure each quality dimension on its own | One overall score hides whether facts, tone, safety or language got worse | Reports say what got worse |
| US-005 | Non-developer reviewer | PM or ops user | Create test sets, run evaluations and read reports myself | Iterate without waiting on platform engineers | Manual pipelines add days to every change | Evaluation speeds iteration up instead of slowing it down |
| US-006 | Engineer | agent engineer | Run an unmerged branch or a draft config in a fresh isolated sandbox | Test a behaviour change safely before merging or promoting | Untested code otherwise needs a shared staging or production deploy | Code and config go through the same gate |
| US-007 | Engineer | agent engineer | Replay recorded tools, model calls and memory instead of calling the real thing | Hold the outside world still while the changed agent runs normally | Live dependencies make results flaky and can cause real side effects | Runs are repeatable and side-effect-free |
| US-008 | Reviewer | approver | Compare two runs side by side, case by case, and open the ones that regressed | Decide on evidence rather than on an average | Aggregate scores hide rare but expensive regressions | The decision is explainable and auditable |
| US-009 | Release owner | authorised release owner | Promote only a config that is linked to a valid approved run | Be certain no behaviour change skipped evaluation | Policy-only gates get bypassed under delivery pressure | The release path itself enforces the gate |
| US-010 | Quality owner | quality owner | Score a sample of live traffic continuously | Watch a release land, and catch drift before complaints arrive | A fixed test set cannot cover new phrasing forever | Quality monitoring continues after shipping |
| US-011 | Platform engineer | platform engineer | Instrument the orchestrator through one integration boundary | Get rich multi-project traces without spreading vendor-specific code | There is no official Go client, and direct integrations would spread everywhere | One replaceable seam |
| US-012 | Tenant admin | tenant administrator | Control who can view, edit, run and promote inside my tenant | Keep client data and release authority separate | MAS runs many external clients' agents at once | Proper tenancy and access control |
| US-013 | Platform on-call | on-call engineer | See the health of tracing, ingestion, runs, sandboxes, judges, storage and export | Find where evidence is delayed or lost | Client dashboards do not show platform machinery failing | Diagnosis before reports go quietly incomplete |
| US-014 | Data analyst | analyst | Query complete history in the data lake | Join agent quality to business outcomes | Interactive storage cannot hold billions of spans forever | Fast recent evidence and deep history coexist |
| US-015 | Security reviewer | security reviewer | Enforce that sandboxes hold no production credentials or routes | Stop a replayed agent taking a real action | Agent tools can change orders, addresses and money | An evaluation failure can never become an incident |
| US-016 | FinOps / Tenant | cost owner | See judge and real-model spend by project and config | Tune test-set size, judge count and sampling deliberately | Evaluation spend otherwise disappears into shared infrastructure | Spend is attributable and controllable |

## 2. Scope of Development

### 2.1 In Scope

1. A self-hosted **Langfuse v3** foundation inside the Meesho VPC, with its transactional database, analytics store, queue and object storage.
2. Mapping each tenant to an organisation and each agent to a project, with project-scoped keys, roles, environments, and a per-project model connection for judges.
3. One Go package that is the only place aware of the evaluation platform's wire format, so no product code is coupled to the vendor.
4. Traces from many projects out of one process, with bounded queues, batching, retries, visible drops, and a clean flush on shutdown.
5. A closed set of trace labels covering agent and config identity, node and span type, tool and prompt attribution, whether a call was mocked, experiment identity, usage, cost and errors.
6. Durable trace ingestion: keep the raw payload before acknowledging, process it off the caller's path, merge partial events, write in batches, and stop one noisy project starving the others.
7. Near-real-time trace exploration by environment, tenant, agent, conversation, user, config version, turn, node, and whether it was live or evaluation traffic.
8. Turning one trace — or a filtered selection of them — into test cases, with editable expected answers, recorded provenance, and the recorded world stored alongside.
9. Versioned LLM judges with rubrics, targeting rules, filters, sampling, delay, variable mapping, an on/off state, execution logs, and stored scores.
10. A judge builder that expands plain-language criteria once into visible, editable, versioned evaluation steps.
11. A stateless run coordinator with duplicate-trigger protection, run states, per-project concurrency limits, bounded per-case concurrency, retries, partial-run handling and teardown.
12. A fresh sandbox for every offline run: its own compute, empty stores, either the released image or a feature branch, and no production routes or credentials.
13. A read-only export of the exact config under test, sealed in transit, validated on arrival, executed exactly as named, with the resulting trace confirmed.
14. Per-case mocking of tools, model calls and memory, with a closed set of matching strategies.
15. Explicit stateful entities for tool families that write then read, including their starting state and their final state recorded on the trace.
16. Offline evaluation triggered from a test set, materialised from the experiment labels on ingested traces, and scored by the same judge machinery used online.
17. Run validity checks, side-by-side comparison, aggregates, threshold buckets, a list of what regressed, and drill-down to the full trace.
18. A human pass/fail verdict and a promotion gate that records who, when, which config and which run — and that the ordinary release path cannot bypass.
19. Online evaluation on filtered, sampled live traffic with reference-free rubrics, quality trends, saved failure filters, and one-click test-set enrichment.
20. Two tiers of memory: recent evidence kept interactive, and complete history exported incrementally to the data lake.
21. Monitoring and alerting across tracing, ingestion, storage, judges, runs, sandboxes, exports, service health, and any loss of evidence.
22. Capacity and resilience work for roughly **20,000–25,000 spans/s** and **4,500–6,000 judge evaluations/s** at the stated target load.

### 2.2 Out of Scope

1. Synthetic-user simulation — generating personas and scenarios. It needs its own design.
2. Multi-turn replay where a model has to play the user across several turns. Launch test cases exercise one turn.
3. Code-based scorers. Launch supports LLM judges only.
4. Any automatic production action from a score: no auto-promotion, auto-rollback, throttling or incident response.
5. Using online evaluation as a release gate. Online is monitoring and enrichment only.
6. An automated review queue for bad conversations, an automatic test-set refresh cadence, or scoring how stale a test set is.
7. A complete judge-calibration product: agreement thresholds against human review, and re-calibration after a judge changes.
8. Automatically inferring that several tools share state. That stays an explicit declaration by the owner.
9. Replacing the vendor's UI, test-set entities, evaluator entities, reports or query surfaces with our own.
10. Forking or modifying the vendor's core. We integrate only through public APIs and designed extension points.
11. Managing agent prompts in the evaluation platform. Agent prompts stay in the orchestrator; the platform stores judge prompts only.
12. Any production call from a sandbox. A dependency can be real only through a specifically configured non-production route.
13. A final retention period for the interactive store, before real production volume is measured.
14. A finished deletion workflow for personal data copied into test cases and lake history. This is a known risk needing its own privacy design.
15. Final answers on queue priority between online and offline judging, separate evaluation model quotas, payload size limits, and where recordings are stored.

### 2.3 Phase Scope

| Phase | Included Capabilities | Explicitly Not Yet Included |
| :-: | :-: | :-: |
| **P1 — Foundation** | Self-host the platform; provision its stores; deploy role-separated web and worker services; set up organisations, projects, roles, keys, backups and baseline health. | No agent traces, no run coordinator, no recorder, no promotion gate, no lake pipeline, no simulation. |
| **P2 — SDK & Traces** | Build the integration package; multi-project clients; trace primitives; the label contract; experiment stamps; metrics; and integrate tracing into the orchestrator. | No end-to-end offline runs until the orchestrator's eval endpoints and the sandbox exist. |
| **P3 — Offline Execution** | Build the run coordinator; freeze the eval endpoints; provision and seed sandboxes; replay mocks; execute test sets; materialise and judge runs; validate completeness; tear down and recover. | Self-service recorder, judge builder, online templates, final gate experience and long-term export are not yet complete. |
| **P4 — Self-Service, Gate & Online** | Trace-to-test-case recorder; judge builder; reports; human pass/fail; promotion enforcement; online evaluators; the production-to-test-case loop. | Simulation, automated enrichment, automatic promotion and code scorers stay out. |
| **P5 — Data & Operations** | Scheduled per-project export; lake ingestion; a measured retention window; full dashboards, alerts, capacity testing, backups and on-call runbooks. | Long-horizon risks and deferred automation stay outside launch unless separately prioritised. |
| **Later / Separate Design** | Synthetic-user simulation, multi-turn replay, judge calibration, automated enrichment, advanced prioritisation, and the privacy and deletion workflow. | Nothing here is committed by this KRD beyond keeping the seams compatible. |

## 3. Functional Requirements

Each row is a requirement. **P1–P5** map to the phases above. **Later** is deferred. Where the source gave a number it is kept; where it gave only a direction, the requirement stays qualitative rather than inventing a target. The Go interface, label names, mock format and store layout live in §4, where they are the contract.

Open decisions are not listed here. Where a requirement depends on a value we have not set yet, the row states the behaviour we are committing to and names the decision in §8. §8 is the single place to look for what still needs deciding.

Each sub-section opens with what a PM actually owns in it. Four of the twelve are yours almost entirely; in the rest you own little or nothing — skim those.

### 3.1 Platform Foundation, Tenancy, and Access

**What you own here:** who in your tenant can view, edit, run and promote (FND-010). Everything else is infrastructure.

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| FND-001 | Everything stays inside our own network | The platform is deployed entirely inside the Meesho VPC. No production conversation ever leaves approved infrastructure to be evaluated. | P1 |
| FND-002 | Pin the version we reviewed | The deployment is pinned to a reviewed version. Moving to a new major version is its own reviewed change, and nothing here may depend on functionality that is not open and generally available. | P1 |
| FND-003 | The four stores | Provision a transactional database for entities, an analytics store for traces and scores, a queue, and object storage. Layout is in §4.8. | P1 |
| FND-004 | One workload cannot starve another | Run separate deployments for trace ingestion, the admin UI, ingestion workers, judge workers and export workers. | P1 |
| FND-005 | Everything scales by adding replicas | No web, worker or run-coordinator process holds unique durable state. | P1 |
| FND-006 | A tenant is an organisation | Each tenant maps to one organisation, whose membership and roles govern it. | P1 |
| FND-007 | An agent is a project | Each agent maps to one project, and the project is the hard boundary for keys, traces, test sets, judges, scores and dashboards. | P1 |
| FND-008 | Live and evaluation traffic are separable | Production and evaluation are environments inside the same project, and every trace can be filtered by which it was. | P1 |
| FND-009 | The credential decides the destination | Credentials are project-scoped, and the credential used at ingestion decides which project the data lands in. A caller cannot claim a different project in the payload. | P1 |
| FND-010 | Four distinct permissions | View, edit, run and promote are separate permissions. An unauthorised user cannot get in through a shared link, an API, an export or a dashboard. | P1 |
| FND-011 | Each project brings its own model | Judge model connections and credentials are held per project, so every tenant picks its own provider and owns the resulting spend. | P1 |
| FND-012 | Secrets live in the secret store | Project keys, model credentials and sandbox credentials are injected from the approved secret store, and never written into configs, test-case metadata, traces or logs. | P1 |
| FND-013 | One tenant's query never scans another's data | Every analytics table and common query is keyed by project first. | P1 |
| FND-014 | Public APIs only | All our own code integrates through the platform's public APIs or its designed extension points. **Forking the platform's core is prohibited** — it would make every future upgrade a migration. | P1 |
| FND-015 | An open standard at the front door | Traces arrive over OpenTelemetry, so agents never emit a format specific to one evaluation vendor. | P2 |
| FND-016 | Be honest about the coupling | Document plainly that ingestion is vendor-neutral while test sets, evaluators, reports and the operational UI are deliberately vendor-specific. That trade is intentional (see §6.1). | P1 |

### 3.2 Go SDK and Trace Contract

**What you own here:** nothing — this is the engineering seam. One row matters to you: SDK-020, because a dropped trace means a report is quietly missing a case.

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| SDK-001 | One package knows the vendor | Exactly one package knows the platform's wire format and endpoints. Everything else depends only on its Go surface, and no caller may make its own HTTP calls to the platform. The surface is in §4.2. | P2 |
| SDK-002 | Built on the open standard, with no global state | Every client is built from an OpenTelemetry tracer provider and exporter, and owns its own — nothing installs process-wide global state. | P2 |
| SDK-004 | Many projects, one process | A concurrency-safe registry keyed by project lets one orchestrator process emit to many projects with different keys. A client is created on first use, and simultaneous first requests collapse into one creation. | P2 |
| SDK-006 | Safe when tracing is off | With no credentials configured, the client is a safe no-op, so host code traces unconditionally and never needs an "if tracing is enabled" branch. | P2 |
| SDK-007 | Three primitives | The SDK offers a span for work with a duration, a generation for a model call (with model, parameters, prompt reference, token usage and status), and an event for a point in time. Signatures are in §4.2. | P2 |
| SDK-010 | Nesting comes from the context | Parent and child relationships derive from the context the SDK returns. Reusing an older context is a bug, and must be detectable in tests and in trace review. A span is only exportable once ended, so ending it is the standard pattern the examples and lint rules enforce. | P2 |
| SDK-012 | Expose the trace ID | The current trace ID is available, so the run coordinator can confirm a case's evidence actually arrived before it tears the sandbox down. | P2 |
| SDK-013 | Identity belongs on the root | User, conversation, tags, environment, tenant, agent, config version, code variant and run kind are stamped on the root span. Nothing may rely on a child span alone carrying trace identity. | P2 |
| SDK-014 | Attributes that make a trace readable | Inputs, outputs, metadata, status, level, model, prompt, usage and errors are encoded as the attributes needed to materialise traces. Where a concept is standard, stamp both the platform's attribute and the standard one, so the trace stays useful in other tools. | P2 |
| SDK-016 | A closed label vocabulary | The agent labels in §4.3 are stamped by runtime-owned code only. Product code cannot invent labels the recorder and evaluator machinery depend on. | P2 |
| SDK-017 | Say whether a call was real | On evaluation calls, stamp whether a mock answered and how, so report drill-down shows which dependencies were real, replayed or stateful. | P3 |
| SDK-018 | Experiment identity on every span | One call stamps the run, config version, test set, case, expected answer and root-span pointer on the root and every span beneath it. Fields are in §4.4. | P2 |
| SDK-019 | A bounded queue | The in-memory queue is bounded. Starting defaults are **2,048 queued spans**, **512-span batches**, a **5-second flush** and a **30-second export deadline** — all configurable. | P2 |
| SDK-020 | Loss is always visible | A full queue or a permanently failed export increments a per-client drop counter. Any sustained drop, and any drop at all during an evaluation run, raises an alert — because a dropped span silently removes a case from a report. | P2 |
| SDK-021 | Flush everything on shutdown | On shutdown: stop accepting work, drain what is in flight, then flush and close **every** active client before the process exits. | P2 |

### 3.3 Ingestion, Storage Write Path, and Trace Query

**What you own here:** the filters you will actually search by and the dashboards you will read (QRY-002 through QRY-007). The write-path rows above them are mechanism.

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| ING-001 | Authenticate every trace | Every ingestion request is authenticated with a project key. Unauthenticated, invalid and cross-project credentials are rejected. | P1 |
| ING-002 | Keep the raw payload before saying yes | The raw event is written to object storage before it is acknowledged, so any later failure can be retried from the original. | P1 |
| ING-003 | Do the work off the caller's path | Only a lightweight reference is queued. Conversion and analytics writes never happen on the caller's request. | P1 |
| ING-004 | Eventually consistent, and honest about it | Acknowledge once the raw copy is durable and the reference is queued. Consumers must therefore use the configured ingestion delay before reading a trace. | P1 |
| ING-005 | Merge the pieces | Partial start, update and end events for the same observation merge into one latest record before anything reads it. | P1 |
| ING-006 | Convert in the worker | Open-standard spans become native trace and observation records in the worker pipeline, not on the request path. | P1 |
| ING-007 | One noisy project cannot starve the rest | Primary and secondary queues keep abnormal payloads or sustained volume from one project away from everyone else. | P1 |
| ING-008 | Write in batches | Finished records are buffered and inserted in batches on a size or time threshold. Never one database operation per span. | P1 |
| ING-009 | Late updates append, they don't mutate | A late update is a new row, resolved by latest-wins on read, rather than an in-place edit. | P1 |
| ING-010 | A restart never loses accepted data | A restart at any stage — web, worker, queue, writer — loses nothing, replaying from the durable raw copy where needed. | P1 |
| QRY-001 | Freshness | A finished trace is searchable within **1 minute at p99**. | P2 |
| QRY-002 | The filters people actually use | Project, environment, agent, conversation, user, config version, turn, run kind, tags, node and time range. | P2 |
| QRY-003 | The whole tree, in order | Opening a trace shows the ordered tree of model, tool, memory and agent steps with inputs, outputs, latency, usage, errors, prompt version and whether each call was mocked. | P2 |
| QRY-004 | Read the whole conversation | Traces group by conversation, so a reviewer can read the full context while still seeing turn-level evidence. | P2 |
| QRY-005 | Traffic dashboard | Volume, latency and error trends by project, agent, config version, environment and run kind. | P1 |
| QRY-006 | Cost dashboard | Token usage and money by trace, model, project, config version, and evaluation-versus-live traffic. | P2 |
| QRY-007 | Quality dashboard | Judge-score trends and drill-down, on the same filters. | P4 |
| QRY-008 | Query latency | Common trace and dashboard queries return in **under 500 ms** across the interactive window. | P5 |

### 3.4 Dataset and Test-Case Management

**What you own here:** all of it. This is your test set — what goes in, what the right answer is (DST-005), and catching the case where a production mistake got copied in as the expected answer (DST-015).

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| DST-001 | Turn one conversation into a test case | An authorised user can add any eligible trace to a named test set, straight from the trace explorer. | P4 |
| DST-002 | Or a whole filtered selection at once | A filtered set of traces becomes test cases in one operation, through exactly the same conversion. | P4 |
| DST-003 | Capture the input | The trace's input is copied into the case in a form the sandbox can execute. | P4 |
| DST-004 | Start the expected answer from what happened | The expected answer is initialised from the recorded output and is editable without changing the case's identity or provenance. | P4 |
| DST-005 | A bad answer is still a good test case | A conversation chosen *because* the answer was wrong is a valid candidate. The owner replaces the expected answer with the right one. This is the main way the test set grows. | P4 |
| DST-006 | Record where it came from | Every minted case stores its source trace, project, environment, config version and creation time. | P4 |
| DST-007 | Record the whole world around it | Walk the trace's labelled steps and write every tool, model and memory call — input, output, order, node and surface — into the case's recorded world. | P4 |
| DST-008 | Record everything, decide later | The recorder captures every available call and decides nothing about how the case will run. Mock, real or stateful is chosen afterwards. | P4 |
| DST-009 | Fail loudly on a bad trace | If the required labels are missing or ambiguous, minting fails visibly rather than writing a case that cannot be replayed. | P4 |
| DST-010 | Test sets outlive their sources | Test sets and cases stay durable, owned and runnable regardless of what happens to the trace they came from. | P4 |
| DST-011 | A test set belongs to one agent | A test set and its cases belong to one project and cannot cross a tenant boundary without an explicit governed export. | P4 |
| DST-012 | Case definitions are versioned | Changes to the expected answer, mock strategies, rules or stateful declarations are durable and auditable, so a later run can reconstruct the definition that was used. | P4 |
| DST-013 | Run it immediately | After creating or editing a test set, an authorised user can start a run in the same workflow, with no engineering handoff. | P4 |
| DST-014 | Not text-only | Case input, expected answer, metadata and stored artefacts must accommodate image and audio references without a schema redesign. | P4 |
| DST-015 | Show the inherited answer | During curation the UI must make the inherited expected answer visible, so an owner notices when a production mistake has been copied into the test. | P4 |
| DST-016 | Expiring old traces never breaks a test case | Dropping an old partition of trace data cannot delete or invalidate a case minted from it. | P5 |
| DST-017 | Watch how big recordings get | Measure recorded-world size per case and per project, so growth is visible before it becomes a storage problem. The migration trigger is DEP-020. | P5 |

### 3.5 Evaluators, Judge Authoring, and Score Configuration

**What you own here:** all of it. This is where you define what "good" means for your agent. The two rows that decide whether reports are useful: one dimension per judge (JDG-012), and judge only what the trace actually contains (JDG-013).

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| JDG-001 | Tenants define their own quality | Each project defines any number of LLM judges. The platform does not decide what "good" means for someone else's product. | P4 |
| JDG-002 | A judge is a "when" and a "how" | An evaluator is **when** it fires — what it targets, its filters, sampling, delay and on/off state — plus **how** it judges: a versioned template and its variable mapping. | P4 |
| JDG-003 | Target test-set runs | An evaluator can target evaluation traces, optionally restricted to one test set. | P3 |
| JDG-004 | Target live traffic | An evaluator can target production traces using the agent labels and metadata filters. | P4 |
| JDG-005 | Sampling | Sampling is configurable per evaluator. Offline is normally every case; online sampling is the tenant's cost dial. | P3 |
| JDG-006 | Wait for the whole trace | A configurable delay ensures the fully ingested trace is available before judging. | P3 |
| JDG-007 | An evaluator can exist without firing | On and off are explicit in both the UI and the API. | P3 |
| JDG-008 | Judge prompts are versioned | The judge template is a named, versioned prompt. Changing a rubric creates a new reviewable version — otherwise scores from different weeks are not comparable. | P4 |
| JDG-009 | Explicit variable mapping | Input, output and — for offline cases — the expected answer map into named template variables. | P3 |
| JDG-010 | The project's own model | The judge runs on the project's configured model connection and credential, never on a shared platform key. | P3 |
| JDG-011 | LLM judges only at launch | Code-based scorers are not exposed as a committed capability. | P4 |
| JDG-012 | One dimension per judge | Guidance must push separate judges for factuality, helpfulness, language, tone and safety — anything separately actionable. A single blended score cannot tell you what to fix. | P4 |
| JDG-013 | Judge only what the evidence contains | A rubric must not require facts the trace does not hold — downstream satisfaction, for instance. | P4 |
| JDG-014 | Reference-aware offline, reference-free online | Offline judges may use the expected answer. Online judges cannot, because there isn't one. Applying a reference-dependent rubric online must be blocked or clearly warned. | P4 |
| JDG-015 | The judge builder | Take a task, criteria and a scale; expand the criteria once into ordered evaluation steps; and save those steps in the template. The generated steps must be visible, editable and versioned before the evaluator can be switched on — a hidden generated rubric is not reviewable. | P4 |
| JDG-017 | Other rubric patterns work too | Alternative judge-prompt patterns run on the same evaluator and template machinery. They are authoring styles, not separate systems. | P4 |
| JDG-018 | Judge failures are never silent | Completed and errored jobs are visible with trace, evaluator, model, latency, parse result and failure reason. A missing score must always be explainable. | P3 |
| JDG-019 | Judges do not judge judges | The platform's own judge traces are excluded from matching, so judging cannot trigger more judging. | P3 |
| JDG-020 | Rules fire forward, not backward | Make clear that an evaluator only fires on traces arriving after it was activated, and provide the batch re-evaluation path for traces already stored. | P4 |
| JDG-021 | Leave room to prove a judge is trustworthy | Reserve space on a judge for calibration status and evidence of agreement with human review, so adding it later is not a schema change. Until the workflow exists (DEP-014), judge trust is an assumption, not a measurement — and reports should be read that way. | P4 |

### 3.6 Offline Sandbox, Bundle, and Eval Plane

**What you own here:** nothing except the sign-off in DEP-001. Read it anyway once: this isolation is the reason an evaluation run cannot cancel a real customer's order.

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| SBX-001 | A fresh sandbox for every run | Every offline run gets a new isolated environment with its own agent image and empty stores. | P3 |
| SBX-002 | Its own capacity | Sandboxes run on dedicated compute, so evaluation load never competes with serving production users. | P3 |
| SBX-003 | Config-only change: use the released build | A prompt, model, tool-grant or config change runs on the latest released agent build. | P3 |
| SBX-004 | Code change: use the branch | A code or wiring change runs on the requested feature branch. Untested branch code never needs a production deploy to be evaluated. | P3 |
| SBX-005 | An empty world | Start with empty stores, seeded only from the exported bundle. No production records and no residue from a previous run. | P3 |
| SBX-006 | No production credentials | Production service credentials are never injected into a sandbox. | P3 |
| SBX-007 | No production routes | Network policy prevents the sandbox reaching the production data plane or any production service. | P3 |
| SBX-008 | Only the credential needed to leave evidence | Inject only what is required for traces to reach the durable evidence store. | P3 |
| SBX-009 | Model access when a call is meant to be real | The approved model gateway is reachable when a surface is configured real, using evaluation-specific credentials and quotas once that policy is settled. | P3 |
| SBX-010 | Real means an approved non-production route | A real dependency call succeeds only through a route explicitly configured to an approved non-production instance. A missing route fails loudly rather than falling through. | P3 |
| SBX-011 | Export exactly what is under test | A read-only operation on the production side exports the exact config under test, plus every pinned prompt version and the tenant and agent records it needs. | P3 |
| SBX-012 | The bundle must be self-contained | Every reference the config needs resolves from the bundle plus the sandbox's own code build. Nothing may be fetched later. | P3 |
| SBX-013 | Prove it wasn't altered | The bundle carries a deterministic hash. Startup recomputes it and rejects any mismatch before anything runs. | P3 |
| SBX-014 | Sealed in transit | The run coordinator carries the bundle without opening, changing or interpreting it. | P3 |
| SBX-015 | Validate before seeding | Startup validates the hash, the tenant, agent and config identity, the prompt references, the availability of the code variant, and the schema — before seeding any store. | P3 |
| SBX-016 | Each endpoint in its right place | Bundle export is served only by the approved read-only production path. Startup and execute are served only by sandbox deployments, never by a production serving instance. | P3 |
| SBX-017 | Run exactly the named config | The execute request names the config version. The sandbox skips the usual experiment and default resolution, but otherwise uses the same agent-building and turn machinery as production — otherwise the result would not be evidence about production. | P3 |
| SBX-018 | Complete experiment identity or none | Accept a complete experiment identity block or none at all. Partial identity is rejected before execution, because a partly identified trace cannot be matched to its run. | P3 |
| SBX-019 | Return the trace ID | Every successful case returns its root trace ID, so the coordinator can confirm the evidence arrived. | P3 |
| SBX-020 | Production can never replay mocks | The production runtime must never be able to take the mock-replay path. It is enabled only by a sandbox deployment and a validated evaluation request. | P3 |
| SBX-021 | Tear down only after evidence is safe | The sandbox is destroyed only once its traces are confirmed durable. A teardown failure leaves cleanup debt, never lost evidence. | P3 |

### 3.7 Mock Recording, Replay, and Stateful Test Worlds

**What you own here:** which dependencies run for real and which are replayed (MCK-010, MCK-013), and the maintenance cost in MCK-022 — when your agent takes a new path, someone has to update the recorded world and the expected answer.

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| MCK-001 | Recorded in the shape of the agent | Recorded calls are stored under the same node and surface tree as the agent itself, so a reviewer can line the test world up against the trace and the config. | P4 |
| MCK-002 | Record every call on the path | Every tool call, model call and memory fetch on the executed path is recorded with its input, output, order, node and call site. | P4 |
| MCK-003 | Mocks serve, judges judge | A mock exists only to let execution continue. Whether the agent called the tool with the *right* arguments is judged later, from the trace. The two must never be conflated. | P3 |
| MCK-004 | Four ways to match a recorded call | *Static*: one recorded answer, returned regardless of input. *Sequence*: repeated calls answered in recorded order. *Exact*: answer selected only on an exact input match. *Contains*: answer selected when configured keywords appear. Format in §4.5. | P3 |
| MCK-008 | A closed set, deliberately | Launch supports exactly those four. No fuzzy similarity and no hidden thresholds — a test that matches approximately is a test that fails unpredictably. | P3 |
| MCK-009 | Configured per surface | Mode and strategy are stored per tool, model or memory surface in the durable case definition. | P4 |
| MCK-010 | Real mode | A run can mark a surface real by omitting its mock from execution, while the recorded data stays on the case for later. | P3 |
| MCK-011 | The same choice across the whole run | A surface's real-or-mock choice applies uniformly across the run, so results stay comparable between cases. | P3 |
| MCK-012 | Never fall back to production | If a real surface has no approved non-production route, the case fails. No falling back to production, and no silently using a stale mock. | P3 |
| MCK-013 | Document the usual recipe | Tools and memory mocked, the model real, is the common recipe. Document it as guidance, not as a platform rule. | P4 |
| MCK-014 | Stateful entities | The orchestrator can register code-defined entities that declare which related tools they own and how reads and writes change their state. | P3 |
| MCK-015 | A declared starting state | Each stateful entity has an explicit starting state stored on the case. | P4 |
| MCK-016 | The entity owns its tools | When an entity claims a tool family, those replay mocks are omitted and every claimed call routes to the entity. | P3 |
| MCK-017 | Record the final state | Each entity's final state is written onto the trace, so a judge can score the change the agent actually made — not just what it said. | P3 |
| MCK-018 | All or nothing per entity | Every tool an entity claims behaves consistently. An entity is stateful together or real together, never a mixed world. | P3 |
| MCK-019 | Shared state is declared, not guessed | The platform never infers shared state from traces. The owner shipping a write-then-read tool family declares the entity and its starting state. | P4 |
| MCK-020 | No run-only overrides | A mock output, rule, strategy or state value cannot exist only inside one run request. The durable case definition is edited instead — otherwise a run is not reproducible. | P4 |
| MCK-021 | An unrecorded call fails, by name | If the agent reaches a node or surface with no recording and no real route, the case fails, naming exactly which node and surface. | P3 |
| MCK-022 | A new path is maintenance, not a bug | If the candidate legitimately takes a new path, the owner updates both the new surface's mocks and any now-stale expected answer before trusting the run. | P4 |
| MCK-023 | Validate the world before running | The complete contract — modes, strategies, rules, stateful claims and payload types — is validated before any case executes. | P3 |

### 3.8 Eval-Runner Lifecycle, Concurrency, and Failure Semantics

**What you own here:** nothing. RUN-024 is the only row you will ever see the effect of — what the run status shows you while you wait.

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| RUN-001 | The coordinator stores nothing | It holds no durable run data. Durable entities live in the evaluation platform or the orchestrator. | P3 |
| RUN-002 | It carries payloads without reading them | Bundle and case payloads are forwarded without deriving product meaning from them. | P3 |
| RUN-003 | It never judges | The coordinator never calls a judge. It causes correctly labelled traces to arrive; the platform's workers judge them. | P3 |
| RUN-004 | It never runs the agent | The coordinator calls the sandbox's execute endpoint. It never executes agent code itself. | P3 |
| RUN-005 | One production call only | Its only call to production is the approved read-only bundle export. | P3 |
| RUN-006 | Acknowledge fast, work after | A trigger is validated and acknowledged quickly, then processed asynchronously. | P3 |
| RUN-007 | A duplicate trigger is not a second run | One run in flight per project, test set, config version and branch. A duplicate returns the existing run. | P3 |
| RUN-008 | Re-running is always allowed | Once a run has finished, the same request may immediately start a fresh run with a new identity. | P3 |
| RUN-009 | A per-project concurrency cap | A configurable limit on concurrent runs protects sandbox and judge capacity. | P3 |
| RUN-010 | Check cheap things first | Before provisioning anything, validate the request, that the test set exists, that it meets the minimum size, and that a matching evaluator is active. | P3 |
| RUN-011 | Visible states | Triggered, provisioning, seeding, preparing, executing, finalising and teardown — each with timestamps and failure reasons. Detail in §4.7. | P3 |
| RUN-012 | Resolve the test set by ID | The name is resolved to an immutable ID before execution, and evaluator matching uses the ID — a display name can be renamed underneath a run. | P3 |
| RUN-013 | One identity per run | One run identity is minted and shared by every case, and the run is named for the config version under test. | P3 |
| RUN-014 | Bounded case concurrency | Cases run concurrently up to a configurable limit, so a run cannot overload the sandbox or hit model rate limits. | P3 |
| RUN-015 | One bad case does not end the run | A missing mock, a timeout or a case-specific error fails that case and lets the rest continue. | P3 |
| RUN-016 | An infrastructure failure ends the run | A provisioning, seeding or preparation failure ends the run, and always passes through teardown. | P3 |
| RUN-017 | Retry only what is safe | Transient reads and repeatable calls retry with backoff. An execute is retried only when the failure happened before any trace could exist. | P3 |
| RUN-018 | Never retry an ambiguous execute | If the case may have run but the response is unknown, do **not** retry — mark it failed. Two traces for one case would corrupt the report. | P3 |
| RUN-019 | Confirm the evidence | Before teardown, confirm every returned trace ID is fetchable, or record that case as missing evidence. | P3 |
| RUN-020 | Link the run to the config | During finalisation, the run is recorded on the config, so the change is permanently tied to its evidence. | P4 |
| RUN-021 | Execution finishing is not scoring finishing | The coordinator may finish and tear down while judges are still running. Status must distinguish "execution complete" from "scoring complete". | P3 |
| RUN-022 | A crash costs one run, never evidence | A coordinator crash may abandon the run in flight, but ingested traces stay safe. The incomplete run becomes invalid and a fresh re-run is the recovery. | P3 |
| RUN-023 | Reclaim orphans automatically | Every sandbox is labelled with its run, and sandboxes whose run no longer exists are reclaimed automatically. | P3 |
| RUN-024 | Show the user what is happening | Current state, elapsed time, case progress, case failures and cleanup status are visible to whoever started the run. | P4 |

### 3.9 Eval Triggering, Scoring, Validity, and Reports

**What you own here:** your score thresholds (EVL-021) and the minimum test-set size (DEP-013). EVL-019 is the one to internalise: an invalid run is not a failed run, and treating them the same is how a bad change ships.

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| EVL-001 | Judging is triggered by the trace arriving | Evaluation happens as a consequence of a correctly labelled trace being ingested. There is no separate "now run the judges" call. | P3 |
| EVL-002 | Build the run from the trace labels | The run, its cases and their trace links are created from the experiment labels on incoming spans. | P3 |
| EVL-003 | Only the root span triggers a job | A job is created only when the arriving span is the case's stamped root. Child spans must not create duplicate jobs. | P3 |
| EVL-004 | A matching active evaluator is required | Judging requires an active, unblocked evaluator whose target and filters match. | P3 |
| EVL-005 | Sample after matching | Sampling is applied after matching. Offline normally evaluates every case; online follows its configured fraction. | P3 |
| EVL-006 | Exclude the platform's own judge traces | So judging cannot cascade. | P3 |
| EVL-007 | One score per job, even on retry | Jobs are deduplicated by evaluator, trace and triggering span, so an ingestion retry cannot produce a second score. | P3 |
| EVL-008 | Wait, then fetch | Wait the configured delay, then fetch the completed trace and, offline, the expected answer. | P3 |
| EVL-009 | Fill variables deterministically | Judge variables resolve from the trace's input and output and the case's expected answer, the same way every time. | P3 |
| EVL-010 | Call the judge and record the call | Invoke the project's configured model and record model, latency, tokens, cost and any error. | P3 |
| EVL-011 | Never fabricate a score | The response is parsed against the score schema. A malformed response errors the job — it does not produce a guessed score. | P3 |
| EVL-012 | What a score contains | Name, value, the judge's explanation, the source evaluator and version, and its trace and run. | P3 |
| EVL-013 | Every job ends visibly | Completed or errored, and inspectable either way. | P3 |
| EVL-014 | One path for offline and online | Both converge on the same job execution and score storage. Only the trigger and whether a reference answer exists differ. | P4 |
| EVL-015 | A minimum test-set size | A run is blocked before anything is provisioned if the test set is below a configured floor, because a handful of cases cannot support a release decision. The floor is configurable; its production value is DEP-013. | P3 |
| EVL-016 | Check the judge is ready first | Before the run, verify at least one required evaluator is active and matching. Switching one on afterwards does not repair the run. | P3 |
| EVL-017 | Every case must have run | Validity requires every case to have either a result or an explicit failure. | P3 |
| EVL-018 | Every case must be fully scored | Validity requires every executed case to have every required score. Judge errors make a run incomplete — never a misleading partial average. | P3 |
| EVL-019 | Invalid is not the same as failed | An **invalid** run says nothing about the config, changes no status, and is excluded from comparisons. **Failed** is a human verdict on a valid run. Confusing the two is how a bad change ships. | P4 |
| EVL-020 | Compare two runs side by side | Runs of the same test set compare by config version, with per-metric aggregates and per-case deltas. | P4 |
| EVL-021 | Threshold buckets | Counts and percentages below client-defined thresholds, for every dimension. | P4 |
| EVL-022 | Lead with what got worse | The report prioritises the cases whose scores regressed, not just the change in the mean — a rare expensive regression can hide inside a flat average. | P4 |
| EVL-023 | Every number links to its evidence | Each figure links through to the full trace, the expected answer, the judge's explanation, the config version, the prompt and tool attribution, and whether each call was mocked. | P4 |

### 3.10 Human Verdict, Promotion Gate, and Audit

**What you own here:** all of it. This table is the gate — it is the reason this platform exists, and GAT-013 is the dependency that decides whether it covers anything.

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| GAT-001 | Evaluate something that cannot change | Evaluation runs against an immutable draft. Editing behaviour afterwards creates a new version that needs its own evidence. | P4 |
| GAT-002 | The run is recorded on the config | The evaluated run is stored on the config before it can even be considered for approval. | P4 |
| GAT-003 | A person decides | An authorised person records pass or fail after reading a valid report. Scores inform that decision and never make it. | P4 |
| GAT-004 | An invalid run proves nothing | An invalid or incomplete run cannot set a config to passed or failed, and cannot be used as promotion evidence. | P4 |
| GAT-005 | Passed means one explicit approval | A config reaches passed only through an explicit approval tied to one valid run. | P4 |
| GAT-006 | The release path checks | The ordinary promote API accepts only a passed immutable config, and verifies that the linked run, project, agent and config version all match. | P4 |
| GAT-007 | Promote exactly what was evaluated | The exact config document and pinned references that were evaluated are the ones promoted. Nothing may change between approval and promotion. | P4 |
| GAT-008 | A complete audit record | Who, when, which config and hash, which run, which test set, the decision and the reason — for every pass, fail and promotion. | P4 |
| GAT-009 | No automatic promotion | The platform exposes no score threshold that promotes anything or moves a live pointer. | P4 |
| GAT-010 | Promotion is not full exposure | A promoted config enters the live tier as an experiment arm. How much traffic it sees is decided by the central experiment service, outside this platform. | P4 |
| GAT-011 | Only the orchestrator moves the pointer | Changing an agent's live pointer stays an orchestrator control-plane action. Judge workers and the run coordinator must never do it. | P4 |
| GAT-012 | No bypass on the ordinary path | Production can serve only released configs, and released configs come only from passed evaluated configs. There is no side door. | P4 |
| GAT-013 | Someone must decide what counts as a behaviour change | The orchestrator's publish pipeline classifies which changes need the full gate and which are operational enough for a smoke check. This gate is only as good as that classification (see DEP-009, and LIF-006 in the Composition & Runtime KRD). | P4 |
| GAT-014 | Approving is its own permission | Only roles with promote permission can approve or promote. Editing test sets or judges does not confer release authority. | P4 |

### 3.11 Online Evaluation and Production-to-Test-Set Loop

**What you own here:** the sampling rate, which is a direct cost dial (ONL-003), and the weekly habit in ONL-011 and ONL-014 — a human turning real failures into test cases. Nothing here happens without that habit.

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| ONL-001 | Target live traffic | Online evaluation is an evaluator that targets production traces rather than test-set runs. | P4 |
| ONL-002 | Filter on the agent labels | Eligible traffic is filtered by project plus the agent labels — agent, config version, environment, tags, run kind. | P4 |
| ONL-003 | Sampling is the cost dial | The tenant samples a fraction of eligible traffic, and the UI must show the estimated judge volume and cost of that choice. | P4 |
| ONL-004 | Wait for the full trace | Wait the configured delay before reading, so asynchronously ingested spans have arrived. | P4 |
| ONL-005 | Reference-free rubrics only | Online judges cannot use an expected answer — there isn't one. They score observable qualities: groundedness, safety, language consistency, signs of user frustration. | P4 |
| ONL-006 | No sandbox involved | Online evaluation reads traces that already exist. It provisions nothing and does not involve the run coordinator. | P4 |
| ONL-007 | The same judge machinery | Once triggered, online jobs use the same execution, logging and score storage as offline jobs. | P4 |
| ONL-008 | Watch a release land | Quality trends can be filtered to a newly promoted arm, so a team can see how it does in the real world after passing the offline gate. | P4 |
| ONL-009 | Watch for drift | Score trends over time surface regressions caused by a model change or new user phrasing, with no config change at all — the failure mode ordinary testing cannot catch. | P4 |
| ONL-010 | Find the bad ones | Saved filters — score below a threshold, this agent, this window — surface candidate failures. | P4 |
| ONL-011 | One click into the test set | A badly scored live conversation enters the same minting flow as any other trace. This is the loop closing. | P4 |
| ONL-012 | Online can never act | Online scores and alerts cannot block a request, disable a config, move a pointer, or trigger any automatic production action. This is what makes them safe to trust. | P4 |
| ONL-013 | Alerting we own | Add our own alerting over score trends where the self-hosted dashboards do not alert. Alerts link straight to the saved trace filter. | P5 |
| ONL-014 | A person reviews, at launch | At launch a human reviews saved filters and picks candidate test cases. This limitation must be explicit in the operating guidance. | P4 |
| ONL-015 | Automated review queue | Automatic surfacing, refresh cadence and staleness measurement need their own later design. | Later |

### 3.12 Data Retention, Cost, Observability, and Scale

**What you own here:** the four cost dials (OPS-010) and, with FinOps, how long evidence stays interactive (DEP-017).

| Req ID | Capability | Required Behaviour / Acceptance | Phase |
| :-: | :-: | :-: | :-: |
| OPS-001 | An interactive window | Recent traces, observations and scores stay interactive. The exact number of months is set from measured production volume, not guessed now. | P5 |
| OPS-002 | Project-first, month-partitioned | Analytics data is keyed by project and partitioned by month, so a tenant filter prunes data and an old month can be dropped as a metadata operation. | P1 |
| OPS-003 | Compressed storage | Use the columnar layout and compression for large input and output columns, and monitor what compression we actually get. | P1 |
| OPS-004 | Scheduled export | Incremental per-project export of traces, observations and scores to object storage. | P5 |
| OPS-005 | Lake ingestion | The standard lake job lands exported data as tables, processing incrementally and safely on repeat. | P5 |
| OPS-006 | Never drop before export | An interactive partition is dropped only once its export is complete and verified in the lake. | P5 |
| OPS-007 | Control entities never expire | Test sets, cases, judge templates, evaluators, project metadata and config-evidence links do not expire with trace data. | P1 |
| OPS-008 | Backups | Scheduled backups of the transactional store, replication for the analytics store, and the lake as a continuously fed historical copy. | P5 |
| OPS-009 | The tenant pays for its own judges | Judge calls and real-model runs execute on the project's own model connection, so spend lands on the tenant. | P3 |
| OPS-010 | Four explicit cost dials | Test-set size, number of judges, online sampling rate, and real-versus-mocked model calls. | P4 |
| OPS-011 | What we measure | Tracing (drops, queue depth, export latency, retries, flush outcomes); ingestion (accepted events, payload size, queue depth, dead letters, wait and processing time, batch size, write failures); judges (volume, latency, errors, parse failures, tokens, cost); runs (outcome by state, duration, invalidity reason, case failures, trace-confirmation failures); sandboxes (provisioning time, active count, teardown failures, orphans); export (last-sync age per project, rows exported, job outcome, lag breaches). | P1–P5 |
| OPS-017 | Alert on anything that loses evidence | Any dropped span, growing dead-letter queue or failed trace confirmation raises an alert, because each one can silently remove a case from a report and make a release decision on incomplete data. | P2 |
| OPS-018 | Health checks everywhere | Liveness and readiness for every web, worker, coordinator and pipeline component. | P1 |
| OPS-019 | No single point of failure | Serving and gate components run with replicas and durable queues, so a restart never loses accepted traces. | P5 |
| OPS-020 | Ingestion capacity | Demonstrate **20,000–25,000 spans/s** at the stated 2,500-conversation/s target, without missing freshness targets. | P5 |
| OPS-021 | Judge capacity | Demonstrate roughly **4,500–6,000 judge evaluations/s**, with tenant model rate limits tracked separately. | P5 |
| OPS-022 | Growth planning | Plan for roughly **1.7–2.2 billion spans/day**, about **3 TB/day raw** before compression, and a few hundred GB/day stored. | P5 |

## 4. API and Data Contracts

### 4.1 Ownership Boundary

| Owner | Owns | Does Not Own |
| :-: | :-: | :-: |
| **AMP orchestrator** | Agent code and configs, the live pointer, agent prompts, tool implementations, the sandbox, the bundle/startup/execute endpoints, and mock replay. | Test sets, judge templates, scores, reports, and coordinator state. |
| **Evaluation platform (vendor)** | Organisations, projects and roles; traces and observations; test sets, cases and runs; evaluator rules, judge templates, jobs and scores; comparisons, dashboards, and scheduled export. | Agent prompts, agent configs, agent execution, sandbox lifecycle, and the promotion pointer. |
| **Eval Platform (ours)** | The Go SDK, the run coordinator, the mock recorder and its contract and policy, report extras, gate integration, our alerting layer, and lake-side ingestion. | Agent business logic, the tenant's quality rubric, what a judge's verdict means, or production serving. |

### 4.2 Go SDK Surface

The target contract. This is not permission for product code to construct platform payloads directly — options carry trace identity, input and output, metadata, model, prompt, usage, status and errors.

```go
func New(ctx context.Context, cfg Config) (*Client, error)
func (c *Client) Shutdown(ctx context.Context) error

func (c *Client) StartSpan(ctx context.Context, name string, opts ...Option) (context.Context, *Span)
func (c *Client) StartGeneration(ctx context.Context, name string, opts ...Option) (context.Context, *Generation)
func (c *Client) StartEvent(ctx context.Context, name string, opts ...Option)

func (s *Span) Update(opts ...Option) *Span
func (s *Span) End(opts ...Option)
func (s *Span) RecordError(err error) *Span
func TraceID(ctx context.Context) string

ctx = root.SetExperiment(ctx, Experiment{
  ID: runID, Name: configVersion, DatasetID: datasetID,
  ItemID: itemID, ItemExpectedOutput: expected,
})
```

### 4.3 Required Trace Labels

| Label | Level | Required Meaning |
| :-: | :-: | :-: |
| amp.tenant | Trace | The tenant or product that owns the conversation. |
| amp.agent | Trace | The named agent. |
| amp.config.version | Trace | The exact immutable config being tested or served. |
| amp.agent.variant | Trace | The code build used. |
| amp.run.kind | Trace | `live` or `eval`. |
| amp.node.name | Span | The node or specialist slot that produced this span. |
| amp.span.kind | Span | `agent`, `llm`, `tool` or `memory`. |
| amp.tool.name | Span | The tool grant the agent used. |
| amp.call.site | Span | The named call site inside the node. |
| amp.prompt.name / .version | Generation | The exact prompt version behind this model call. |
| amp.mock.injected | Eval span | Whether a mock answered this call. |
| amp.mock.mode | Eval span | `replay`, `stateful` or `real`. |
| amp.mock.strategy | Eval span | `static`, `matched` or `sequence`, where applicable. |

### 4.4 Experiment Identity

| Field | Required Meaning |
| :-: | :-: |
| id | One identity per run, shared by every case in it. |
| name | The config version under test, used for human-readable comparison. |
| dataset.id | The immutable test-set ID used by evaluator filters — not the display name. |
| item.id | The test case this trace is answering. |
| item.expected_output | The reference answer, given to reference-aware offline judges. |
| item.root_observation_id | The root span. Only this one triggers a judge job, so each case is scored once. |

### 4.5 Illustrative Mock Contract

```json
{"mocks": {
  "stateful": {
    "address_book": {"initial_state": {"addresses": [{"id": "addr_1", "label": "home"}]}}
  },
  "intent_classifier": {
    "llm": {"mode": "mock", "strategy": "static", "output": {"intent": "order_status"}}
  },
  "order_context": {
    "tools": {
      "get_order_events": {"mode": "mock", "strategy": "matched", "match": "exact",
        "rules": [{"input": {"order_id": "ORD-8821"}, "output": {"events": []}}]},
      "search_products": {"mode": "mock", "strategy": "matched", "match": "contains",
        "rules": [{"keywords": ["red", "saree"], "output": {"items": []}}]}
    },
    "llm": {"mode": "mock", "strategy": "sequence", "outputs": [{}, {}]}
  },
  "address_agent": {"llm": {"mode": "real", "strategy": "static", "output": {}}}
}}
```

The case definition always keeps the complete recording. The sandbox receives only the surfaces set to mock, minus any tool claimed by a stateful entity. A surface set to real needs an approved non-production route.

### 4.6 Eval-Plane APIs

| Endpoint | Direction | Request | Response / Guarantee |
| :-: | :-: | :-: | :-: |
| **Bundle export** | Coordinator → production control plane | The exact config version under test. | A sealed, self-contained bundle: the config, its pinned prompts, the tenant and agent records, and an integrity hash. Read-only. |
| **Startup** | Coordinator → sandbox | The sealed bundle, unopened. | Recomputes the hash, resolves every reference against the sandbox's own code, seeds the stores, and rejects any mismatch before execution. |
| **Execute** | Coordinator → sandbox, per case | The case, the exact tenant/agent/config, the final mocks, and complete experiment identity. | Returns the trace ID. Partial experiment identity is rejected. Execution uses production-equivalent machinery. |

### 4.7 Eval-Runner State Machine

| State | Required Work | Terminal / Failure Behaviour |
| :-: | :-: | :-: |
| **Triggered** | Authenticate, validate, deduplicate, check the test-set floor and that an evaluator is active, then acknowledge. | Fail fast, before spending any sandbox capacity. |
| **Provisioning** | Create the sandbox on the requested released or branch build. | Run-level failure → teardown. |
| **Seeding** | Export the sealed bundle, start the sandbox, validate every reference. | A mismatch fails before any case runs. |
| **Preparing** | Resolve the test-set ID, fetch cases and their worlds, mint the run identity, assemble the policy. | A bad test set or contract is a run-level failure. |
| **Executing** | Run cases with bounded concurrency, assemble mocks, call execute, collect trace IDs. | Case failures continue. An ambiguous execute is never retried. |
| **Finalising** | Confirm traces, record the run on the config, publish the execution outcome. | Judges may still be running. |
| **Teardown** | Destroy the sandbox and record the cleanup outcome. | Always attempted, on every exit path. |

### 4.8 Store Map

| Store | Holds | Technology Shape | Read For |
| :-: | :-: | :-: | :-: |
| **Transactional (Postgres)** | Organisations, projects, roles, keys, test sets and cases, evaluator configs, judge templates, model connections. | Relational, backed up. | UI, APIs, control entities. |
| **Analytics (ClickHouse)** | Traces, observations, scores. | Project-first, month-partitioned, compressed, replicated. | Exploration, reports, online trends. |
| **Queue (Redis)** | Ingestion, evaluation and export queues; cache. | Highly available, monitored. | The asynchronous pipeline only. |
| **Object store (GCS)** | Raw ingestion payloads, media, exports. | S3-compatible interface. | Recovery, large artefacts, export. |
| **Data lake (Delta)** | Complete historical traces, observations, scores. | Incremental Parquet → Delta. | Offline analytics and business joins. |
| **Orchestrator stores** | Agent configs, prompt versions, the live pointer, the config-to-run evidence link. | Owned outside this platform. | Bundle export, the gate, production release. |

## 5. Experimentation Strategy

### 5.1 Will this capability support experiments?

Yes — this platform *is* the evidence layer for agent-config experiments. It compares immutable candidates offline, on the same test set and the same mocked world, and then lets a passed candidate enter the live tier as an experiment arm. Who sees which arm in production stays the central experiment service's job; this platform observes and scores the result.

### 5.2 Experiment Type

| Experiment Type | How It Is Used |
| :-: | :-: |
| **Offline paired comparison** | Run the same test set and the same judges against the baseline and the candidate, and compare case by case before promoting. |
| **Production config experiment** | A passed candidate runs alongside the current default. Online scores monitor quality but never pick the winner. |
| **Online evaluator sampling** | Sample filtered live traffic for monitoring. This is a sampling policy, not user bucketing — we do not own that. |

### 5.3 Variant Behaviour

For a comparison to mean anything, everything except the candidate must be held still: the same test-set ID, the same case definitions, the same mock strategies and starting states, the same judge template versions, the same run policy. The candidate varies only the named config version and, for a code change, the branch build. Changing the test set or a judge creates a different comparison context, and the report must say so.

### 5.4 Assignment Rules

1. An offline run executes every valid case unless a run policy says otherwise. The normal gate uses full coverage.
2. One run identity groups every case in a run. A new run gets a new identity.
3. Online sampling applies after the project, agent and config filters, and belongs to the tenant as a cost dial.
4. This platform never assigns end users to production variants. It reads the config version already stamped on the trace.
5. No score, offline or online, ever changes experiment allocation or the live pointer.

## 6. Tech Solutioning

### 6.1 Key Implementation Decisions

| Decision | Why This Way | Undo Cost |
| :-: | :-: | :-: |
| **Self-host Langfuse v3** | The best balance of evaluation completeness, real tenancy, open-standard ingestion and scale, while keeping all data inside Meesho. | Medium |
| **An open standard at the front door** | Agents emit a standard format, so replacing the platform later does not mean re-instrumenting every agent. | Low |
| **Accept vendor-specific operational surfaces** | Abstracting every test set, query and report entity would mean rebuilding the platform we just chose, on top of itself. | High |
| **Integrate only through public APIs** | Avoids a permanent fork and keeps upgrades and migration possible. | Low |
| **Tenant → organisation, agent → project** | Inherits the roles model and puts the hard data and key boundary exactly where test sets naturally belong. | Medium |
| **One tracer provider per project client** | Many tenant projects in one Go process, with no global-state collisions. | Low |
| **Judging triggers at ingestion** | Offline and online converge on one judge path, and the coordinator only has to make traces arrive. | Medium |
| **A stateless run coordinator** | A crash costs one run, not durable state. Re-running with the same pinned inputs is the universal recovery. | Low |
| **A fresh sandbox per run** | Buys isolation, branch-code execution and clean reproducibility, at the cost of provisioning time. | High |
| **Sandboxes inside the production environment** | Keeps the platform, coordinator, gateway and evidence store one hop away — but requires explicit isolation sign-off (SBX-022). | High |
| **Mocks are mandatory for dependencies** | No side effects and repeatable tests. The cost is that owners must maintain mocks as paths change. | Medium |
| **A sealed bundle keyed by natural names** | The same references resolve inside an empty sandbox, with no database ID remapping. | Medium |
| **Record everything, choose the mode later** | Keeps the choice between replay, real and stateful open without having to re-capture traces. | Low |
| **A human verdict, and a human promotion** | Judge noise must never become an outage or an automatic release. | Low |
| **Online informs, never gates** | Monitoring stays safe to trust precisely because a false positive cannot change production. | Low |
| **LLM judges only at launch** | Keeps the first version coherent. Code scorers can join later on the same score model. | Low |
| **A visible generated rubric as the default builder** | Plain-language criteria become a repeatable, reviewable checklist without changing judge infrastructure. | Low |
| **An interactive window plus a lake** | Recent evidence stays fast while complete history stays available, without unbounded growth in the analytics store. | Medium |

### 6.2 Offline Run — End-to-End

1. An author registers an immutable candidate config and picks a test set, a build, and any surfaces to run for real.
2. The platform posts the request to the run coordinator, which validates it, deduplicates it and runs cheap pre-checks.
3. The coordinator provisions a fresh sandbox on the dedicated evaluation compute.
4. Production exports a sealed config bundle; the coordinator forwards it unopened; the sandbox validates it and seeds its empty stores.
5. The coordinator resolves the test-set ID, fetches the cases and their recorded worlds, and mints one run identity.
6. For each case it assembles the mocks and calls the sandbox's execute endpoint with the exact config and the full experiment identity.
7. The sandbox runs production-equivalent machinery, emits a labelled trace, and returns the trace ID.
8. Ingestion materialises the run and triggers the matching judges on each case's root span. The coordinator confirms the traces and tears the sandbox down.
9. Judge workers write scores. Validity checks reject incomplete execution or scoring. The report compares baseline and candidate case by case.
10. A person records pass or fail. Only a passed config can be promoted, and the audit log records who, when, and on which run's evidence.

### 6.3 Online Loop — End-to-End

1. Production emits the same required labels through the same SDK.
2. An evaluator targeting live traces filters and samples eligible traffic, after the ingestion delay.
3. The shared judge job scores the trace with no expected answer, and writes the scores.
4. Dashboards and alerts show trends and badly scored conversations by agent, config and time.
5. A reviewer mints selected failures into durable test cases — and the next offline gate now protects against them.

### 6.4 Implementation Status

| Component | Status | Required Follow-Through |
| :-: | :-: | :-: |
| **Platform infrastructure** | Designed | P1 provisioning, CI, deployment, roles, backups and load validation. |
| **Go SDK** | Designed | No official Go client exists — build the package, its tests, metrics and orchestrator integration. |
| **Trace label contract** | Designed | Freeze the labels with the orchestrator. The recorder and the judge trigger depend on the exact names. |
| **Trace explorer and dashboards** | Adopted capability | Configure projects, labels and access. No parallel UI of our own is planned. |
| **Test sets and comparison** | Adopted capability | Extend only with the mock recorder and report extras. |
| **Judge execution** | Adopted capability | Configure model connections, evaluator rules, templates and error monitoring. |
| **Judge builder** | To build | Criteria expansion and versioned template creation, in P4. |
| **Run coordinator** | To build | State machine, retries, concurrency, status and cleanup, in P3. |
| **Sandbox provisioning** | Orchestrator dependency | Dedicated compute, isolation, branch builds, routes and teardown. |
| **Bundle / startup / execute** | Orchestrator dependency | The contract must be frozen before P3 integration. |
| **Mock replay and stateful entities** | Orchestrator dependency | Replay lookup, an explicit entity registry, and final-state tracing. |
| **Promotion gate** | Cross-platform build | The orchestrator's config lifecycle plus our run and approval evidence. |
| **Online evaluation** | Configuration plus alerting | Evaluator templates in P4; a thin alerting layer in P5. |
| **Data lake export** | Partly adopted | Configure the native export, then build lake ingestion and verification. |
| **Simulation** | Not designed | Its own later architecture and KRD. |

## 7. Logging Requirements

Each row is a question we must be able to answer, and the minimum needed to answer it. Secrets are never logged.

| Record / Span | When | Minimum Required Fields |
| :-: | :-: | :-: |
| **Root trace** — what happened in this turn? | Every live and evaluation turn | Project, tenant, agent, environment, conversation, user, turn, config version, code variant, run kind, input and output, timings, status, error, usage, cost. |
| **Node span** — which part of the agent did this? | Every node | Node name, span kind, parent, input and output, latency, status, error. |
| **Generation** — what did this model call cost? | Every model call | Model, parameters, prompt name and version, input and output, tokens, cost, latency, error, call site. |
| **Tool span** — did the tool work, and was it real? | Every tool call | Tool name, node, arguments, result, duration, error, and whether a mock answered and how. |
| **Memory span** — what context did it get? | Every memory fetch | Surface, query, result, duration, error, mock provenance. |
| **SDK export** — are we losing traces? | Every batch or failure | Client, batch size, queue depth, attempt, latency, response, retries, drop count. |
| **Ingestion accept** — was it safely received? | Every request or aggregate | Project, payload size, event count, raw-object reference, queue, outcome. |
| **Ingestion processing** — where is the backlog? | Every job | Queue, wait time, processing time, merge and conversion result, dead-letter reason. |
| **Storage write** — are writes keeping up? | Every batch | Table, row count, bytes, flush reason, latency, outcome. |
| **Run trigger** — who started this, and is it a duplicate? | Every request | Project, test set, config, branch, real-surface policy, caller, dedupe key, whether new or existing. |
| **Run transition** — where did the run get stuck? | Every state change | Run, from and to state, timestamp, elapsed, dependency, reason. |
| **Sandbox lifecycle** — was it isolated, and was it cleaned up? | Provision and teardown | Sandbox, build, compute pool, routes, credential class, timings, cleanup result. |
| **Bundle export** — exactly what was evaluated? | Every export | Config version and hash, included references, caller, size, outcome. Never secret contents. |
| **Startup** — did the sandbox get the right world? | Every seeding | Bundle hash, validation results, seeded entities, mismatch reason. |
| **Case execute** — did this case run, once? | Every case | Run, case, attempt, timings, trace ID, result, failure scope, retry decision. |
| **Missing mock** — what did the agent reach that we hadn't recorded? | Every occurrence | Run, case, node, surface, requested input, available policy, and whether it was intentional. |
| **Trace confirmation** — is any evidence missing? | Every case finalisation | Trace ID, first fetch time, attempts, missing-evidence outcome. |
| **Evaluator trigger** — why was this judged, or not? | Every match or skip | Evaluator and version, target, trace, root check, filters, sampling result, recursion check. |
| **Judge job** — did the judge succeed? | Every job | Evaluator, trace, case and run, delay, model, variable mapping, latency, parse result, error. |
| **Score** — what was the verdict, and why? | Every completed job | Name, value, explanation, source evaluator and version, trace, run, timestamp. |
| **Run validity** — can this run support a decision? | Every post-run check | Test-set floor, case completeness, score completeness, invalidity reason, exclusion outcome. |
| **Human verdict** — who approved this, on what evidence? | Every pass or fail | Actor, role, config, run, test set, report version, decision, reason, timestamp. |
| **Promotion** — did anything unevaluated get through? | Every attempt | Actor, config and hash, linked run, validation result, state change, rejection reason. |
| **Online alert** — what is degrading in production? | Every alert state | Project, evaluator and score, threshold or trend, trace filter, first and last seen, acknowledgement. |
| **Lake export** — is history complete? | Every job | Project, watermark, files, rows, bytes, target tables, last-sync age, result, retry. |

## 8. Dependencies, Open Decisions, and Blockers

Note how much of this depends on the orchestrator: the sandbox, the eval endpoints, mock replay, stateful entities, the config lifecycle and the change classification are all built there. This platform can be complete and still not gate anything without DEP-008 and DEP-009.

| ID | Item | Decision / Work Required | Owner |
| :-: | :-: | :-: | :-: |
| DEP-001 | Sandbox placement sign-off | Explicit architecture, security and platform approval for running isolated feature-branch sandboxes inside the production environment. Nothing in §3.6 may be used in production before this is signed. | Architecture / Security / Platform |
| DEP-002 | The platform estate | Provision and operate the stores, ingress, CI, images, secrets and backups. | Platform Engineering |
| DEP-003 | Orchestrator tracing | Integrate the SDK, stamp the closed label set, and honour the root, context, end and shutdown rules. | AMP Runtime |
| DEP-004 | Eval endpoint contract | Freeze bundle export, startup and execute semantics before the P3 coordinator build. | AMP Runtime + Eval Platform |
| DEP-005 | Sandbox provisioner | Branch and released builds, isolation, dedicated compute, empty stores, status and cleanup. | AMP Runtime / Infra |
| DEP-006 | Mock replay | Replay lookup, missing-mock failure, real-route restriction, and provenance stamps. | AMP Runtime |
| DEP-007 | Stateful entities | Define the registry and lifecycle for write-then-read tool families. Owners provide the implementation and the starting-state schema. | Agent Teams + AMP Runtime |
| DEP-008 | Config lifecycle | Provide immutable drafts, a passed status, the evidence link, the promote API, the live tier and audit records. **Without this the gate does not exist.** | AMP Control Plane |
| DEP-009 | Behaviour-change classification | Decide which changes need the full gate and which need only a smoke check. **The primary success metric is defined entirely by this answer.** | AMP Control Plane / Product |
| DEP-010 | Project provisioning | Automate organisation, project, role, key and model-connection creation. | Eval Platform / IAM |
| DEP-011 | Model gateway | Allow approved sandbox and judge traffic, expose usage and cost, and clarify rate-limit isolation. | LLM Gateway |
| DEP-012 | Non-production routes | Provide non-production routes for any surface allowed to run real. Production routes stay unreachable. | Owning Service Teams |
| DEP-013 | Minimum test-set size | Choose the production default and the override policy. The architecture uses 30 only as an example. EVL-015 enforces whatever number you pick. | Product / Data Science |
| DEP-014 | Judge calibration | Design calibration sets, agreement metrics, thresholds and a re-calibration cadence. Until this exists, judge trust is assumed rather than measured. | Data Science / Quality |
| DEP-015 | Online versus offline priority | Decide queue and worker priority so online sampling cannot indefinitely starve an offline report that a release is waiting on. | Platform Engineering |
| DEP-016 | Evaluation model quotas | Decide separate provider keys or reserved quota, so a heavy evaluation run cannot rate-limit live agents serving real users. | LLM Gateway / Tenant Owners |
| DEP-017 | Interactive retention | Set the window from measured volume, query demand and cost. | Data Platform / FinOps |
| DEP-018 | Deletion of personal data | Define how deletion propagates across traces, copied test cases, object storage, exports and lake tables. Until this exists the platform cannot be treated as compliant with deletion obligations — and test cases are copies, so they do not disappear when a trace does. | Privacy / Legal / Data Platform |
| DEP-019 | Payload cap | Define the maximum trace and span payload, the truncation and redaction rules, and how truncation is shown — before an oversized tool output threatens batching or storage. | Architecture / Security |
| DEP-020 | Recording storage | Using the measurements from DST-017, define the growth trigger for moving recorded worlds to object storage with a pointer. | Eval Platform / Data |
| DEP-021 | Branch builds | Assign ownership, a caching strategy, a timing target and the status experience. | Developer Platform |
| DEP-022 | Coordinator drain | Support deployment drain, so a planned restart does not routinely abandon a long run. | Eval Platform / Infra |
| DEP-023 | Queue recovery | Define availability, depth ceilings, shedding and the replay-from-raw-copy procedure. | Platform Engineering |
| DEP-024 | Online alerting | Choose thresholds and trend logic, and integrate with the standard alerting stack. | Quality / SRE |
| DEP-025 | Simulation | Produce a separate design for personas, scenarios, synthetic users and multi-turn replay. | Future Work |

---

# Section III: Testing & Launch Checklist

## 1. Functional Testing

### 1.1 Foundation, Tenancy, and SDK Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-FND-001 | Create two organisations and projects, then try to read across them with each key. | Each key sees only its own project. Cross-project access is rejected and audited. |
| TC-FND-002 | Spike ingestion, UI, evaluation and export load at the same time. | Each deployment stays responsive and no queue starves indefinitely. |
| TC-SDK-001 | Two project clients in one process, emitting interleaved traces. | Each trace lands only in the project its credential selected. |
| TC-SDK-002 | Nest spans using the returned context, then using a stale one. | The correct context nests properly; the stale one is caught by test assertions and visible in the trace structure. |
| TC-SDK-003 | Create a client with no credentials. | Every call is a safe no-op and the host code needs no branch. |
| TC-SDK-004 | Fill the queue past capacity. | Drops are bounded, counted per client and alertable. Memory stays bounded. |
| TC-SDK-005 | Exit the process with queued spans, shutting down correctly and then incorrectly. | A graceful shutdown flushes every client. A forced exit shows the expected drop count. |
| TC-SDK-006 | Stamp root identity and experiment identity across nested spans. | Trace fields come from the root, and every span carries the same run and case identity and root pointer. |
| TC-SDK-007 | Attempt a direct HTTP call to the platform from outside the SDK. | Build or architecture tests reject it. |
| TC-SDK-008 | Emit inputs, outputs, model, prompt, usage and errors. | Everything renders correctly, and the standard attributes are present alongside the platform's own. |

### 1.2 Trace Ingestion, Query, and Dataset Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-ING-001 | Accept an event, stop the workers, then restart them. | The raw event survives and is processed after the restart, with no replay from the caller. |
| TC-ING-002 | Send the pieces of one observation out of order. | The merged latest record is queryable, with no duplicate observation. |
| TC-ING-003 | Overload one project with malformed or slow payloads. | That project is contained on the secondary queue and every other project still meets its freshness target. |
| TC-ING-004 | Load at 20–25k spans/s. | Accepted events stay durable and p99 freshness stays inside one minute. |
| TC-QRY-001 | Filter by environment, conversation, config version, turn, run kind, node and time. | Correct rows, inside the latency target, with no cross-project leakage. |
| TC-QRY-002 | Open a complex agent trace. | The full ordered tree shows model, tool and memory steps with inputs, outputs, prompt, usage, errors and mock provenance. |
| TC-DST-001 | Mint one production conversation into a test set. | Input, expected answer, provenance and the complete recorded world are all created. |
| TC-DST-002 | Bulk-mint a filtered selection. | Every selected trace becomes exactly one case, through the same conversion path. |
| TC-DST-003 | Mint a trace that is missing required labels. | It fails visibly and creates no partially replayable case. |
| TC-DST-004 | Edit the expected answer and the mock rules, then re-run. | The new durable definition is used, and the earlier run's evidence stays interpretable. |
| TC-DST-005 | Expire the source trace's partition. | The test case remains present, owned, runnable, and still carrying its provenance. |

### 1.3 Sandbox, Bundle, and Runner Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-SBX-001 | Run a config-only evaluation. | The sandbox uses the released build, empty stores and the exact candidate config. |
| TC-SBX-002 | Run a branch-code evaluation. | The sandbox uses the requested branch build, with no production deploy involved. |
| TC-SBX-003 | Try to reach production from inside the sandbox. | Impossible by policy, and no production credential is present to try with. |
| TC-SBX-004 | Mark a surface real, with and without an approved non-production route. | With a route it succeeds; without one it fails loudly. Production is never used. |
| TC-SBX-005 | Alter the sealed bundle in transit. | Startup hash validation rejects it before any case runs. |
| TC-SBX-006 | Export a config with a missing prompt or code reference. | Rejected, naming the exact unresolved reference. |
| TC-RUN-001 | Double-click the trigger, and replay the webhook. | One run in flight. Duplicates return the existing run. |
| TC-RUN-002 | Fail provisioning, then fail seeding. | The run fails at the right state and teardown is attempted in both cases. |
| TC-RUN-003 | Fail one case on a missing mock. | That case is marked failed, the others run, and the report names the node and surface. |
| TC-RUN-004 | Time out an execute after the server may already have run it. | No retry. An ambiguous failure is recorded, and there is only ever one trace per case. |
| TC-RUN-005 | Crash the coordinator mid-run. | Ingested traces survive, the old run becomes invalid, and re-triggering makes a clean new run. |
| TC-RUN-006 | Crash before teardown. | The orphan reclaimer removes the sandbox by its run label. |
| TC-RUN-007 | Finish execution while judges are still running. | The sandbox tears down safely and status shows execution complete, scoring pending. |

### 1.4 Mocking and Stateful-World Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-MCK-001 | Replay a static mock with differently worded but equivalent input. | The static output is served, and the judge later assesses argument quality from the trace. |
| TC-MCK-002 | Replay repeated calls in sequence. | Outputs come back in recorded order, and running past the end fails explicitly. |
| TC-MCK-003 | Replay exact-match and contains-match calls. | Only an exact input selects the exact-match output; configured keywords select the contains-match output; an unmatched input is a missing-mock failure. No fuzzy scoring anywhere. |
| TC-MCK-005 | Flip a surface from mock to real and back. | The recording stays intact, real uses the approved route, and the later mock run reuses the stored definition. |
| TC-MCK-006 | Configure one surface as real for some cases and mocked for others. | Validation rejects the non-uniform policy. |
| TC-MCK-007 | Save an address, then read it back, through a stateful entity. | The read sees the write from the same run, and the final state appears on the trace. |
| TC-MCK-008 | Claim only part of an entity's tool family. | Validation rejects the non-atomic configuration. |
| TC-MCK-009 | Try to override a mock only inside a run request. | Rejected. The durable case definition must be edited. |
| TC-MCK-010 | The candidate routes to a new, unrecorded node. | The case fails naming the exact node and surface. No production fallback. |

### 1.5 Judges, Scoring, Reports, and Gate Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-JDG-001 | Activate an evaluator before ingestion, then after it. | The one active beforehand fires. Late activation does not silently backfill, and the UI explains why. |
| TC-JDG-002 | Ingest root and child spans carrying experiment identity. | Exactly one judge job, on the root. |
| TC-JDG-003 | Retry ingestion of the same span. | The job is deduplicated and one score is written. |
| TC-JDG-004 | The judge returns malformed output. | The job errors visibly and no invented score appears. |
| TC-JDG-005 | Use a reference-based judge online, with no expected answer available. | Blocked or clearly warned. A reference-free template is required. |
| TC-JDG-006 | Build a judge from a task, criteria and a scale. | The generated steps are visible, editable, versioned, and used by subsequent jobs. |
| TC-EVL-001 | Run a test set below the validity floor. | The run fails before any sandbox is provisioned, and is marked invalid rather than started. |
| TC-EVL-002 | Judges fail on a subset of cases. | The run is invalid and incomplete. Partial scores are never presented as a pass rate. |
| TC-EVL-003 | Compare a baseline and a candidate run. | Aggregate deltas, threshold buckets and the regressed-case list are all correct. |
| TC-EVL-004 | Open a regressed case. | The trace, expected answer, judge reasoning, config, prompt, tool and mock provenance are all linked. |
| TC-GAT-001 | Try to promote with no run, an invalid run, a failed run, and a mismatched run. | Every attempt is rejected and audited. |
| TC-GAT-002 | Approve a valid run and promote the unchanged config. | It becomes passed, promotion succeeds, and the hash matches the evaluated document exactly. |
| TC-GAT-003 | Edit the config after approval. | A new version is created that needs its own evaluation. The old approval cannot transfer. |
| TC-GAT-004 | Look for a way to promote automatically on a score threshold. | No such capability exists anywhere in the platform. |

### 1.6 Online, Data, Cost, and Operations Test Cases

| Test Case ID | Scenario | Expected Result |
| :-: | :-: | :-: |
| TC-ONL-001 | Configure a live-traffic evaluator with filters and sampling. | Only eligible sampled traces create jobs, and no sandbox or coordinator activity occurs at all. |
| TC-ONL-002 | An online judge returns a low score. | Trends, filters and alerts update. Production serving and config state do not change in any way. |
| TC-ONL-003 | Mint a low-scoring live conversation. | It becomes a durable test case with an expected answer, provenance and its recorded world. |
| TC-OPS-001 | Stop the scheduled export for one project. | The last-sync-age alert fires well before expiry could create a gap in history. |
| TC-OPS-002 | Export the same watermark twice. | Lake ingestion is idempotent and creates no duplicate rows. |
| TC-OPS-003 | Drop an exported old month. | Interactive data for that month disappears as designed, while lake history and every test case remain. |
| TC-OPS-004 | Sustain judge load at target capacity. | Offline reports stay bounded and online work never indefinitely starves the gate. |
| TC-OPS-005 | Consume a tenant's model quota with evaluation and live traffic together. | The configured isolation and alerts reveal the risk, and the finalised quota policy protects live traffic. |
| TC-OPS-006 | Send an oversized tool output. | The payload and truncation policy applies visibly and protects the queues and storage. |
| TC-OPS-007 | Restore from backup and verify lake history. | Control entities and evidence recover within the documented targets. |
| TC-OPS-008 | Remove a replica under load. | The service stays available and accepted work stays queued and durable. |

## 2. Launch Checklist

| Theme | Launch Requirement | Owner / Notes |
| :-: | :-: | :-: |
| **Architecture** | Deployment, the responsibility boundary, the public-APIs-only rule and the version pin are approved. | Architecture |
| **Security** | Sandbox placement, isolation, the no-production-route policy, secret injection and access control are approved. | Security / Platform |
| **Privacy** | Data classification, access, retention, export, backup — and the known deletion gap — are documented and signed off for launch scope. | Privacy / Legal |
| **Infrastructure** | Every store, role-separated services, replicas, capacity and backups are production-ready. | Platform |
| **Tenancy** | Organisation and project provisioning, keys, roles and cross-tenant tests are complete. | IAM / Eval Platform |
| **Go SDK** | The interface is frozen; multi-project clients, no-op mode, batching, drop metrics, shutdown and REST wrappers are tested. | Eval Platform |
| **Trace contract** | The required labels, mock provenance, prompt, usage and experiment attributes are frozen and integrated. | AMP Runtime |
| **Ingestion** | Raw-copy durability, queue recovery, noisy-project isolation, freshness and target-load tests all pass. | Platform |
| **Trace UX** | Explorer, conversation view, and the traffic, cost and quality dashboards work under project access control. | Eval Platform |
| **Test sets** | Single and bulk minting, expected-answer editing, provenance and retention independence are verified. | Eval Platform |
| **Mock recorder** | Every labelled surface records inputs, outputs and order, and an incomplete conversion fails visibly. | Eval Platform |
| **Judge builder** | Generated steps are visible, editable and versioned; reference guidance and execution logs are ready. | Quality / Eval Platform |
| **Sandbox** | Released and branch builds, dedicated compute, empty stores, approved routes, teardown and orphan cleanup are ready. | AMP Runtime / Infra |
| **Eval endpoints** | Bundle export, startup, execute, integrity validation, exact-config execution and the trace-ID contract are frozen. | AMP Runtime |
| **Mock replay** | All four strategies, real routes, missing-mock failure, stateful entities and trace stamps pass. | AMP Runtime |
| **Run coordinator** | Duplicate protection, state machine, bounded concurrency, retries, ambiguous timeouts, failure scoping, drain and status all ready. | Eval Platform |
| **Validity** | Test-set floor, evaluator readiness, execution completeness, score completeness and invalid-run exclusion are implemented. | Eval Platform |
| **Reports** | Side-by-side aggregates, thresholds, regressions and evidence drill-down validated on real test sets. | Eval Platform / Product |
| **Gate** | Human verdict, evidence link, passed status, promote enforcement, exact-hash matching and audit log work end to end. | AMP Control Plane |
| **Online evaluation** | Filters, sampling, reference-free judges, the trend dashboard, the no-action guarantee and the saved-failure workflow are ready. | Quality / Eval Platform |
| **Alerting** | Evidence loss, queue and dead-letter depth, judge errors, invalid runs, orphans, export lag and service health are all routed. | SRE |
| **Data lake** | Incremental export and lake ingestion verified, and expiry cannot precede a confirmed export. | Data Platform |
| **Cost** | Project model connections, the cost dials, cost dashboards and the quota policy are documented. | FinOps / Tenants |
| **Runbooks** | Ingestion backlog, judge outage, coordinator crash, orphan sandbox, invalid run, export lag and rollback procedures are written. | SRE / Eval Platform |
| **Adoption** | Vaani and MAS pilot test sets, judges, owners, reviewer roles and release workflows are configured. | Product Teams |

### 2.1 Hard Launch Blockers

1. **Explicit sign-off** that unmerged evaluation sandboxes may run inside the production environment under the specified isolation controls.
2. The production estate and project provisioning are operational and have passed capacity, recovery, backup and tenant-isolation tests.
3. The orchestrator emits the frozen trace and experiment contract, and flushes reliably on shutdown.
4. Bundle export, startup, exact-config execute, sandbox provisioning and teardown, mock replay and stateful entities are all implemented and frozen.
5. The ordinary production release path rejects any config without a valid, human-approved run linked to that exact config hash.
6. Evidence-loss alerts, invalid-run semantics, judge error visibility and orphan cleanup all work — before any team relies on this gate to ship.
7. Security, privacy, retention and model-credential reviews are complete for the launch tenants and data classes.

## 3. Post-Launch Governance

| Area | Cadence / Trigger | Governance Action | Owner |
| :-: | :-: | :-: | :-: |
| **Judge changes** | Every new judge version | Review the generated steps, validate against known examples, and watch disagreement and missing-score rates. The re-calibration process still needs designing. | Judge Owner / Quality |
| **Test-set refresh** | Weekly, or a tenant-defined cadence | Review low-scoring production conversations, mint the valuable failures, correct expected answers, remove duplicates, and track coverage gaps. | Agent Owner / Ops |
| **Config release** | Every behaviour-affecting change | Run a valid comparison, review the regressions, record the human verdict, and promote only the exact approved hash. | Release Owner |
| **Online sampling** | Monthly, and on any cost or traffic change | Review what the sampling is yielding against what it costs, and tune without weakening the critical monitors. | Tenant Owner |
| **New models** | Every new model | Evaluate across all agents within about a week, on stable test sets and judges, before any production exposure. | Model Platform / Agent Owners |
| **Platform upgrades** | Every planned version change | Review release notes, public-API compatibility, migration, a POC, rollback and performance before production. | Eval Platform |
| **Trace contract** | Additive changes only | Review every consumer — recorder, mocks, filters, export schema — and prohibit silent renames or removals. | Architecture |
| **Capacity** | Monthly, and before any major launch | Review span rate, queue depth, judge throughput, storage growth, compression and worker scaling. | SRE / Data |
| **Retention** | Quarterly | Verify export completeness, query demand, storage cost, legal requirements and the interactive window. | Data / Privacy / FinOps |
| **Access** | Quarterly, and on any team change | Review membership, promote authority, API keys, model connections and stale credentials. | Tenant Admin / IAM |
| **Failure review** | After any evidence loss or invalid-run incident | Identify which layer failed — SDK, ingestion, coordinator, sandbox, judge or export — and add a regression test and a runbook update. | Eval Platform / SRE |
| **Open risks** | Quarterly | Revisit judge trust, automated enrichment, personal-data deletion, queue priority, evaluation quotas, payload caps, branch builds and recording storage. | Architecture Council |

---

# Section IV: Mentor Sign Off

| Function | Name | Status |
| :-: | :-: | :-: |
| **Product** | TBD | Pending |
| **Engineering** | TBD | Pending |
| **Architecture** | TBD | Pending |
| **Security** | TBD | Pending |
| **Privacy / Legal** | TBD | Pending |
| **Data Platform** | TBD | Pending |
| **SRE / Platform** | TBD | Pending |
| **LLM Gateway** | TBD | Pending |
| **Analytics / Quality** | TBD | Pending |

---

## Summary

Build the Eval Platform as the evidence and release-safety layer for our agents: self-hosted, tenant-isolated, trace-native, reproducible offline, watched online, and always under human release control.

1. Self-host the evaluation platform inside Meesho and adopt its tenancy, traces, test sets, evaluators, reports and export rather than rebuilding them.
2. Keep ingestion on an open standard, and contain every vendor-specific call inside one package.
3. Trace every live and evaluation turn with its exact config, prompt, tool, model, cost, errors — and whether each dependency was real.
4. Turn real conversations into durable test cases with editable expected answers, so the test set grows where users actually hit problems.
5. Let each tenant author several versioned judges, one per quality dimension, with visible rubrics.
6. Run every offline evaluation in a fresh isolated sandbox that has no production route and no production credential.
7. Seed that sandbox from a sealed bundle and run the exact candidate through production-equivalent machinery.
8. Replay tools, model calls and memory with four explicit matching strategies, and use declared stateful entities where tools write then read.
9. Coordinate runs through a stateless, duplicate-safe coordinator with bounded concurrency, safe retries, visible states and guaranteed teardown.
10. Trigger judging from the trace itself, so offline and online share one scoring path.
11. Treat incomplete execution or scoring as invalid — never as a partial average — and compare valid runs case by case, leading with what regressed.
12. Require a human verdict and exact run evidence before promotion. Never auto-promote, and never let an online score touch production.
13. Use online evaluation to watch releases land, catch drift with no config change, and turn real failures into future test cases.
14. Keep recent evidence interactive and complete history in the lake, expiring the former only after the latter is verified.
15. Attribute evaluation spend to each project's own model connection, and alert on anything that loses evidence — because a report built on missing cases is worse than no report.
16. Recognise that this gate only works if the orchestrator delivers the config lifecycle (DEP-008) and the behaviour-change classification (DEP-009). Everything else here is machinery around those two.
