# Cardano MCP — Project Brain

> Read this fully before touching any file.
> This is the single source of truth for architecture, decisions, and context.

---

## What we are building

A **production-grade MCP server** that gives AI agents like Claude deep, idiomatic access
to the Cardano blockchain — smart contracts, UTxOs, tokens, indexers, and on-chain
governance. The goal: a developer using Claude should be able to build a full Cardano dApp
without ever leaving their AI coding session.

This fills a real gap. Solana has 40+ MCPs. EVM has 30+. Cardano has nothing dedicated.

---

## Tech stack — NEVER deviate without updating this file

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **TypeScript** (strict) | MCP SDK is TS-first, best type safety |
| MCP SDK | `@modelcontextprotocol/sdk` latest | Official Anthropic SDK |
| Schema validation | `zod` | MCP SDK expects Zod schemas |
| Primary blockchain API | **Koios** (`api.koios.rest/api/v1`) | Free, decentralized, full governance support |
| Secondary API | **Blockfrost** | Widest coverage, best SDK ecosystem |
| High-perf UTxO queries | **Maestro** (`mainnet.gomaestro-api.org/v1`) | 9x faster multi-address UTxO queries |
| Event watching | **Kupo** (local sidecar) | Pattern-based UTxO watching, persists across restarts |
| Smart contract language | **Aiken** awareness | Inject context, validate snippets via CLI |
| Off-chain tx building | **Mesh SDK** (`@meshsdk/core`) | Best TS tx building for Cardano |
| Runtime | **Node.js 20+** LTS | Required by MCP SDK |
| Package manager | **pnpm** | Faster, strict deps |
| Testing | **vitest** | Fast, ESM-native |

---

## Project structure

```
cardano-mcp/
├── CLAUDE.md                    ← YOU ARE HERE
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts                 ← MCP server entry point, registers all modules
│   ├── config.ts                ← env vars, network selection (mainnet/preprod/preview)
│   ├── lib/
│   │   ├── koios.ts             ← Koios API client with retry + rate limiting
│   │   ├── blockfrost.ts        ← Blockfrost client
│   │   ├── maestro.ts           ← Maestro client
│   │   ├── kupo.ts              ← Kupo client
│   │   └── cbor.ts              ← CBOR decode/encode utilities
│   ├── modules/
│   │   ├── query/               ← Phase 1: blockchain queries
│   │   │   └── index.ts
│   │   ├── txbuilder/           ← Phase 1: transaction building
│   │   │   └── index.ts
│   │   ├── tokens/              ← Phase 1: native assets & NFTs
│   │   │   └── index.ts
│   │   ├── contracts/           ← Phase 2: Aiken + smart contract tooling
│   │   │   └── index.ts
│   │   ├── indexer/             ← Phase 2: Kupo + Yaci Store
│   │   │   └── index.ts
│   │   └── governance/          ← Phase 3: CIP-1694 full governance
│   │       └── index.ts         ← ALREADY WRITTEN — see src/governance/index.ts
│   ├── resources/
│   │   ├── eutxo-context.md     ← Injected context: eUTxO model explainer
│   │   ├── governance-context.md← Injected context: CIP-1694 explainer
│   │   └── aiken-stdlib.md      ← Aiken standard library quick reference
│   └── types/
│       └── cardano.ts           ← Shared TypeScript types
├── tests/
│   ├── query.test.ts
│   ├── governance.test.ts
│   └── fixtures/                ← Sample API responses for mocking
└── docs/
    ├── governance.md            ← ALREADY WRITTEN
    └── getting-started.md
```

---

## The 6 modules and 28 tools — build in this order

### Phase 1 — Core (build first, no local infra needed)

#### Module: `query` (5 tools)
- `get_address_utxos` → Blockfrost `/addresses/{addr}/utxos`
- `get_tx_details` → Blockfrost `/txs/{hash}` + `/txs/{hash}/utxos`
- `get_asset_info` → Maestro or Blockfrost `/assets/{asset}`
- `get_block_info` → Koios `/block_info`
- `query_address_history` → Koios `/address_txs`

#### Module: `txbuilder` (5 tools)
- `build_payment_tx` → Mesh SDK `MeshTxBuilder`
- `build_smart_contract_tx` → Mesh SDK with datum/redeemer
- `calculate_min_ada` → protocol params + value calculation
- `get_protocol_params` → Blockfrost `/epochs/latest/parameters`
- `submit_transaction` → Blockfrost `/tx/submit`

#### Module: `tokens` (4 tools)
- `get_nft_metadata` → Blockfrost `/assets/{asset}` CIP-25/68
- `list_wallet_assets` → Maestro or Koios `/address_assets`
- `build_mint_transaction` → Mesh SDK native/Plutus mint
- `get_policy_assets` → Blockfrost `/assets/policy/{policyId}`

### Phase 2 — Smart contracts + indexer

#### Module: `contracts` (6 tools)
- `explain_eutxo_model` → resource: loads `resources/eutxo-context.md`
- `get_aiken_stdlib_docs` → fetches from aiken-lang.org or bundled docs
- `validate_aiken_snippet` → shells out to `aiken check`
- `get_script_info` → Blockfrost `/scripts/{scriptHash}`
- `decode_cbor_datum` → lib/cbor.ts (THE most important tool)
- `scaffold_validator` → template generator for common patterns

#### Module: `indexer` (4 tools)
- `watch_address` → Kupo `PUT /matches/{pattern}`
- `query_kupo_matches` → Kupo `GET /matches/{pattern}`
- `get_rollup_status` → Kupo `GET /health`
- `query_custom_indexer` → Yaci Store REST passthrough

### Phase 3 — Governance (ALREADY WRITTEN)

#### Module: `governance` (12 tools) — SEE `src/governance/index.ts`
All 12 tools are implemented. Just import and register in `src/index.ts`.

---

## Critical Cardano concepts — understand these before writing ANY tool

### eUTxO model (NOT Ethereum's account model)
- There are NO account balances. There are UTxOs (Unspent Transaction Outputs)
- Each UTxO has: txHash + outputIndex + address + value (lovelace + assets) + optional datum
- Smart contracts are VALIDATORS — they don't run code, they APPROVE or DENY transactions
- A script LOCKS a UTxO. To spend it, you provide a REDEEMER that satisfies the validator
- Datums carry the "state" — they're attached to UTxOs, not to a contract address
- This means: ALWAYS fetch UTxOs, not balances. The sum of UTxO values IS the balance.

### Encoding hell — the #1 AI agent pain point
- Lovelace: `1 ADA = 1,000,000 lovelace` — ALWAYS work in lovelace internally
- Assets: `policyId + "." + hex(assetName)` — e.g. `"abc123.4d79546f6b656e"`
- Addresses: bech32 (`addr1...`) for mainnet, `addr_test1...` for testnet
- Script hashes: hex, 56 chars
- Datums: raw CBOR hex — must be decoded with `decode_cbor_datum` tool
- Transaction IDs: hex, 64 chars
- All amounts in API responses are STRINGS (avoid JS BigInt overflow)

### CIP-1694 Governance (full detail in `src/governance/index.ts`)
- 3 voting bodies: DReps, SPOs, Constitutional Committee
- 7 action types: MotionOfNoConfidence, UpdateCommittee, UpdateConstitution,
  HardForkInitiation, ParameterChange, TreasuryWithdrawal, InfoAction
- Proposals identified by CIP-129 bech32 `gov_action1...` IDs
- DRep IDs: bech32 `drep1...` per CIP-0005/129
- Governance is LIVE on mainnet since Plomin Hard Fork (Jan 2025)

---

## API client patterns — use these everywhere

### Koios client (`lib/koios.ts`)
```typescript
// POST with body (most endpoints)
const result = await koios<ProposalList[]>("/proposal_list", {
  _proposal_status: "active"
});

// GET (list endpoints)
const dreps = await koios<DRepInfo[]>("/drep_list");
```

Always include retry with exponential backoff for 429s.
Koios base URL comes from `config.ts` → respects `CARDANO_NETWORK` env var.

### Blockfrost client (`lib/blockfrost.ts`)
```typescript
const params = await blockfrost<ProtocolParams>("/epochs/latest/parameters");
```

### Error handling pattern (use in every tool)
```typescript
try {
  const data = await koios<T>(path, body);
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
} catch (err: any) {
  return {
    content: [{ type: "text", text: `Error: ${err.message}` }],
    isError: true,
  };
}
```

### Tool return format — ALWAYS structured JSON
Tools MUST return `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`.
Never return raw strings. Claude needs parseable JSON to reason about chain state.

---

## Environment variables (`.env`)

```bash
# Network: mainnet | preprod | preview
CARDANO_NETWORK=mainnet

# Required for most tools
BLOCKFROST_PROJECT_ID=mainnetXXXXXXXXXXXXXX

# Required for governance + query
KOIOS_URL=https://api.koios.rest/api/v1

# Optional — higher performance UTxO queries
MAESTRO_API_KEY=your_maestro_key

# Optional — only if running Kupo locally
KUPO_URL=http://localhost:1442

# Optional — only if running Yaci Store locally
YACI_STORE_URL=http://localhost:8080
```

---

## Build, test, and run commands

```bash
pnpm install
pnpm build          # tsc → dist/
pnpm dev            # ts-node src/index.ts (watch mode)
pnpm test           # vitest
pnpm test:coverage  # vitest --coverage
pnpm lint           # eslint src/
pnpm typecheck      # tsc --noEmit
```

To add to Claude Desktop for testing:
```json
{
  "mcpServers": {
    "cardano": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "BLOCKFROST_PROJECT_ID": "your_key",
        "CARDANO_NETWORK": "preprod"
      }
    }
  }
}
```

---

## Code style — enforce strictly

- **TypeScript strict mode** — no `any` except where unavoidable (API responses)
- **Zod schemas for all tool inputs** — include `.describe()` on every field
- **JSDoc on every tool** — the description IS the tool's documentation for Claude
- **Named exports only** — no default exports (easier to tree-shake and test)
- **No magic numbers** — constants in `src/config.ts` or top of file
- **Lovelace helper** — always use `lovelaceToAda(n)` for display, never raw division inline

---

## What is already built

| File | Status |
|------|--------|
| `src/governance/index.ts` | ✅ Complete — 12 tools, full CIP-1694 |
| `docs/governance.md` | ✅ Complete — full reference doc |
| This `CLAUDE.md` | ✅ You're reading it |

Everything else needs to be built.

---

## Build order for a fresh session

1. `package.json` + `tsconfig.json` + `.env.example`
2. `src/config.ts` — env loading, network config, base URLs
3. `src/lib/koios.ts` — Koios client with retry
4. `src/lib/blockfrost.ts` — Blockfrost client
5. `src/lib/cbor.ts` — CBOR decoder (use `@emurgo/cardano-serialization-lib-nodejs`)
6. `src/types/cardano.ts` — shared types
7. `src/modules/query/index.ts` — Phase 1 query tools
8. `src/modules/tokens/index.ts` — Phase 1 token tools
9. `src/modules/txbuilder/index.ts` — Phase 1 tx tools
10. `src/index.ts` — wire everything together + register governance module
11. Tests for all of the above
12. Then Phase 2 modules

---

## Compact instructions

When compacting this session, preserve:
- All architecture decisions in "Tech stack" table
- The 28 tools list and their module assignments
- The Cardano concepts section (eUTxO, encoding, governance)
- What is already built table
- The build order list