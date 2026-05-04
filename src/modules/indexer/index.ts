import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMatches, watchPattern, getKupoHealth } from "../../lib/kupo.js";
import { YACI_STORE_URL } from "../../config.js";
import type { KupoMatch } from "../../types/cardano.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

export function registerIndexerModule(server: McpServer): void {
  server.tool(
    "watch_address",
    "Register an address or pattern with Kupo for UTxO watching. " +
      "Kupo is a lightweight chain-follower that persists UTxO state across restarts. " +
      "Patterns can be: a full bech32 address, a payment credential prefix, or '*' for all. " +
      "Requires Kupo running locally (set KUPO_URL env var, default: http://localhost:1442). " +
      "After registering, use query_kupo_matches to retrieve matching UTxOs.",
    {
      pattern: z
        .string()
        .describe(
          "Kupo match pattern. Examples:\n" +
            "  addr1qxy...      — exact bech32 address\n" +
            "  *                — all addresses (expensive!)\n" +
            "  addr1.../*       — all outputs at payment credential\n" +
            "  */stake1...      — all outputs with a stake credential"
        ),
    },
    async ({ pattern }) => {
      try {
        await watchPattern(pattern);
        return ok({
          status: "registered",
          pattern,
          note: "Kupo is now indexing UTxOs matching this pattern. " +
            "Use query_kupo_matches to retrieve results. " +
            "Kupo will backfill from its configured start point.",
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "query_kupo_matches",
    "Query all UTxOs matching a Kupo watch pattern. " +
      "Returns UTxOs with value, datum hashes, script hashes, and creation/spend slots. " +
      "Unspent UTxOs have spent_at = null. " +
      "Pattern must be previously registered with watch_address (or Kupo configured to index it). " +
      "Requires Kupo running locally (KUPO_URL env var).",
    {
      pattern: z
        .string()
        .describe("Kupo match pattern (must be registered with watch_address first)"),
      unspent_only: z
        .boolean()
        .default(true)
        .describe("If true, return only unspent UTxOs (default: true)"),
    },
    async ({ pattern, unspent_only }) => {
      try {
        const matches = await getMatches(pattern);

        const filtered = unspent_only
          ? matches.filter((m: KupoMatch) => m.spent_at === null)
          : matches;

        const totalLovelace = filtered.reduce(
          (sum: bigint, m: KupoMatch) => sum + BigInt(m.value.coins),
          0n
        );

        return ok({
          pattern,
          unspent_only,
          match_count: filtered.length,
          total_lovelace: totalLovelace.toString(),
          matches: filtered,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_rollup_status",
    "Get the sync status and health of the local Kupo indexer. " +
      "Returns the most recent checkpoint slot, the current node tip, " +
      "and whether Kupo is fully synced. " +
      "Use this to verify Kupo is running and check how far behind it is.",
    {},
    async () => {
      try {
        const health = await getKupoHealth();

        const checkpoint = health.most_recent_checkpoint;
        const tip = health.most_recent_node_tip;
        const slotsBehind = tip - checkpoint;
        const syncPct =
          tip > 0 ? ((checkpoint / tip) * 100).toFixed(2) : "0.00";

        return ok({
          ...health,
          slots_behind: slotsBehind,
          sync_percent: `${syncPct}%`,
          is_synced: slotsBehind < 100,
        });
      } catch (e: unknown) {
        return err(
          e instanceof Error
            ? `${e.message} — is Kupo running? Set KUPO_URL env var (default: http://localhost:1442)`
            : String(e)
        );
      }
    }
  );

  server.tool(
    "query_custom_indexer",
    "Passthrough query to a Yaci Store custom indexer REST API. " +
      "Yaci Store provides advanced Cardano indexing with custom SQL queries, " +
      "aggregate views, and historical data that Kupo doesn't support. " +
      "Requires Yaci Store running locally (set YACI_STORE_URL env var, default: http://localhost:8080). " +
      "See Yaci Store docs for available endpoints: https://github.com/bloxbean/yaci-store",
    {
      path: z
        .string()
        .describe(
          "REST API path to query (e.g. '/api/v1/addresses/{address}/utxos')"
        ),
      method: z
        .enum(["GET", "POST"])
        .default("GET")
        .describe("HTTP method (default: GET)"),
      body: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Request body for POST requests (as JSON object)"),
      query_params: z
        .record(z.string(), z.string())
        .optional()
        .describe("URL query parameters as key-value pairs"),
    },
    async ({ path, method, body, query_params }) => {
      try {
        let url = `${YACI_STORE_URL}${path}`;

        if (query_params && Object.keys(query_params).length > 0) {
          const params = new URLSearchParams(query_params);
          url = `${url}?${params.toString()}`;
        }

        const options: RequestInit = {
          method,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: method === "POST" && body ? JSON.stringify(body) : undefined,
        };

        const response = await fetch(url, options);

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(`Yaci Store ${method} ${path} → ${response.status}: ${text}`);
        }

        const data: unknown = await response.json();
        return ok(data);
      } catch (e: unknown) {
        return err(
          e instanceof Error
            ? `${e.message} — is Yaci Store running? Set YACI_STORE_URL env var (default: http://localhost:8080)`
            : String(e)
        );
      }
    }
  );
}
