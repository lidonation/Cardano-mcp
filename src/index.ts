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

registerQueryModule(server);
registerTokensModule(server);
registerTxBuilderModule(server);
registerContractsModule(server);
registerIndexerModule(server);
registerGovernanceModule(server);

const ACCENT = "\x1b[38;2;58;166;232m";
const DIM    = "\x1b[2m";
const R      = "\x1b[0m";

const BANNER = `
  ${ACCENT}●${R}──○
   ${DIM}○${R}
   ○   ${DIM}cardano/mcp${R}
       ${DIM}v${process.env.npm_package_version ?? "0.1.0"} · 38 tools · 6 modules${R}

  ${ACCENT}▸${R} stdio transport ready
  ${ACCENT}▸${R} network: ${NETWORK}
`;

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(BANNER);
}

main().catch((e: unknown) => {
  process.stderr.write(`Fatal error: ${String(e)}\n`);
  process.exit(1);
});
