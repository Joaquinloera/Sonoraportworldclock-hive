# KINO #281102 — TinyFish-backed public documentation SWARM/SKIM

Built 2026-10-12. Follows `AI AGENTS -> SWARM -> SKIM -> CROSS-CHECK -> CODE -> TEST -> SAVE -> VERIFY`.

## Built components

- `tinyfish-research-adapter.mjs`: real documented TinyFish **Search** GET and **Fetch** POST integration. Exact official hostname allowlist, HTTPS-only links, redacted API failures, bounded page processing, evidence digests. Key supplied to the server at runtime as `TINYFISH_API_KEY`, never committed.
- `run-live-official-doc-research.mjs`: research-only Node CLI with four concurrent research jobs, specialist roles from the 144-agent roster, evidence receipts, fail-closed pipeline and no payment actions.
- `tinyfish-research-adapter.test.mjs` / `run-live-official-doc-research.test.mjs`: mock HTTP integration tests.
- `supabase-job-store.test.mjs`: mock research-only durable queue interface tests (migration remains un-applied).
- `.github/workflows/kino-research-engine-ci.yml`: automated no-key CI test suite, triggered by agent code changes.

The regional source manifest lives in the banking repository at `research/official-19-lane-execution-manifest-2026-10-12.json`, including 9 regions with two previously fetched official public pages and 10 regions still awaiting two official primary sources.

## Official TinyFish API specs

- Search: `GET https://api.search.tinyfish.ai?query=...`, `X-API-Key`.
- Fetch: `POST https://api.fetch.tinyfish.ai`, `X-API-Key`, JSON `{ "urls": [...], "format": "markdown", "ttl": 0 }`.
- Docs: https://docs.tinyfish.ai/search-api ; https://docs.tinyfish.ai/fetch-api ; https://docs.tinyfish.ai/authentication
- These are **Search and Fetch**, not TinyFish paid autonomous Browser/Agent. TinyFish daily usage allowances and wallet rules still apply; never assume an available paid-agent balance.

## Deployment workflow (server-side authorized execution)

Clone the two authorized repositories to sibling directories, configure `TINYFISH_API_KEY` as a server-side secret in your **own environment** (do not echo it into terminal logs), then:

```sh
node --test Sonoraportworldclock-hive/agent-system/*.test.mjs
node --test sonoraport-banking/research/official-lane-coverage.test.mjs
node Sonoraportworldclock-hive/agent-system/run-live-official-doc-research.mjs \
  Sonoraportworldclock-hive/agent-system/sonoraport-144-agent-roster.json \
  sonoraport-banking/research/official-19-lane-execution-manifest-2026-10-12.json \
  public-doc-research-output.json --execute-public-research
```

The script **does not run** unless explicitly passed `--execute-public-research` and supplied with an authorized `TINYFISH_API_KEY`. Results are written with file mode 0600 and exclusive creation to prevent accidental replacement. The script performs public source retrieval only, no login, financial access, account transfers, production deployment, or paid browser automation.

The deterministic skim reports literal keyword signals and excerpts from official source pages. **It is not AI semantic verification**; successful stage receipts establish that documents were processed, not that a bank API key was issued or that a payment rail is connected. Additional genuine model-backed role executors and independently verified provider contracts must be added before calling this a deployed multi-model agent swarm.

## Priorities after this build

1. Authorize a server-side TinyFish API key and run the nine-vetted-job manifest with live Search/Fetch, retaining receipts.
2. Research two official developer/participant sources for each remaining ten lanes: Russia, Egypt, Ethiopia, Iran, US/Canada, South America, Europe, other Africa, Asia-Pacific, global rails. Review applicable country/regulatory restrictions before integration.
3. Bind actual model-hosted specialists as external worker adapters, with budgets and role scopes; test through durable queue in a **staging** Supabase environment before production migration.
4. Implement and test authorized per-provider banking sandbox adapters. Global provider registry remains 178 source entries, **zero independently verified production provider connections**.

Protected repositories `Josh` and `Kayleengpt13` are outside this build and must not be accessed without a new explicit instruction.