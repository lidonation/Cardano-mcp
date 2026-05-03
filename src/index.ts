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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr so it doesn't pollute the MCP stdio protocol
  process.stderr.write(
    `Cardano MCP server started (network: ${NETWORK})\n`
  );
}

main().catch((e: unknown) => {
  process.stderr.write(`Fatal error: ${String(e)}\n`);
  process.exit(1);
});
