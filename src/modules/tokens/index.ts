import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { blockfrost } from "../../lib/blockfrost.js";
import { koios } from "../../lib/koios.js";
import type { AssetInfo, Asset } from "../../types/cardano.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

interface PolicyAsset {
  asset: string;
  quantity: string;
}

interface AddressAsset {
  policy_id: string;
  asset_name: string; // hex
  fingerprint: string;
  quantity: string;
  asset_name_utf8?: string;
}

/**
 * Register all token module tools on the MCP server.
 *
 * Tools:
 *   get_nft_metadata       — fetch CIP-25/68 NFT metadata
 *   list_wallet_assets     — list all native assets at an address
 *   build_mint_transaction — build an unsigned native asset minting tx
 *   get_policy_assets      — list all assets under a minting policy
 */
export function registerTokensModule(server: McpServer): void {
  server.tool(
    "get_nft_metadata",
    "Fetch on-chain metadata for a Cardano NFT or native asset. " +
      "Supports CIP-25 (metadata in mint tx) and CIP-68 (datum-based metadata). " +
      "Returns name, description, image, traits/attributes, and raw on-chain data. " +
      "Asset format: policyId.hexAssetName",
    {
      asset: z
        .string()
        .describe(
          "Asset identifier: policyId.hexAssetName or policyId+hexAssetName. " +
            "Example: d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc.spacecoins"
        ),
    },
    async ({ asset }) => {
      try {
        const assetId = asset.replace(".", "");
        const info = await blockfrost<AssetInfo>(`/assets/${assetId}`);

        const assetNameUtf8 = info.asset_name
          ? Buffer.from(info.asset_name, "hex").toString("utf8")
          : null;

        return ok({
          asset: info.asset,
          policy_id: info.policy_id,
          asset_name_hex: info.asset_name,
          asset_name_utf8: assetNameUtf8,
          fingerprint: info.fingerprint,
          total_supply: info.quantity,
          mint_tx: info.initial_mint_tx_hash,
          metadata_standard: info.onchain_metadata_standard,
          onchain_metadata: info.onchain_metadata,
          offchain_metadata: info.metadata,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "list_wallet_assets",
    "List all native assets (tokens and NFTs) held at a Cardano address. " +
      "Returns policy IDs, asset names, fingerprints, and quantities. " +
      "This uses Koios for free access without API key requirements.",
    {
      address: z
        .string()
        .describe(
          "Bech32 Cardano address (addr1... mainnet, addr_test1... testnet)"
        ),
    },
    async ({ address }) => {
      try {
        const assets = await koios<AddressAsset[]>("/address_assets", {
          _addresses: [address],
        });

        const withUtf8 = assets.map((a) => ({
          ...a,
          asset_name_utf8: a.asset_name
            ? Buffer.from(a.asset_name, "hex").toString("utf8")
            : null,
          full_asset_id: `${a.policy_id}.${a.asset_name}`,
        }));

        return ok({
          address,
          asset_count: withUtf8.length,
          assets: withUtf8,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "build_mint_transaction",
    "Build an unsigned Cardano transaction that mints native assets. " +
      "Supports both simple (native script / timelock) and Plutus minting policies. " +
      "Returns an unsigned CBOR transaction hex that must be signed before submission. " +
      "For Plutus minting, provide the redeemer.",
    {
      minting_address: z
        .string()
        .describe(
          "Address that will pay the tx fee and receive the minted tokens"
        ),
      policy_id: z
        .string()
        .describe("The minting policy ID (56 hex chars = hash of the script)"),
      asset_name: z
        .string()
        .describe("Asset name as UTF-8 string (will be hex-encoded automatically)"),
      quantity: z
        .string()
        .describe("Number of tokens to mint (as string to avoid BigInt overflow)"),
      native_script: z
        .string()
        .optional()
        .describe(
          "Native script JSON as string (for timelock / multisig policies)"
        ),
      plutus_script_cbor: z
        .string()
        .optional()
        .describe("Plutus minting script as CBOR hex (for Plutus policies)"),
      redeemer: z
        .string()
        .optional()
        .describe(
          "Redeemer data as CBOR hex (required for Plutus minting policies)"
        ),
      recipient_address: z
        .string()
        .optional()
        .describe(
          "Address to send minted tokens to (defaults to minting_address)"
        ),
    },
    async ({
      minting_address,
      policy_id,
      asset_name,
      quantity,
      native_script,
      plutus_script_cbor,
      redeemer,
      recipient_address,
    }) => {
      try {
        // Dynamic import to keep startup fast
        const { MeshTxBuilder, BrowserWallet } = await import("@meshsdk/core");
        void BrowserWallet; // imported for type context, not used directly

        const assetNameHex = Buffer.from(asset_name, "utf8").toString("hex");
        const recipient = recipient_address ?? minting_address;

        const txBuilder = new MeshTxBuilder();

        if (plutus_script_cbor) {
          if (!redeemer) {
            throw new Error(
              "redeemer is required when using a Plutus minting policy"
            );
          }
          txBuilder
            .mintingScript(plutus_script_cbor)
            .mint(quantity, policy_id, assetNameHex)
            .mintRedeemerValue(redeemer, "Mesh");
        } else if (native_script) {
          txBuilder
            .mintingScript(native_script)
            .mint(quantity, policy_id, assetNameHex);
        } else {
          throw new Error(
            "Either native_script or plutus_script_cbor must be provided"
          );
        }

        txBuilder
          .changeAddress(minting_address)
          .txOut(recipient, [
            { unit: `${policy_id}${assetNameHex}`, quantity },
          ]);

        const unsignedTx = await txBuilder.complete();

        return ok({
          unsigned_tx: unsignedTx,
          policy_id,
          asset_name_utf8: asset_name,
          asset_name_hex: assetNameHex,
          quantity,
          recipient,
          note: "Sign this transaction with your wallet before submitting via submit_transaction",
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_policy_assets",
    "List all assets minted under a given Cardano policy ID. " +
      "Useful for inspecting an NFT collection or token policy. " +
      "Returns asset IDs and current circulating quantities.",
    {
      policy_id: z
        .string()
        .length(56)
        .describe("Minting policy ID (56 hex characters)"),
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
        .describe("Results per page (default: 100)"),
    },
    async ({ policy_id, page, count }) => {
      try {
        const assets = await blockfrost<PolicyAsset[]>(
          `/assets/policy/${policy_id}?page=${page}&count=${count}&order=asc`
        );

        const withNames = assets.map((a) => {
          const hexName = a.asset.slice(policy_id.length);
          const utf8Name = hexName
            ? Buffer.from(hexName, "hex").toString("utf8")
            : "";
          return {
            asset_id: `${policy_id}.${hexName}`,
            asset_name_hex: hexName,
            asset_name_utf8: utf8Name,
            quantity: a.quantity,
          };
        });

        const totalSupply = assets.reduce(
          (sum, a) => sum + BigInt(a.quantity),
          0n
        );

        return ok({
          policy_id,
          asset_count: withNames.length,
          total_supply: totalSupply.toString(),
          assets: withNames,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );
}

// Re-export Asset type for convenience
export type { Asset };
