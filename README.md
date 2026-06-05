<p align="center">
  <img src="docs-site/public/brand/lockup-horizontal.svg" alt="cardano/mcp" width="320" />
</p>

<p align="center"><em>A Model Context Protocol server for the Cardano ledger.</em></p>

> The Cardano stack, native to your AI agent.

A production-grade MCP server giving Claude deep, idiomatic access to Cardano — UTxOs, native assets, smart contracts, indexers, and full CIP-1694 governance — without leaving your editor.

[![38 tools](https://img.shields.io/badge/tools-38-5DB6FF?style=flat-square&labelColor=101723)]()
[![6 modules](https://img.shields.io/badge/modules-6-3FD4B0?style=flat-square&labelColor=101723)]()
[![CIP-1694](https://img.shields.io/badge/governance-CIP--1694-B49CFF?style=flat-square&labelColor=101723)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-CCCCCC?style=flat-square&labelColor=101723)]()

---

## Why

Solana has 40+ MCPs. EVM has 30+. Cardano had nothing dedicated.

Cardano's eUTxO model is fundamentally different from Ethereum's account model — no balances, only UTxOs; smart contracts are validators not code runners; datums carry state not contracts; amounts are always in lovelace. Generic blockchain MCPs get this wrong. This one is purpose-built.

## Quick start

```bash
git clone https://github.com/lidonation/Cardano-mcp
cd Cardano-mcp
pnpm install && pnpm build
```

Copy `.env.example` to `.env` and add your Blockfrost project ID:

```bash
BLOCKFROST_PROJECT_ID=mainnetXXXXXXXXXXXXXX
CARDANO_NETWORK=mainnet
```

### Claude Desktop

```json
{
  "mcpServers": {
    "cardano": {
      "command": "node",
      "args": ["/absolute/path/to/Cardano-mcp/dist/index.js"],
      "env": {
        "BLOCKFROST_PROJECT_ID": "mainnetXXXXXXXXXXXXXX",
        "CARDANO_NETWORK": "mainnet"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add cardano -- node /absolute/path/to/Cardano-mcp/dist/index.js
```

## Modules & tools

| Module | Phase | Tools | APIs |
|--------|-------|-------|------|
| `query` | 1 | 6 | Blockfrost, Koios, Maestro |
| `tokens` | 1 | 4 | Blockfrost, Koios |
| `txbuilder` | 1 | 5 | Blockfrost, Mesh SDK |
| `contracts` | 2 | 7 | Blockfrost, Aiken CLI, CSL |
| `indexer` | 2 | 4 | Kupo, Yaci Store |
| `governance` | 3 | 12 | Koios |

Full tool reference: [cardano-mcp.dev/tools](https://cardano-mcp.dev/tools)

## Development

```bash
pnpm dev        # watch mode
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint src/
```

## License

MIT © 2025 Emmanuel Tyty
