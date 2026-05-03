import { describe, it, expect, vi, beforeEach } from "vitest";
import utxoFixture from "./fixtures/utxos.json";

// Mock the blockfrost client before importing the module
vi.mock("../src/lib/blockfrost.js", () => ({
  blockfrost: vi.fn(),
  blockfrostPost: vi.fn(),
}));

vi.mock("../src/lib/koios.js", () => ({
  koios: vi.fn(),
}));

const { blockfrost } = await import("../src/lib/blockfrost.js");
const { koios } = await import("../src/lib/koios.js");
const blockfrostMock = vi.mocked(blockfrost);
const koiosMock = vi.mocked(koios);

// Build a minimal McpServer mock that captures registered tools
function createMockServer() {
  const tools: Record<string, { handler: Function }> = {};
  return {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
      tools[name] = { handler };
    },
    tools,
  };
}

describe("query module", () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(async () => {
    server = createMockServer();
    vi.clearAllMocks();
    const { registerQueryModule } = await import("../src/modules/query/index.js");
    registerQueryModule(server as never);
  });

  describe("get_address_utxos", () => {
    it("returns UTxOs with total lovelace sum", async () => {
      blockfrostMock.mockResolvedValueOnce(utxoFixture);

      const result = await server.tools["get_address_utxos"]!.handler({
        address: "addr1qxy6n2x3w6zy7hk9x6l3e9m8p7q2r4s5t6u7v8w9x0y1z2a3b4c5d6e7f8",
        page: 1,
        count: 100,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.utxo_count).toBe(2);
      expect(data.total_lovelace).toBe("7000000");
      expect(data.total_ada).toBe("7");
    });

    it("returns error when blockfrost throws", async () => {
      blockfrostMock.mockRejectedValueOnce(new Error("Network error"));

      const result = await server.tools["get_address_utxos"]!.handler({
        address: "addr1test",
        page: 1,
        count: 100,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Network error");
    });
  });

  describe("get_tx_details", () => {
    it("fetches tx and utxos in parallel and merges them", async () => {
      const fakeTx = {
        hash: "abc123".padEnd(64, "0"),
        block: "block1",
        block_height: 9000000,
        block_time: 1700000000,
        slot: 100000000,
        index: 0,
        output_amount: [{ unit: "lovelace", quantity: "5000000" }],
        fees: "170000",
        deposit: "0",
        size: 300,
        invalid_before: null,
        invalid_hereafter: null,
      };
      const fakeUtxos = {
        hash: "abc123".padEnd(64, "0"),
        inputs: [],
        outputs: [],
      };

      blockfrostMock
        .mockResolvedValueOnce(fakeTx)
        .mockResolvedValueOnce(fakeUtxos);

      const result = await server.tools["get_tx_details"]!.handler({
        tx_hash: "a".repeat(64),
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.hash).toBe(fakeTx.hash);
      expect(data.utxos).toBeDefined();
    });
  });

  describe("get_asset_info", () => {
    it("handles dotted asset format", async () => {
      const fakeAsset = {
        asset: "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc736f6d657468696e67",
        policy_id: "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc",
        asset_name: "736f6d657468696e67",
        fingerprint: "asset1abc",
        quantity: "1000",
        initial_mint_tx_hash: "abc".padEnd(64, "0"),
        mint_or_burn_count: 1,
        onchain_metadata: null,
        onchain_metadata_standard: null,
        metadata: null,
      };

      blockfrostMock.mockResolvedValueOnce(fakeAsset);

      const result = await server.tools["get_asset_info"]!.handler({
        asset: "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc.736f6d657468696e67",
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.asset_name_utf8).toBe("something");
    });
  });

  describe("query_address_history", () => {
    it("limits results to count param", async () => {
      const fakeTxs = Array.from({ length: 100 }, (_, i) => ({
        tx_hash: `tx${i}`.padEnd(64, "0"),
        epoch_no: 450,
        block_height: 9000000 + i,
        block_time: 1700000000 + i,
      }));

      koiosMock.mockResolvedValueOnce(fakeTxs);

      const result = await server.tools["query_address_history"]!.handler({
        address: "addr1test",
        count: 10,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.tx_count).toBe(10);
    });
  });
});
