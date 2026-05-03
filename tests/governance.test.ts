import { describe, it, expect, vi, beforeEach } from "vitest";
import proposalFixture from "./fixtures/proposal.json";
import drepFixture from "./fixtures/drep.json";

vi.mock("../src/lib/koios.js", () => ({
  koios: vi.fn(),
}));

const { koios } = await import("../src/lib/koios.js");
const koiosMock = vi.mocked(koios);

function createMockServer() {
  const tools: Record<string, { handler: Function }> = {};
  return {
    tool(name: string, _desc: string, _schema: unknown, handler: Function) {
      tools[name] = { handler };
    },
    tools,
  };
}

describe("governance module", () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(async () => {
    server = createMockServer();
    vi.clearAllMocks();
    const { registerGovernanceModule } = await import(
      "../src/modules/governance/index.js"
    );
    registerGovernanceModule(server as never);
  });

  describe("list_governance_proposals", () => {
    it("returns all proposals when no filter", async () => {
      koiosMock.mockResolvedValueOnce(proposalFixture);

      const result = await server.tools["list_governance_proposals"]!.handler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.proposals[0].gov_action_type).toBe("InfoAction");
    });

    it("filters by action_type client-side", async () => {
      koiosMock.mockResolvedValueOnce(proposalFixture);

      const result = await server.tools["list_governance_proposals"]!.handler({
        action_type: "ParameterChange",
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      // Fixture has InfoAction, filter for ParameterChange should return 0
      expect(data.count).toBe(0);
    });

    it("returns error on koios failure", async () => {
      koiosMock.mockRejectedValueOnce(new Error("Koios unavailable"));

      const result = await server.tools["list_governance_proposals"]!.handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Koios unavailable");
    });
  });

  describe("get_proposal_details", () => {
    it("returns first proposal from list", async () => {
      koiosMock.mockResolvedValueOnce(proposalFixture);

      const result = await server.tools["get_proposal_details"]!.handler({
        proposal_id: proposalFixture[0]!.proposal_id,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.deposit).toBe("1000000000");
    });

    it("returns error when proposal not found", async () => {
      koiosMock.mockResolvedValueOnce([]);

      const result = await server.tools["get_proposal_details"]!.handler({
        proposal_id: "gov_action1notexist",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("get_proposal_votes", () => {
    it("summarizes yes/no/abstain counts", async () => {
      const fakeVotes = [
        { voter_role: "drep", voter_id: "drep1a", vote: "yes", proposal_id: "gov1", tx_hash: "a".repeat(64), block_time: 1700000000, meta_url: null, meta_hash: null },
        { voter_role: "drep", voter_id: "drep1b", vote: "no", proposal_id: "gov1", tx_hash: "b".repeat(64), block_time: 1700000001, meta_url: null, meta_hash: null },
        { voter_role: "spo", voter_id: "pool1c", vote: "abstain", proposal_id: "gov1", tx_hash: "c".repeat(64), block_time: 1700000002, meta_url: null, meta_hash: null },
      ];

      koiosMock.mockResolvedValueOnce(fakeVotes);

      const result = await server.tools["get_proposal_votes"]!.handler({
        proposal_id: "gov1",
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.summary.yes).toBe(1);
      expect(data.summary.no).toBe(1);
      expect(data.summary.abstain).toBe(1);
      expect(data.total_votes).toBe(3);
    });

    it("filters by voter_role", async () => {
      const fakeVotes = [
        { voter_role: "drep", voter_id: "drep1a", vote: "yes", proposal_id: "gov1", tx_hash: "a".repeat(64), block_time: 1700000000, meta_url: null, meta_hash: null },
        { voter_role: "spo", voter_id: "pool1b", vote: "no", proposal_id: "gov1", tx_hash: "b".repeat(64), block_time: 1700000001, meta_url: null, meta_hash: null },
      ];

      koiosMock.mockResolvedValueOnce(fakeVotes);

      const result = await server.tools["get_proposal_votes"]!.handler({
        proposal_id: "gov1",
        voter_role: "drep",
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.total_votes).toBe(1);
    });
  });

  describe("list_dreps", () => {
    it("returns registered dreps with total voting power", async () => {
      koiosMock.mockResolvedValueOnce(drepFixture);

      const result = await server.tools["list_dreps"]!.handler({
        status: "registered",
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.total_voting_power_lovelace).toBe("10000000000");
    });

    it("filters out retired dreps when status=registered", async () => {
      const mixed = [
        { ...drepFixture[0], registered: true, retired: false },
        { ...drepFixture[0], drep_id: "drep2", registered: true, retired: true },
      ];
      koiosMock.mockResolvedValueOnce(mixed);

      const result = await server.tools["list_dreps"]!.handler({
        status: "registered",
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
    });
  });

  describe("get_treasury_balance", () => {
    it("returns treasury and reserve in lovelace and ADA", async () => {
      koiosMock.mockResolvedValueOnce([
        { treasury: "1500000000000000", reserves: "8000000000000000", epoch_no: 450 },
      ]);

      const result = await server.tools["get_treasury_balance"]!.handler({});

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.treasury_lovelace).toBe("1500000000000000");
      expect(data.treasury_ada).toBe("1500000000");
    });
  });

  describe("get_voter_proposal_votes", () => {
    it("routes drep to /drep_votes endpoint", async () => {
      koiosMock.mockResolvedValueOnce([]);

      const result = await server.tools["get_voter_proposal_votes"]!.handler({
        voter_id: "drep1abc",
        voter_role: "drep",
      });

      expect(koiosMock).toHaveBeenCalledWith("/drep_votes", { _drep_id: "drep1abc" });
      expect(result.isError).toBeUndefined();
    });

    it("routes spo to /pool_votes endpoint", async () => {
      koiosMock.mockResolvedValueOnce([]);

      await server.tools["get_voter_proposal_votes"]!.handler({
        voter_id: "pool1abc",
        voter_role: "spo",
      });

      expect(koiosMock).toHaveBeenCalledWith("/pool_votes", { _pool_bech32: "pool1abc" });
    });
  });
});
