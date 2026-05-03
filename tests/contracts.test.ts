import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/blockfrost.js", () => ({
  blockfrost: vi.fn(),
  blockfrostPost: vi.fn(),
}));

vi.mock("../src/lib/cbor.js", () => ({
  decodeCborDatum: vi.fn(),
}));

const { blockfrost } = await import("../src/lib/blockfrost.js");
const { decodeCborDatum } = await import("../src/lib/cbor.js");
const blockfrostMock = vi.mocked(blockfrost);
const decodeMock = vi.mocked(decodeCborDatum);

function createMockServer() {
  const tools: Record<string, { handler: Function }> = {};
  return {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
      tools[name] = { handler };
    },
    tools,
  };
}

describe("contracts module", () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(async () => {
    server = createMockServer();
    vi.clearAllMocks();
    const { registerContractsModule } = await import(
      "../src/modules/contracts/index.js"
    );
    registerContractsModule(server as never);
  });

  describe("explain_eutxo_model", () => {
    it("returns eUTxO context markdown content", async () => {
      const result = await server.tools["explain_eutxo_model"]!.handler({});
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("eUTxO");
      expect(result.content[0].text).toContain("UTxO");
    });
  });

  describe("get_aiken_stdlib_docs", () => {
    it("returns Aiken stdlib reference", async () => {
      const result = await server.tools["get_aiken_stdlib_docs"]!.handler({});
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("aiken/list");
      expect(result.content[0].text).toContain("validator");
    });
  });

  describe("decode_cbor_datum", () => {
    it("decodes CBOR hex and returns structured JSON", async () => {
      const decoded = { type: "constructor" as const, constr_index: 0, fields: [] };
      decodeMock.mockResolvedValueOnce(decoded);

      const result = await server.tools["decode_cbor_datum"]!.handler({
        cbor_hex: "d87980",
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.decoded.type).toBe("constructor");
      expect(data.decoded.constr_index).toBe(0);
      expect(decodeMock).toHaveBeenCalledWith("d87980");
    });

    it("returns error when CBOR is invalid", async () => {
      decodeMock.mockRejectedValueOnce(new Error("Invalid CBOR"));

      const result = await server.tools["decode_cbor_datum"]!.handler({
        cbor_hex: "invalidhex",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Invalid CBOR");
    });
  });

  describe("get_script_info", () => {
    it("fetches script info and cbor in parallel", async () => {
      const fakeInfo = {
        script_hash: "a".repeat(56),
        type: "plutusV2",
        serialised_size: 1234,
      };
      const fakeCbor = { cbor: "deadbeef" };

      blockfrostMock
        .mockResolvedValueOnce(fakeInfo)
        .mockResolvedValueOnce(fakeCbor);

      const result = await server.tools["get_script_info"]!.handler({
        script_hash: "a".repeat(56),
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.type).toBe("plutusV2");
      expect(data.cbor).toBe("deadbeef");
    });

    it("handles missing cbor gracefully (returns null)", async () => {
      blockfrostMock
        .mockResolvedValueOnce({ script_hash: "a".repeat(56), type: "timelock", serialised_size: null })
        .mockRejectedValueOnce(new Error("404"));

      const result = await server.tools["get_script_info"]!.handler({
        script_hash: "a".repeat(56),
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.cbor).toBeNull();
    });
  });

  describe("scaffold_validator", () => {
    it("returns aiken.toml and validator source for simple_lock", async () => {
      const result = await server.tools["scaffold_validator"]!.handler({
        template: "simple_lock",
        project_name: "my_lock",
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.template).toBe("simple_lock");
      expect(data.files["aiken.toml"]).toContain("my_lock");
      expect(data.files["validators/simple_lock.ak"]).toContain("validator");
      expect(data.next_steps).toBeInstanceOf(Array);
    });

    it("returns all six templates without error", async () => {
      const templates = ["simple_lock", "time_lock", "multisig", "vesting", "nft_mint", "oracle"] as const;
      for (const template of templates) {
        const result = await server.tools["scaffold_validator"]!.handler({
          template,
          project_name: "test",
        });
        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.files[`validators/${template}.ak`]).toBeTruthy();
      }
    });
  });
});
