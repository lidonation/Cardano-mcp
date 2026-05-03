# Getting Started with Cardano MCP

A production-grade MCP server giving AI agents deep access to the Cardano blockchain.

## Prerequisites

- Node.js 20+ (LTS)
- Yarn
- A free [Blockfrost](https://blockfrost.io) account (required for most tools)

## Installation

```bash
git clone <repo-url>
cd cardano-mcp
yarn install
cp .env.example .env
```

Edit `.env` and add your keys:

```bash
CARDANO_NETWORK=mainnet          # or preprod / preview
BLOCKFROST_PROJECT_ID=mainnetXXX # from blockfrost.io
```

## Build

```bash
yarn build   # compiles TypeScript → dist/
```

## Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cardano": {
      "command": "node",
      "args": ["/absolute/path/to/cardano-mcp/dist/index.js"],
      "env": {
        "BLOCKFROST_PROJECT_ID": "mainnetXXXXXXXXXXXXXX",
        "CARDANO_NETWORK": "mainnet"
      }
    }
  }
}
```

Restart Claude Desktop. The Cardano tools appear automatically.

## Add to Claude Code (CLI)

In your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "cardano": {
      "command": "node",
      "args": ["/absolute/path/to/cardano-mcp/dist/index.js"],
      "env": {
        "BLOCKFROST_PROJECT_ID": "mainnetXXXXXXXXXXXXXX",
        "CARDANO_NETWORK": "preprod"
      }
    }
  }
}
```

## First Queries to Try

Once connected, ask Claude:

### Check a wallet balance
> "What UTxOs does addr1qxy... hold? What's the total ADA?"

Uses `get_address_utxos` → Blockfrost.

### Look up an NFT
> "Show me the metadata for asset policy d5e6bf05... with name SpaceCoins"

Uses `get_nft_metadata` → Blockfrost CIP-25/68.

### Inspect a transaction
> "What did transaction abc123...def do? Show me inputs and outputs."

Uses `get_tx_details` → Blockfrost.

### Check governance
> "What active governance proposals are there right now?"

Uses `list_governance_proposals` → Koios.

> "Show me the voting power of all registered DReps."

Uses `list_dreps` → Koios.

> "What is the current Cardano treasury balance?"

Uses `get_treasury_balance` → Koios.

### Decode a datum
> "Decode this datum CBOR: d87980"

Uses `decode_cbor_datum` → CSL.

## Available Tools (28 total)

| Module | Tool | Description |
|--------|------|-------------|
| query | `get_address_utxos` | All UTxOs at an address |
| query | `get_tx_details` | Full transaction details + UTxOs |
| query | `get_asset_info` | Native asset metadata + supply |
| query | `get_block_info` | Block details by hash |
| query | `query_address_history` | Transaction history for address |
| tokens | `get_nft_metadata` | CIP-25/68 NFT metadata |
| tokens | `list_wallet_assets` | All native assets at address |
| tokens | `build_mint_transaction` | Build unsigned minting tx |
| tokens | `get_policy_assets` | All assets under a policy |
| txbuilder | `get_protocol_params` | Current network parameters |
| txbuilder | `calculate_min_ada` | Min ADA for a UTxO |
| txbuilder | `build_payment_tx` | Build unsigned payment tx |
| txbuilder | `build_smart_contract_tx` | Spend a Plutus script UTxO |
| txbuilder | `submit_transaction` | Submit signed CBOR tx |
| governance | `list_governance_proposals` | All CIP-1694 proposals |
| governance | `get_proposal_details` | Single proposal details |
| governance | `get_proposal_votes` | All votes on a proposal |
| governance | `list_dreps` | All registered DReps |
| governance | `get_drep_info` | Single DRep details |
| governance | `get_drep_votes` | DRep voting history |
| governance | `get_drep_delegators` | Addresses delegated to DRep |
| governance | `list_committee_members` | Constitutional Committee |
| governance | `get_committee_member_votes` | CC member vote history |
| governance | `get_voter_proposal_votes` | All votes by any voter |
| governance | `get_treasury_balance` | Current treasury amount |
| governance | `get_constitution` | On-chain constitution hash/URL |

## Network Configuration

Switch networks by changing `CARDANO_NETWORK` in `.env`:

| Value | Chain | Blockfrost prefix |
|-------|-------|-------------------|
| `mainnet` | Production | `mainnet` |
| `preprod` | Pre-production testnet | `preprod` |
| `preview` | Preview testnet | `preview` |

## Optional API Keys

| Key | Used for | Get at |
|-----|----------|--------|
| `MAESTRO_API_KEY` | Faster multi-address UTxO queries | gomaestro.org |
| `KUPO_URL` | Pattern-based UTxO watching (Phase 2) | Run locally with Kupo sidecar |
| `YACI_STORE_URL` | Custom indexer passthrough (Phase 2) | Run locally with Yaci Store |

## Running Tests

```bash
yarn test              # run all tests
yarn test:coverage     # with coverage report
```

## Development

```bash
yarn dev   # watch mode with tsx (no build needed)
```

Logs go to stderr so they don't interfere with the MCP stdio protocol.
