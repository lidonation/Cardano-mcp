import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { blockfrost } from "../../lib/blockfrost.js";
import { koios } from "../../lib/koios.js";
import { lovelaceToAda } from "../../config.js";
import type {
  UTxO,
  Transaction,
  AssetInfo,
  BlockInfo,
  AddressTx,
} from "../../types/cardano.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Register all query module tools on the MCP server.
 *
 * Tools:
 *   get_address_utxos       — fetch UTxOs at a Cardano address
 *   get_tx_details          — fetch transaction details + UTxOs
 *   get_asset_info          — fetch native asset metadata + supply
 *   get_block_info          — fetch block details by hash or number
 *   query_address_history   — fetch transaction history for an address
 */
export function registerQueryModule(server: McpServer): void {
  server.tool(
    "get_address_utxos",
    "Fetch all UTxOs (unspent transaction outputs) at a Cardano address. " +
      "Returns lovelace amounts and native assets. Use this instead of 'get balance' — " +
      "in Cardano there are no account balances, only UTxOs.",
    {
      address: z
        .string()
        .describe(
          "Bech32 address (addr1... for mainnet, addr_test1... for testnet)"
        ),
      page: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe("Page number for pagination (default: 1)"),
      count: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(100)
        .describe("Results per page, max 100 (default: 100)"),
    },
    async ({ address, page, count }) => {
      try {
        const utxos = await blockfrost<UTxO[]>(
          `/addresses/${address}/utxos?page=${page}&count=${count}&order=asc`
        );

        const totalLovelace = utxos.reduce((sum, u) => {
          const lovelace = u.amount.find((a) => a.unit === "lovelace");
          return sum + BigInt(lovelace?.quantity ?? 0);
        }, 0n);

        return ok({
          address,
          utxo_count: utxos.length,
          total_ada: lovelaceToAda(totalLovelace),
          total_lovelace: totalLovelace.toString(),
          utxos,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_tx_details",
    "Fetch full details for a Cardano transaction including inputs, outputs, fees, metadata, and datum hashes. " +
      "Use this to inspect what a transaction did and what UTxOs it consumed/produced.",
    {
      tx_hash: z
        .string()
        .length(64)
        .describe("Transaction hash (64 hex characters)"),
    },
    async ({ tx_hash }) => {
      try {
        const [tx, utxos] = await Promise.all([
          blockfrost<Omit<Transaction, "utxos">>(`/txs/${tx_hash}`),
          blockfrost<{ hash: string; inputs: Transaction["utxos"]["inputs"]; outputs: Transaction["utxos"]["outputs"] }>(
            `/txs/${tx_hash}/utxos`
          ),
        ]);

        return ok({ ...tx, utxos: { inputs: utxos.inputs, outputs: utxos.outputs } });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_asset_info",
    "Fetch metadata, supply, and on-chain information for a Cardano native asset (fungible token or NFT). " +
      "Supports CIP-25 and CIP-68 metadata standards. " +
      "Asset format: policyId.hexAssetName (e.g. abc123.4d79546f6b656e)",
    {
      asset: z
        .string()
        .describe(
          "Asset identifier in format policyId.hexAssetName, or just policyId+hexAssetName concatenated"
        ),
    },
    async ({ asset }) => {
      try {
        // Blockfrost expects policyId+assetName concatenated without dot
        const assetId = asset.replace(".", "");
        const info = await blockfrost<AssetInfo>(`/assets/${assetId}`);

        return ok({
          ...info,
          asset_name_utf8: info.asset_name
            ? Buffer.from(info.asset_name, "hex").toString("utf8")
            : null,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_block_info",
    "Fetch details for a Cardano block by its hash. " +
      "Returns slot number, epoch, transaction count, pool, and more.",
    {
      block_hashes: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe("Array of block hashes to look up (up to 50)"),
    },
    async ({ block_hashes }) => {
      try {
        const blocks = await koios<BlockInfo[]>("/block_info", {
          _block_hashes: block_hashes,
        });
        return ok(blocks);
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "query_address_history",
    "Fetch the transaction history for a Cardano address using Koios. " +
      "Returns transactions in reverse chronological order with block and slot info. " +
      "Useful for auditing address activity or finding when tokens were received.",
    {
      address: z
        .string()
        .describe(
          "Bech32 Cardano address (addr1... mainnet, addr_test1... testnet)"
        ),
      after_block_height: z
        .number()
        .int()
        .optional()
        .describe("Only return transactions after this block height (optional)"),
      count: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(50)
        .describe("Maximum number of transactions to return (default: 50)"),
    },
    async ({ address, after_block_height, count }) => {
      try {
        const body: Record<string, unknown> = {
          _addresses: [address],
        };

        if (after_block_height !== undefined) {
          body["_after_block_height"] = after_block_height;
        }

        const txs = await koios<AddressTx[]>("/address_txs", body);
        const limited = txs.slice(0, count);

        return ok({
          address,
          tx_count: limited.length,
          transactions: limited,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
