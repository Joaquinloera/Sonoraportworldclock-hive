# SonoraPort KINO — SWARM + SKIM Research Execution (2026-10-12)

**Original build priority:** agents first, integrated global banking research simultaneously; website later. Preserve existing agent identities and banking research.

## What runs

`research-engine.mjs` schedules **six specialist roles per banking lane** with up to **eight concurrent research jobs**, per-job source checks, stage evidence requirements, SHA-256 receipt hashes, defensive input checks, and fail-closed behavior. `supabase-job-store.mjs` is an optional server-side queue client; SQL migration is held in `sonoraport-banking/migrations/20261012_sonoraport_swarm_research_queue.sql` and **has not been applied**.

There are 144 *registered logical agents*, not 144 concurrently deployed LLM agents. All original roster executors are unbound. The local replay method temporarily binds deterministic adapters to a **copy of the roster** and runs processing on saved, official-public-source captures. This demonstrates worker scheduling, execution of role stages, bounded concurrency and evidence receipts — **not** autonomous AI search, bank API access, or production settlement.

### Run tests (Node 20+)

```bash
cd Sonoraportworldclock-hive/agent-system
node --test research-engine.test.mjs supabase-job-store.test.mjs roster-integrity.test.mjs
```

### Replay the public-source banking research with two sibling repositories

```bash
node Sonoraportworldclock-hive/agent-system/run-evidence-replay.mjs \
  Sonoraportworldclock-hive/agent-system/sonoraport-144-agent-roster.json \
  sonoraport-banking/research/official-banking-source-captures-2026-10-12.json
```

Replay intentionally produces `RESEARCH_REPLAY_PASSED` rather than an unrestricted integration/deployment success. **No external API requests occur in replay mode.**

### Genuine execution adapter integration

Configure `AUTHORIZED_TOOL_ADAPTER` **only after** an authorized worker is actually wired to a provider-specific source fetch or agent service. The adapter must return `{ok:true,evidence:[{url,kind,acquisition}],findings:{...}}` and must never provide raw credentials or bank account data. Assign individual authorized research jobs through the durable queue; role definitions must not be assumed to execute by themselves.

### Supabase staged migration

`sonoraport-banking/migrations/20261012_sonoraport_swarm_research_queue.sql` adds isolated research-only queue and receipt tables with RLS, service-role-only RPC, lease renewal by expiration and atomic `SKIP LOCKED` claims. It must be **reviewed and applied in a staging project** before any production migration. No DB schema changed in this release. Never put service-role keys into browser code, GitHub or JSON.

### Research coverage and evidence

`sonoraport-banking/data/global-banking-all-providers-registry.json` holds 160 core research entries plus 18 historical institution names (not live account verification), totaling 178 records. `sonoraport-banking/research/official-banking-source-captures-2026-10-12.json` stores the **eight fetched official public sources** and **four additional unverified leads**. Source captures from CIPS, SPEI, PayShap/PayInc, SARIE, CBUAE, Russian NPS, Egypt InstaPay, ECCB DCash are documentary research, not proof of payment functionality or API access. Official developer/partner documentation must independently confirm production auth, scopes, SDKs and test access before building a transfer adapter.

### Blockers

- TinyFish live paid browser-agent wallet was below zero (~-$0.25 at review time); **free search and page fetch succeeded**. No paid live browser-agent runs occurred.
- At least one Nexvio hosted agent was previously confirmed, but no 144-worker hosted deployment verified.
- Supabase schema migration staged, not applied; queue adapter tested against a fake network responder only.
- Banking-provider API credentials, regulatory authorization, production connections and settlement capability not verified.

### Policies

No production bank transfers, credential collection, secret dumping, unverified fund claims, or modifications to protected repositories (`Josh`, `Kayleengpt13`) under this build. Preserve KINO #281102, existing registries, prior research and all supporting evidence.