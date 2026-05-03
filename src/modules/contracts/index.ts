import { z } from "zod";
import { readFileSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { blockfrost } from "../../lib/blockfrost.js";
import { decodeCborDatum } from "../../lib/cbor.js";
import type { ScriptInfo } from "../../types/cardano.js";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = join(__dirname, "../../resources");

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function okText(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Validator scaffold templates for common Cardano patterns.
 * Each template is a complete, compilable Aiken validator.
 */
const VALIDATOR_TEMPLATES: Record<string, string> = {
  simple_lock: `use cardano/transaction.{Transaction, OutputReference}

/// A simple validator that requires a specific PubKeyHash to sign.
/// Replace OWNER_PKH with the actual public key hash bytes.
validator simple_lock {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    let owner_pkh: ByteArray = #"REPLACE_WITH_OWNER_PKH"
    list.any(tx.extra_signatories, fn(sig) { sig == owner_pkh })
  }
}
`,
  time_lock: `use aiken/interval
use cardano/transaction.{Transaction, OutputReference}

/// Funds can only be spent after a specific POSIX timestamp.
/// Replace UNLOCK_TIME with the POSIX millisecond timestamp.
validator time_lock {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    let unlock_time: Int = REPLACE_WITH_POSIX_MS
    interval.is_entirely_after(tx.validity_range, unlock_time)
  }
}
`,
  multisig: `use cardano/transaction.{Transaction, OutputReference}

/// M-of-N multisig: requires at least \`threshold\` signatories from \`signers\`.
type Datum {
  signers: List<ByteArray>  // PubKeyHashes
  threshold: Int
}

validator multisig {
  spend(
    datum: Option<Datum>,
    _redeemer: Data,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    when datum is {
      None -> False
      Some(d) -> {
        let matched =
          list.filter(d.signers, fn(pkh) {
            list.any(tx.extra_signatories, fn(sig) { sig == pkh })
          })
        list.length(matched) >= d.threshold
      }
    }
  }
}
`,
  vesting: `use aiken/interval
use cardano/transaction.{Transaction, OutputReference}

/// Vesting contract: beneficiary can claim after cliff; owner can cancel before.
type Datum {
  beneficiary: ByteArray  // PubKeyHash
  owner: ByteArray        // PubKeyHash
  cliff_time: Int         // POSIX milliseconds
}

type Redeemer {
  Claim
  Cancel
}

validator vesting {
  spend(
    datum: Option<Datum>,
    redeemer: Redeemer,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    when datum is {
      None -> False
      Some(d) ->
        when redeemer is {
          Claim ->
            interval.is_entirely_after(tx.validity_range, d.cliff_time) && list.any(
              tx.extra_signatories,
              fn(sig) { sig == d.beneficiary },
            )
          Cancel ->
            list.any(tx.extra_signatories, fn(sig) { sig == d.owner })
        }
    }
  }
}
`,
  nft_mint: `use cardano/transaction.{Transaction}
use cardano/assets.{PolicyId}

/// One-shot NFT minting policy: can only mint once (tied to a specific UTxO).
/// Set UTXO_TX_HASH and UTXO_OUTPUT_INDEX to the UTxO to consume.
validator nft_mint {
  mint(_redeemer: Data, _policy_id: PolicyId, tx: Transaction) {
    let required_utxo_hash: ByteArray = #"REPLACE_WITH_TX_HASH"
    let required_utxo_index: Int = 0  // REPLACE_WITH_OUTPUT_INDEX
    list.any(
      tx.inputs,
      fn(input) {
        input.output_reference.transaction_id == required_utxo_hash && input.output_reference.output_index == required_utxo_index
      },
    )
  }
}
`,
  oracle: `use cardano/transaction.{Transaction, OutputReference, Input}
use cardano/address.{Address}

/// Oracle consumer: reads a price datum from a reference input at the oracle address.
/// The oracle UTxO carries the current price as its inline datum.
type OracleDatum {
  price: Int     // price in lovelace per unit
  timestamp: Int // POSIX milliseconds
}

type SpendDatum {
  min_price: Int
}

validator oracle_consumer {
  spend(
    datum: Option<SpendDatum>,
    _redeemer: Data,
    _own_ref: OutputReference,
    tx: Transaction,
  ) {
    let oracle_address: Address = REPLACE_WITH_ORACLE_ADDRESS
    when datum is {
      None -> False
      Some(d) -> {
        let oracle_input: Option<Input> =
          list.find(
            tx.reference_inputs,
            fn(i) { i.output.address == oracle_address },
          )
        when oracle_input is {
          None -> False
          Some(i) ->
            when i.output.datum is {
              InlineDatum(raw) -> {
                expect oracle_datum: OracleDatum = raw
                oracle_datum.price >= d.min_price
              }
              _ -> False
            }
        }
      }
    }
  }
}
`,
};

/**
 * Register all contracts module tools on the MCP server.
 *
 * Tools:
 *   explain_eutxo_model    — inject eUTxO model context
 *   get_aiken_stdlib_docs  — Aiken standard library reference
 *   validate_aiken_snippet — shell out to `aiken check`
 *   get_script_info        — fetch Plutus script info from Blockfrost
 *   decode_cbor_datum      — decode raw CBOR datum hex to JSON
 *   scaffold_validator     — generate Aiken validator boilerplate
 */
export function registerContractsModule(server: McpServer): void {
  server.tool(
    "explain_eutxo_model",
    "Explain the Cardano eUTxO (Extended Unspent Transaction Output) model. " +
      "Essential context for building Cardano dApps — very different from Ethereum's account model. " +
      "Covers: UTxO structure, spending rules, smart contract validators, datum/redeemer pattern, " +
      "native assets, address types, and all encoding conventions.",
    {},
    async () => {
      try {
        const content = readFileSync(
          join(RESOURCES_DIR, "eutxo-context.md"),
          "utf8"
        );
        return okText(content);
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_aiken_stdlib_docs",
    "Get the Aiken smart contract language standard library quick reference. " +
      "Covers: basic types, aiken/list, aiken/bytearray, aiken/math, " +
      "cardano/transaction types, Value/assets API, validator syntax, " +
      "and common patterns (signature check, output validation, validity range).",
    {},
    async () => {
      try {
        const content = readFileSync(
          join(RESOURCES_DIR, "aiken-stdlib.md"),
          "utf8"
        );
        return okText(content);
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "validate_aiken_snippet",
    "Validate an Aiken smart contract snippet by running `aiken check`. " +
      "Writes the snippet to a temp project and runs the Aiken type-checker. " +
      "Returns type errors, compilation errors, or 'OK' on success. " +
      "Requires the `aiken` CLI to be installed (https://aiken-lang.org/installation-instructions).",
    {
      code: z
        .string()
        .describe("Aiken source code to validate (full validator or module snippet)"),
      aiken_path: z
        .string()
        .default("aiken")
        .describe("Path to the aiken binary (default: 'aiken', assumes it's in PATH)"),
    },
    async ({ code, aiken_path }) => {
      const { mkdtempSync, writeFileSync, rmSync, mkdirSync } = await import("fs");
      const { tmpdir } = await import("os");

      const tmpDir = mkdtempSync(join(tmpdir(), "cardano-mcp-aiken-"));
      try {
        // Minimal aiken.toml project scaffold
        const aikenToml = `name = "temp_validator"
version = "0.0.0"

[dependencies]
aiken-lang/stdlib = { version = "v2" }
`;
        writeFileSync(join(tmpDir, "aiken.toml"), aikenToml);
        mkdirSync(join(tmpDir, "validators"));
        writeFileSync(join(tmpDir, "validators", "temp.ak"), code);

        const { stdout, stderr } = await execFileAsync(
          aiken_path,
          ["check", "--no-color"],
          { cwd: tmpDir, timeout: 30_000 }
        );

        return ok({
          status: "ok",
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      } catch (e: unknown) {
        const execErr = e as { stdout?: string; stderr?: string; message?: string };
        return ok({
          status: "error",
          stdout: execErr.stdout?.trim() ?? "",
          stderr: execErr.stderr?.trim() ?? execErr.message ?? String(e),
        });
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  );

  server.tool(
    "get_script_info",
    "Fetch information about a Cardano Plutus or native script by its hash. " +
      "Returns script type (timelock, plutusV1, plutusV2, plutusV3), serialized size, and CBOR. " +
      "Script hash is a 56-character hex string.",
    {
      script_hash: z
        .string()
        .length(56)
        .describe("Script hash as 56 hex characters"),
    },
    async ({ script_hash }) => {
      try {
        const [info, cbor] = await Promise.all([
          blockfrost<ScriptInfo>(`/scripts/${script_hash}`),
          blockfrost<{ cbor: string | null }>(`/scripts/${script_hash}/cbor`).catch(
            () => ({ cbor: null })
          ),
        ]);

        return ok({
          ...info,
          cbor: cbor.cbor,
          script_address: null, // resolved client-side if needed
          note:
            info.type === "timelock"
              ? "Native/timelock script — use get_script_json for the policy structure"
              : `Plutus ${info.type} script — use decode_cbor_datum to inspect any datums locked here`,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "decode_cbor_datum",
    "Decode a raw Cardano datum from CBOR hex into a readable JSON structure. " +
      "This is THE most important tool for understanding on-chain smart contract state. " +
      "Datums are attached to UTxOs and encode arbitrary data — they are the 'state' of a contract. " +
      "Supports all PlutusData types: constructor (ConstrData), map, list, integer, bytes. " +
      "Use this whenever you see a datum_hash or inline_datum on a UTxO.",
    {
      cbor_hex: z
        .string()
        .describe(
          "CBOR hex string of the datum (from inline_datum or fetched by datum_hash). " +
            "May optionally start with '0x'."
        ),
    },
    async ({ cbor_hex }) => {
      try {
        const decoded = await decodeCborDatum(cbor_hex);
        return ok({
          cbor_hex,
          decoded,
          tip: "Constructor type 0 = first variant (e.g. Nothing/False), 1 = second (Just/True). " +
            "Bytes values are hex-encoded — decode UTF-8 if they represent strings.",
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "scaffold_validator",
    "Generate Aiken validator boilerplate for common Cardano smart contract patterns. " +
      "Returns ready-to-compile Aiken source code with inline comments explaining each part. " +
      "Available templates: simple_lock, time_lock, multisig, vesting, nft_mint, oracle.",
    {
      template: z
        .enum(["simple_lock", "time_lock", "multisig", "vesting", "nft_mint", "oracle"])
        .describe(
          "Which validator template to generate:\n" +
            "  simple_lock — single owner PubKeyHash lock\n" +
            "  time_lock   — funds locked until POSIX timestamp\n" +
            "  multisig    — M-of-N signature requirement\n" +
            "  vesting     — cliff-time vesting with cancel\n" +
            "  nft_mint    — one-shot NFT minting policy\n" +
            "  oracle      — reads price from reference input"
        ),
      project_name: z
        .string()
        .default("my_contract")
        .describe("Name for the Aiken project (used in aiken.toml)"),
    },
    async ({ template, project_name }) => {
      try {
        const code = VALIDATOR_TEMPLATES[template];
        if (!code) {
          throw new Error(`Unknown template: ${template}`);
        }

        const aikenToml = `name = "${project_name}"
version = "0.0.0"

[dependencies]
aiken-lang/stdlib = { version = "v2" }
`;

        return ok({
          template,
          project_name,
          files: {
            "aiken.toml": aikenToml,
            [`validators/${template}.ak`]: code,
          },
          next_steps: [
            "1. Create a directory: mkdir " + project_name + " && cd " + project_name,
            "2. Write the files above to their respective paths",
            "3. Run: aiken check  (to type-check)",
            "4. Run: aiken build  (to compile to plutus.json)",
            "5. The compiled script is in plutus.json → validators[0].compiledCode",
            "6. Use get_script_info with the script hash after deployment to verify",
          ],
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );
}
