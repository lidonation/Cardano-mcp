import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { blockfrost, blockfrostPost } from "../../lib/blockfrost.js";
import { lovelaceToAda } from "../../config.js";
import type { ProtocolParams } from "../../types/cardano.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

export function registerTxBuilderModule(server: McpServer): void {
  server.tool(
    "get_protocol_params",
    "Fetch the current Cardano protocol parameters for the latest epoch. " +
      "These are required for fee calculation, min-ADA computation, and transaction building. " +
      "Key params: min_fee_a, min_fee_b, coins_per_utxo_size, max_tx_size.",
    {},
    async () => {
      try {
        const params = await blockfrost<ProtocolParams>(
          "/epochs/latest/parameters"
        );
        return ok(params);
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "calculate_min_ada",
    "Calculate the minimum ADA (in lovelace) required for a UTxO output on Cardano. " +
      "Every UTxO must carry at least this amount. " +
      "The minimum increases with the size of the datum and number of native assets. " +
      "Returns the minimum in both lovelace and ADA.",
    {
      num_assets: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Number of distinct native asset types in the output (0 for ADA-only)"),
      has_datum: z
        .boolean()
        .default(false)
        .describe("Whether the output carries an inline datum"),
      datum_bytes: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Size of the inline datum in bytes (0 if no datum)"),
      num_policies: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Number of distinct policy IDs (needed for accurate bundleSize calc)"),
      total_asset_name_bytes: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Total bytes of all asset names in the output"),
    },
    async ({ num_assets, has_datum, datum_bytes, num_policies, total_asset_name_bytes }) => {
      try {
        const params = await blockfrost<ProtocolParams>(
          "/epochs/latest/parameters"
        );
        const coinsPerUtxoByte = BigInt(params.coins_per_utxo_size ?? "4310");

        // Babbage UTxO size formula (CIP-55)
        // base size + assets overhead + datum overhead
        const BASE_OUTPUT_OVERHEAD = 160n; // bytes for address + lovelace encoding
        const ASSET_OVERHEAD = 12n; // per-asset overhead
        const POLICY_OVERHEAD = 28n; // per-policy overhead
        const DATUM_HASH_BYTES = 32n; // datum hash size
        const DATUM_OVERHEAD = 8n; // datum option tag

        let utxoBytes = BASE_OUTPUT_OVERHEAD;

        if (num_assets > 0) {
          utxoBytes +=
            POLICY_OVERHEAD * BigInt(num_policies) +
            ASSET_OVERHEAD * BigInt(num_assets) +
            BigInt(total_asset_name_bytes);
        }

        if (has_datum) {
          utxoBytes += datum_bytes > 0
            ? DATUM_OVERHEAD + BigInt(datum_bytes)
            : DATUM_HASH_BYTES;
        }

        const minLovelace = utxoBytes * coinsPerUtxoByte;

        return ok({
          min_lovelace: minLovelace.toString(),
          min_ada: lovelaceToAda(minLovelace),
          utxo_bytes_estimate: utxoBytes.toString(),
          coins_per_utxo_byte: coinsPerUtxoByte.toString(),
          note: "This is an estimate. Actual minimum may vary slightly based on exact encoding.",
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "build_payment_tx",
    "Build an unsigned Cardano payment transaction for sending ADA or native tokens. " +
      "Automatically selects UTxOs (coin selection), calculates fees, and adds change output. " +
      "Returns an unsigned CBOR hex transaction — sign it with a wallet before submitting. " +
      "Amounts are in lovelace (1 ADA = 1,000,000 lovelace).",
    {
      sender_address: z
        .string()
        .describe("Bech32 address of the sender (must hold sufficient funds)"),
      recipient_address: z
        .string()
        .describe("Bech32 address of the recipient"),
      lovelace_amount: z
        .string()
        .describe(
          "Amount to send in lovelace (e.g. '5000000' for 5 ADA). " +
            "Use '0' to send only native tokens."
        ),
      native_assets: z
        .array(
          z.object({
            unit: z.string().describe("policyId+hexAssetName concatenated"),
            quantity: z.string().describe("Amount to send"),
          })
        )
        .default([])
        .describe("Native assets to include in the output (optional)"),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Transaction metadata as JSON object (optional)"),
      ttl_slots: z
        .number()
        .int()
        .positive()
        .default(7200)
        .describe("Transaction validity window in slots (default: 7200 ≈ 2 hours)"),
    },
    async ({
      sender_address,
      recipient_address,
      lovelace_amount,
      native_assets,
      metadata,
      ttl_slots,
    }) => {
      try {
        const { MeshTxBuilder } = await import("@meshsdk/core");

        const utxos = await blockfrost<Array<{
          tx_hash: string;
          tx_index: number;
          amount: Array<{ unit: string; quantity: string }>;
        }>>(`/addresses/${sender_address}/utxos`);

        if (utxos.length === 0) {
          throw new Error(`No UTxOs found at address ${sender_address}`);
        }

        const latestBlock = await blockfrost<{ slot: number }>("/blocks/latest");
        const ttl = latestBlock.slot + ttl_slots;

        const txBuilder = new MeshTxBuilder();

        for (const utxo of utxos) {
          txBuilder.txIn(
            utxo.tx_hash,
            utxo.tx_index,
            utxo.amount,
            sender_address
          );
        }

        const outputAssets: Array<{ unit: string; quantity: string }> = [];
        if (BigInt(lovelace_amount) > 0n) {
          outputAssets.push({ unit: "lovelace", quantity: lovelace_amount });
        }
        outputAssets.push(...native_assets);

        txBuilder
          .txOut(recipient_address, outputAssets)
          .changeAddress(sender_address)
          .invalidHereafter(ttl);

        if (metadata) {
          txBuilder.metadataValue("674", metadata);
        }

        const unsignedTx = await txBuilder.complete();

        return ok({
          unsigned_tx: unsignedTx,
          sender: sender_address,
          recipient: recipient_address,
          amount_lovelace: lovelace_amount,
          amount_ada: lovelaceToAda(lovelace_amount),
          native_assets,
          ttl,
          note: "Sign with your wallet key and submit via submit_transaction",
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "build_smart_contract_tx",
    "Build an unsigned Cardano transaction that spends a UTxO locked at a Plutus smart contract. " +
      "Requires the script CBOR, a redeemer, and collateral UTxO. " +
      "The redeemer tells the validator what action is being performed. " +
      "Returns an unsigned CBOR hex transaction.",
    {
      script_cbor: z
        .string()
        .describe("Plutus script as CBOR hex (the validator code)"),
      script_address: z
        .string()
        .describe("The script address where the UTxO is locked"),
      utxo_tx_hash: z
        .string()
        .length(64)
        .describe("Transaction hash of the UTxO to spend from the script"),
      utxo_tx_index: z
        .number()
        .int()
        .min(0)
        .describe("Output index of the UTxO at the script address"),
      redeemer_cbor: z
        .string()
        .describe("Redeemer data as CBOR hex — passed to the validator"),
      datum_cbor: z
        .string()
        .optional()
        .describe(
          "Datum CBOR hex (required if UTxO has datum hash, not inline datum)"
        ),
      recipient_address: z
        .string()
        .describe("Address to receive the unlocked funds"),
      change_address: z
        .string()
        .describe("Address for transaction change output"),
      collateral_tx_hash: z
        .string()
        .length(64)
        .describe("Transaction hash of the collateral UTxO (ADA-only UTxO)"),
      collateral_tx_index: z
        .number()
        .int()
        .min(0)
        .describe("Output index of the collateral UTxO"),
      collateral_address: z
        .string()
        .describe("Address holding the collateral UTxO"),
    },
    async ({
      script_cbor,
      script_address,
      utxo_tx_hash,
      utxo_tx_index,
      redeemer_cbor,
      datum_cbor,
      recipient_address,
      change_address,
      collateral_tx_hash,
      collateral_tx_index,
      collateral_address,
    }) => {
      try {
        const { MeshTxBuilder } = await import("@meshsdk/core");

        const utxos = await blockfrost<Array<{
          tx_hash: string;
          tx_index: number;
          amount: Array<{ unit: string; quantity: string }>;
          inline_datum: string | null;
          data_hash: string | null;
        }>>(`/addresses/${script_address}/utxos`);

        const targetUtxo = utxos.find(
          (u) => u.tx_hash === utxo_tx_hash && u.tx_index === utxo_tx_index
        );
        if (!targetUtxo) {
          throw new Error(
            `UTxO ${utxo_tx_hash}#${utxo_tx_index} not found at ${script_address}`
          );
        }

        const collateralUtxos = await blockfrost<Array<{
          tx_hash: string;
          tx_index: number;
          amount: Array<{ unit: string; quantity: string }>;
        }>>(`/addresses/${collateral_address}/utxos`);

        const collateral = collateralUtxos.find(
          (u) =>
            u.tx_hash === collateral_tx_hash &&
            u.tx_index === collateral_tx_index
        );
        if (!collateral) {
          throw new Error(
            `Collateral UTxO ${collateral_tx_hash}#${collateral_tx_index} not found`
          );
        }

        const latestBlock = await blockfrost<{ slot: number }>("/blocks/latest");
        const ttl = latestBlock.slot + 7200;

        const txBuilder = new MeshTxBuilder();

        txBuilder.spendingPlutusScriptV2()
          .txIn(
            targetUtxo.tx_hash,
            targetUtxo.tx_index,
            targetUtxo.amount,
            script_address
          )
          .txInScript(script_cbor)
          .txInRedeemerValue(redeemer_cbor, "CBOR");

        if (datum_cbor) {
          txBuilder.txInDatumValue(datum_cbor, "CBOR");
        }

        txBuilder.txInCollateral(
          collateral.tx_hash,
          collateral.tx_index,
          collateral.amount,
          collateral_address
        );

        txBuilder
          .txOut(recipient_address, targetUtxo.amount)
          .changeAddress(change_address)
          .invalidHereafter(ttl);

        const unsignedTx = await txBuilder.complete();

        return ok({
          unsigned_tx: unsignedTx,
          script_address,
          spent_utxo: `${utxo_tx_hash}#${utxo_tx_index}`,
          recipient: recipient_address,
          ttl,
          note: "Sign with your wallet key and submit via submit_transaction",
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "submit_transaction",
    "Submit a signed Cardano transaction to the network via Blockfrost. " +
      "The transaction must be fully signed and serialized as CBOR hex. " +
      "Returns the transaction hash on success. " +
      "Use build_payment_tx or build_smart_contract_tx to create the transaction first.",
    {
      signed_tx_cbor: z
        .string()
        .describe("Fully signed transaction as CBOR hex"),
    },
    async ({ signed_tx_cbor }) => {
      try {
        const txBytes = Buffer.from(signed_tx_cbor, "hex");
        const txHash = await blockfrostPost<string>(
          "/tx/submit",
          txBytes,
          "application/cbor"
        );

        return ok({
          tx_hash: txHash,
          status: "submitted",
          explorer_url: `https://cardanoscan.io/transaction/${txHash}`,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
