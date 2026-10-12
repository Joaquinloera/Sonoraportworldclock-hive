# KINO #281102 — BUILD 02, queue-backed SWARM + SKIM public-document worker

Date: 2026-10-12. Source repository: `Joaquinloera/Sonoraportworldclock-hive`.

## Scope and factual status

- `sonoraport-144-agent-roster.json` defines **144 logical agent roles** and 19 regions; it does NOT create 144 hosted LLM workers.
- `run-queued-official-doc-research.mjs` provides a concrete bounded queue worker: claim one task, verify the task against an approved manifest, bind six specialist research roles, use TinyFish public-source Fetch to gather evidence, write receipts and finish the task.
- The worker does **not** move money, authenticate as banking customers, read account data, provision credentials, bypass bank restrictions, or publish the website.
- Full live verification requires an authorized server-side TinyFish API key, a database with the research-only migration installed after testing, and an authorized server-side deployment.
- As of this build, the user's primary Supabase database has **no development branches** and its new dedicated research-queue migration is **not applied**. Do not silently apply the migration to the main financial database.
- The initial 144-agent engine is a bounded pool of **up to eight concurrent job executions**, with six specialist logical roles per regional research assignment, not 144 parallel hosted instances.

## Source-of-truth paths

Banking repository: `Joaquinloera/sonoraport-banking`:

- `research/official-19-lane-execution-manifest-2026-10-12-v2.json`: 18 approved research jobs with 2 source-verified public-document URLs; Iran remains pending due to official fetch timeouts.
- `research/official-provider-api-intelligence-2026-10-12.json`: verified developer auth/onboarding details and explicit uncertainties.
- `migrations/20261012_sonoraport_swarm_research_queue.sql`: staged PostgreSQL job + receipt table, RLS and restricted service-role RPCs.

## Local tests and validation

From the Hive checkout:

```bash
node --test agent-system/*.test.mjs
node agent-system/run-queued-official-doc-research.mjs \
  agent-system/sonoraport-144-agent-roster.json \
  ../sonoraport-banking/research/official-19-lane-execution-manifest-2026-10-12-v2.json \
  --validate-only
```

The validation command makes **no external API calls or database changes**.

## Real execution contract (only after staging approval and server configuration)

Create a **staging** Supabase branch or separate research database after explicit cost confirmation. Review and apply the research queue migration to that staging database, validate service-role-only access, task leasing/expiry, receipt persistence and the failure cases. Only then configure backend secrets **outside GitHub**:

- `SONORAPORT_SUPABASE_URL`: authorized staging Supabase URL.
- `SUPABASE_SERVICE_ROLE_KEY`: staging secret, available to trusted server workers only.
- `TINYFISH_API_KEY`: official TinyFish server REST key, stored securely.

Execute one authorized task:

```bash
node agent-system/run-queued-official-doc-research.mjs \
  agent-system/sonoraport-144-agent-roster.json \
  ../sonoraport-banking/research/official-19-lane-execution-manifest-2026-10-12-v2.json \
  --execute-one-research-job
```

The command never auto-creates data or endlessly polls. An authorized worker claim must exactly match a manifest ID, region, provider, intent and source URLs. Unknown tasks are terminated as `BLOCKED` without making an external HTTP call. Receipt failures leave the lease unfinished for retry and alerting.

**Do not treat API-key issuance research as possession of credentials.** No source entry establishes production banking or settlement authority; provider authorization must be verified separately.