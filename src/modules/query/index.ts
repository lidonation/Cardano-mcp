import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { blockfrost } from "../../lib/blockfrost.js";
import { koios } from "../../lib/koios.js";
import { lovelaceToAda, NETWORK, KOIOS_BASE_URL, BLOCKFROST_BASE_URL } from "../../config.js";
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

  server.tool(
    "get_network_info",
    "Get current Cardano network status: latest block, epoch, slot, and chain tip. " +
      "Also shows which network this server is connected to (mainnet/preprod/preview) " +
      "and the configured API endpoints. Use this as a sanity check that the server is " +
      "working and connected to the right network.",
    {},
    async () => {
      try {
        const [latestBlock, latestEpoch] = await Promise.all([
          blockfrost<{
            hash: string;
            height: number;
            slot: number;
            epoch: number;
            epoch_slot: number;
            time: number;
          }>("/blocks/latest"),
          blockfrost<{
            epoch: number;
            start_time: number;
            end_time: number;
            first_block_time: number;
            last_block_time: number;
            block_count: number;
            tx_count: number;
            output: string;
            fees: string;
          }>("/epochs/latest"),
        ]);

        return ok({
          network: NETWORK,
          endpoints: {
            blockfrost: BLOCKFROST_BASE_URL,
            koios: KOIOS_BASE_URL,
          },
          chain_tip: {
            block_hash: latestBlock.hash,
            block_height: latestBlock.height,
            slot: latestBlock.slot,
            epoch: latestBlock.epoch,
            epoch_slot: latestBlock.epoch_slot,
            block_time: new Date(latestBlock.time * 1000).toISOString(),
          },
          current_epoch: {
            epoch: latestEpoch.epoch,
            start_time: new Date(latestEpoch.start_time * 1000).toISOString(),
            end_time: new Date(latestEpoch.end_time * 1000).toISOString(),
            block_count: latestEpoch.block_count,
            tx_count: latestEpoch.tx_count,
            total_output_ada: lovelaceToAda(latestEpoch.output),
          },
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
