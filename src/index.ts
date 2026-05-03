import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerQueryModule } from "./modules/query/index.js";
import { registerTokensModule } from "./modules/tokens/index.js";
import { registerTxBuilderModule } from "./modules/txbuilder/index.js";
import { registerGovernanceModule } from "./modules/governance/index.js";
import { registerContractsModule } from "./modules/contracts/index.js";
import { registerIndexerModule } from "./modules/indexer/index.js";
import { NETWORK } from "./config.js";

export const server = new McpServer({
  name: "cardano-mcp",
  version: "0.1.0",
});

// Register all modules — Phase 1, Phase 2, Governance
registerQueryModule(server);
registerTokensModule(server);
registerTxBuilderModule(server);
registerContractsModule(server);
registerIndexerModule(server);
registerGovernanceModule(server);

const BANNER = `
\x1b[38;2;93;182;255m  ╭───────────────────────────────────────╮\x1b[0m
\x1b[38;2;93;182;255m  │\x1b[0m  \x1b[1mcardano\x1b[0m\x1b[2m/\x1b[0m\x1b[38;2;63;212;176mmcp\x1b[0m  v0.1.0          \x1b[32mlive\x1b[0m  \x1b[38;2;93;182;255m│\x1b[0m
\x1b[38;2;93;182;255m  │\x1b[0m  38 tools · 6 modules · CIP-1694    \x1b[38;2;93;182;255m│\x1b[0m
\x1b[38;2;93;182;255m  ╰───────────────────────────────────────╯\x1b[0m
`;

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(BANNER);
  process.stderr.write(`  network: ${NETWORK}\n\n`);
}

main().catch((e: unknown) => {
  process.stderr.write(`Fatal error: ${String(e)}\n`);
  process.exit(1);
});
