import { z } from "zod";

export type CardanoNetwork = "mainnet" | "preprod" | "preview";

const NetworkSchema = z.enum(["mainnet", "preprod", "preview"]);

export const NETWORK: CardanoNetwork = NetworkSchema.parse(
  process.env["CARDANO_NETWORK"] ?? "mainnet"
);

export const BLOCKFROST_PROJECT_ID: string =
  process.env["BLOCKFROST_PROJECT_ID"] ?? "";

export const MAESTRO_API_KEY: string = process.env["MAESTRO_API_KEY"] ?? "";

export const KUPO_URL: string =
  process.env["KUPO_URL"] ?? "http://localhost:1442";

export const YACI_STORE_URL: string =
  process.env["YACI_STORE_URL"] ?? "http://localhost:8080";

const KOIOS_BASE_URLS: Record<CardanoNetwork, string> = {
  mainnet: "https://api.koios.rest/api/v1",
  preprod: "https://preprod.koios.rest/api/v1",
  preview: "https://preview.koios.rest/api/v1",
};

export const KOIOS_BASE_URL: string =
  process.env["KOIOS_URL"] ?? KOIOS_BASE_URLS[NETWORK];

const BLOCKFROST_BASE_URLS: Record<CardanoNetwork, string> = {
  mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
  preprod: "https://cardano-preprod.blockfrost.io/api/v0",
  preview: "https://cardano-preview.blockfrost.io/api/v0",
};

export const BLOCKFROST_BASE_URL: string = BLOCKFROST_BASE_URLS[NETWORK];

const MAESTRO_BASE_URLS: Record<CardanoNetwork, string> = {
  mainnet: "https://mainnet.gomaestro-api.org/v1",
  preprod: "https://preprod.gomaestro-api.org/v1",
  preview: "https://preview.gomaestro-api.org/v1",
};

export const MAESTRO_BASE_URL: string = MAESTRO_BASE_URLS[NETWORK];

export const LOVELACE_PER_ADA = 1_000_000n;

export function lovelaceToAda(lovelace: string | bigint): string {
  const val = typeof lovelace === "string" ? BigInt(lovelace) : lovelace;
  const whole = val / LOVELACE_PER_ADA;
  const remainder = val % LOVELACE_PER_ADA;
  const fracStr = remainder.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
}

export const MAX_RETRIES = 5;
export const RETRY_BASE_DELAY_MS = 500;
