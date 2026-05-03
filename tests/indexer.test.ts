import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/lib/kupo.js", () => ({
  getMatches: vi.fn(),
  watchPattern: vi.fn(),
  getKupoHealth: vi.fn(),
}));

const { getMatches, watchPattern, getKupoHealth } = await import("../src/lib/kupo.js");
const getMatchesMock = vi.mocked(getMatches);
const watchPatternMock = vi.mocked(watchPattern);
const getKupoHealthMock = vi.mocked(getKupoHealth);

// Mock fetch for the Yaci Store passthrough
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function createMockServer() {
  const tools: Record<string, { handler: Function }> = {};
  return {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
      tools[name] = { handler };
    },
    tools,
  };
}

const fakeKupoMatch = {
  transaction_index: 0,
  transaction_id: "abc".padEnd(64, "0"),
  output_index: 0,
  address: "addr1qtest",
  value: { coins: 5000000, assets: {} },
  datum_hash: null,
  script_hash: null,
  created_at: { slot_no: 100000, header_hash: "block1" },
  spent_at: null,
};

describe("indexer module", () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(async () => {
    server = createMockServer();
    vi.clearAllMocks();
    const { registerIndexerModule } = await import(
      "../src/modules/indexer/index.js"
    );
    registerIndexerModule(server as never);
  });

  describe("watch_address", () => {
    it("calls watchPattern and returns registered status", async () => {
      watchPatternMock.mockResolvedValueOnce(undefined);

      const result = await server.tools["watch_address"]!.handler({
        pattern: "addr1qtest",
      });

      expect(watchPatternMock).toHaveBeenCalledWith("addr1qtest");
      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe("registered");
      expect(data.pattern).toBe("addr1qtest");
    });

    it("returns error when Kupo is unreachable", async () => {
      watchPatternMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await server.tools["watch_address"]!.handler({
        pattern: "addr1qtest",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("ECONNREFUSED");
    });
  });

  describe("query_kupo_matches", () => {
    it("returns only unspent UTxOs by default", async () => {
      const spentMatch = { ...fakeKupoMatch, spent_at: { slot_no: 200000, header_hash: "block2" } };
      getMatchesMock.mockResolvedValueOnce([fakeKupoMatch, spentMatch]);

      const result = await server.tools["query_kupo_matches"]!.handler({
        pattern: "addr1qtest",
        unspent_only: true,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.match_count).toBe(1);
      expect(data.total_lovelace).toBe("5000000");
    });

    it("returns all matches when unspent_only=false", async () => {
      const spentMatch = { ...fakeKupoMatch, spent_at: { slot_no: 200000, header_hash: "block2" } };
      getMatchesMock.mockResolvedValueOnce([fakeKupoMatch, spentMatch]);

      const result = await server.tools["query_kupo_matches"]!.handler({
        pattern: "addr1qtest",
        unspent_only: false,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.match_count).toBe(2);
    });

    it("sums lovelace across all unspent matches", async () => {
      const match2 = { ...fakeKupoMatch, value: { coins: 3000000, assets: {} } };
      getMatchesMock.mockResolvedValueOnce([fakeKupoMatch, match2]);

      const result = await server.tools["query_kupo_matches"]!.handler({
        pattern: "addr1qtest",
        unspent_only: true,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.total_lovelace).toBe("8000000");
    });
  });

  describe("get_rollup_status", () => {
    it("computes sync_percent and slots_behind", async () => {
      getKupoHealthMock.mockResolvedValueOnce({
        connection_status: "connected",
        most_recent_checkpoint: 95000000,
        most_recent_node_tip: 100000000,
        configuration: {},
      });

      const result = await server.tools["get_rollup_status"]!.handler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.slots_behind).toBe(5000000);
      expect(data.is_synced).toBe(false);
      expect(data.sync_percent).toBe("95.00%");
    });

    it("marks is_synced=true when slots_behind < 100", async () => {
      getKupoHealthMock.mockResolvedValueOnce({
        connection_status: "connected",
        most_recent_checkpoint: 100000050,
        most_recent_node_tip: 100000051,
        configuration: {},
      });

      const result = await server.tools["get_rollup_status"]!.handler({});

      const data = JSON.parse(result.content[0].text);
      expect(data.is_synced).toBe(true);
    });

    it("returns helpful error when Kupo is down", async () => {
      getKupoHealthMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await server.tools["get_rollup_status"]!.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("KUPO_URL");
    });
  });

  describe("query_custom_indexer", () => {
    it("passes GET request to Yaci Store URL", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: "test" }),
      });

      const result = await server.tools["query_custom_indexer"]!.handler({
        path: "/api/v1/utxos",
        method: "GET",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/utxos"),
        expect.objectContaining({ method: "GET" })
      );
      expect(result.isError).toBeUndefined();
    });

    it("appends query_params to URL", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await server.tools["query_custom_indexer"]!.handler({
        path: "/api/v1/txs",
        method: "GET",
        query_params: { page: "1", size: "10" },
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/page=1.*size=10|size=10.*page=1/),
        expect.any(Object)
      );
    });

    it("returns error on non-ok response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      const result = await server.tools["query_custom_indexer"]!.handler({
        path: "/api/v1/missing",
        method: "GET",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("404");
    });
  });
});
