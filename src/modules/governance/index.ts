import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { koios } from "../../lib/koios.js";
import type {
  GovernanceProposal,
  DRepInfo,
  Vote,
  CommitteeMember,
  GovActionType,
  ProposalStatus,
  VoterRole,
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
 * Full CIP-1694 governance module — 12 tools.
 *
 * Governance went live on Cardano mainnet with the Plomin Hard Fork (Jan 2025).
 * Three voting bodies: DReps (delegated representatives), SPOs (stake pool operators),
 * and the Constitutional Committee (CC).
 *
 * Tools:
 *   list_governance_proposals    — list all proposals with optional status filter
 *   get_proposal_details         — full detail for a single proposal
 *   get_proposal_votes           — all votes cast on a proposal
 *   list_dreps                   — list all registered DReps
 *   get_drep_info                — detail for a single DRep
 *   get_drep_votes               — all votes cast by a DRep
 *   get_drep_delegators          — addresses delegated to a DRep
 *   list_committee_members       — current Constitutional Committee composition
 *   get_committee_member_votes   — votes cast by a CC member
 *   get_voter_proposal_votes     — all votes from any voter (DRep/SPO/CC)
 *   get_treasury_balance         — current Cardano treasury balance
 *   get_constitution             — current on-chain constitution hash + URL
 */
export function registerGovernanceModule(server: McpServer): void {
  server.tool(
    "list_governance_proposals",
    "List Cardano CIP-1694 governance proposals. " +
      "Governance is live on mainnet since the Plomin Hard Fork (Jan 2025). " +
      "Filter by status (active/ratified/enacted/expired/dropped) or action type. " +
      "Returns proposal IDs, types, epoch info, deposit amounts, and metadata URLs.",
    {
      status: z
        .enum(["active", "ratified", "enacted", "expired", "dropped"])
        .optional()
        .describe("Filter proposals by status (default: all statuses)"),
      action_type: z
        .enum([
          "MotionOfNoConfidence",
          "UpdateCommittee",
          "UpdateConstitution",
          "HardForkInitiation",
          "ParameterChange",
          "TreasuryWithdrawal",
          "InfoAction",
        ])
        .optional()
        .describe("Filter by governance action type (optional)"),
    },
    async ({ status, action_type }) => {
      try {
        const body: Record<string, unknown> = {};
        if (status) body["_proposal_status"] = status;

        const proposals = await koios<GovernanceProposal[]>(
          "/proposal_list",
          body
        );

        const filtered = action_type
          ? proposals.filter((p) => p.gov_action_type === action_type)
          : proposals;

        return ok({
          count: filtered.length,
          filter: { status: status ?? "all", action_type: action_type ?? "all" },
          proposals: filtered,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_proposal_details",
    "Get full details for a specific Cardano governance proposal by its ID. " +
      "Proposal IDs use CIP-129 bech32 format (gov_action1...) or txHash#certIndex format. " +
      "Returns action type, epoch expiry, deposit, return address, ratification/expiry epochs.",
    {
      proposal_id: z
        .string()
        .describe(
          "Proposal ID in CIP-129 bech32 format (gov_action1...) " +
            "or txHash#certIndex format (e.g. abc123...#0)"
        ),
    },
    async ({ proposal_id }) => {
      try {
        const proposals = await koios<GovernanceProposal[]>("/proposal_list", {
          _proposal_ids: [proposal_id],
        });

        if (proposals.length === 0) {
          throw new Error(`Proposal ${proposal_id} not found`);
        }

        return ok(proposals[0]);
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_proposal_votes",
    "Get all votes cast on a specific governance proposal. " +
      "Returns votes from DReps, SPOs, and Constitutional Committee members. " +
      "Each vote includes: voter ID, role, choice (yes/no/abstain), and transaction info.",
    {
      proposal_id: z
        .string()
        .describe("Proposal ID in bech32 (gov_action1...) or txHash#certIndex format"),
      voter_role: z
        .enum(["drep", "spo", "committee"])
        .optional()
        .describe("Filter votes by voter role (optional)"),
    },
    async ({ proposal_id, voter_role }) => {
      try {
        const votes = await koios<Vote[]>("/proposal_votes", {
          _proposal_id: proposal_id,
        });

        const filtered = voter_role
          ? votes.filter((v) => v.voter_role === voter_role)
          : votes;

        const summary = {
          yes: filtered.filter((v) => v.vote === "yes").length,
          no: filtered.filter((v) => v.vote === "no").length,
          abstain: filtered.filter((v) => v.vote === "abstain").length,
        };

        return ok({
          proposal_id,
          total_votes: filtered.length,
          summary,
          votes: filtered,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "list_dreps",
    "List all registered Cardano Delegated Representatives (DReps). " +
      "DReps participate in governance by voting on proposals. " +
      "ADA holders can delegate their voting power to a DRep. " +
      "Returns DRep IDs (bech32 drep1...), voting power, registration status.",
    {
      status: z
        .enum(["registered", "retired", "any"])
        .default("registered")
        .describe("Filter by DRep registration status (default: registered)"),
    },
    async ({ status }) => {
      try {
        const dreps = await koios<DRepInfo[]>("/drep_list");

        const filtered =
          status === "any"
            ? dreps
            : status === "registered"
            ? dreps.filter((d) => d.registered && !d.retired)
            : dreps.filter((d) => d.retired);

        const totalVotingPower = filtered.reduce((sum, d) => {
          return sum + BigInt(d.voting_power ?? 0);
        }, 0n);

        return ok({
          count: filtered.length,
          total_voting_power_lovelace: totalVotingPower.toString(),
          dreps: filtered,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_drep_info",
    "Get detailed information about a specific Cardano DRep. " +
      "Returns voting power, deposit, metadata URL/hash, registration epoch, and script status. " +
      "DRep IDs use bech32 format: drep1... (per CIP-0005/129).",
    {
      drep_id: z
        .string()
        .describe("DRep ID in bech32 format (drep1...) or hex"),
    },
    async ({ drep_id }) => {
      try {
        const dreps = await koios<DRepInfo[]>("/drep_info", {
          _drep_ids: [drep_id],
        });

        if (dreps.length === 0) {
          throw new Error(`DRep ${drep_id} not found`);
        }

        return ok(dreps[0]);
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_drep_votes",
    "Get all governance votes cast by a specific DRep. " +
      "Returns proposal IDs, vote choices, and transaction info for each vote. " +
      "Useful for evaluating a DRep's governance track record before delegating.",
    {
      drep_id: z
        .string()
        .describe("DRep ID in bech32 format (drep1...)"),
    },
    async ({ drep_id }) => {
      try {
        const votes = await koios<Vote[]>("/drep_votes", {
          _drep_id: drep_id,
        });

        return ok({
          drep_id,
          vote_count: votes.length,
          votes,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_drep_delegators",
    "Get all addresses that have delegated their voting power to a specific DRep. " +
      "Returns delegator addresses and their delegated stake amounts in lovelace. " +
      "Useful for understanding a DRep's constituency.",
    {
      drep_id: z
        .string()
        .describe("DRep ID in bech32 format (drep1...)"),
    },
    async ({ drep_id }) => {
      try {
        const delegators = await koios<Array<{
          stake_address: string;
          amount: string;
          active_epoch_no: number;
        }>>("/drep_delegators", {
          _drep_id: drep_id,
        });

        const totalDelegated = delegators.reduce(
          (sum, d) => sum + BigInt(d.amount),
          0n
        );

        return ok({
          drep_id,
          delegator_count: delegators.length,
          total_delegated_lovelace: totalDelegated.toString(),
          delegators,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "list_committee_members",
    "List all current Cardano Constitutional Committee (CC) members. " +
      "The CC votes on constitutional matters and parameter changes. " +
      "Returns hot/cold credential IDs, status, expiration epoch, and script status.",
    {},
    async () => {
      try {
        const members = await koios<CommitteeMember[]>("/committee_info");

        const active = members.filter((m) => m.status === "active");
        const expired = members.filter((m) => m.status === "expired");

        return ok({
          total_members: members.length,
          active_count: active.length,
          expired_count: expired.length,
          members,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_committee_member_votes",
    "Get all governance votes cast by a Constitutional Committee member. " +
      "Use the hot credential ID (cc_hot1...) to identify the member. " +
      "Returns proposal IDs, vote choices, and transaction details.",
    {
      cc_hot_id: z
        .string()
        .describe("Constitutional Committee hot credential ID (bech32 cc_hot1... or hex)"),
    },
    async ({ cc_hot_id }) => {
      try {
        const votes = await koios<Vote[]>("/committee_votes", {
          _cc_hot_id: cc_hot_id,
        });

        return ok({
          cc_hot_id,
          vote_count: votes.length,
          votes,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_voter_proposal_votes",
    "Get all governance votes for a specific voter on all proposals. " +
      "Works for any voter role: DRep, SPO, or Constitutional Committee member. " +
      "Returns a complete voting history with proposal IDs and vote choices.",
    {
      voter_id: z
        .string()
        .describe("Voter ID — DRep (drep1...), SPO pool ID (pool1...), or CC hot ID"),
      voter_role: z
        .enum(["drep", "spo", "committee"])
        .describe("Role of the voter"),
    },
    async ({ voter_id, voter_role }) => {
      try {
        const endpointMap: Record<VoterRole, string> = {
          drep: "/drep_votes",
          spo: "/pool_votes",
          committee: "/committee_votes",
        };

        const bodyKeyMap: Record<VoterRole, string> = {
          drep: "_drep_id",
          spo: "_pool_bech32",
          committee: "_cc_hot_id",
        };

        const endpoint = endpointMap[voter_role];
        const bodyKey = bodyKeyMap[voter_role];

        const votes = await koios<Vote[]>(endpoint, {
          [bodyKey]: voter_id,
        });

        return ok({
          voter_id,
          voter_role,
          vote_count: votes.length,
          votes,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_treasury_balance",
    "Get the current Cardano treasury balance in lovelace and ADA. " +
      "The treasury accumulates from transaction fees and protocol reserve draws. " +
      "Treasury withdrawals require a governance proposal and vote.",
    {},
    async () => {
      try {
        const totals = await koios<Array<{
          treasury: string;
          reserves: string;
          epoch_no: number;
        }>>("/totals");

        const latest = totals[totals.length - 1];
        if (!latest) throw new Error("No totals data returned from Koios");

        const treasuryLovelace = BigInt(latest.treasury);
        const reservesLovelace = BigInt(latest.reserves);

        return ok({
          epoch: latest.epoch_no,
          treasury_lovelace: latest.treasury,
          treasury_ada: (treasuryLovelace / 1_000_000n).toString(),
          reserves_lovelace: latest.reserves,
          reserves_ada: (reservesLovelace / 1_000_000n).toString(),
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_constitution",
    "Get the current Cardano on-chain constitution. " +
      "Returns the IPFS/URL of the constitution document and its hash. " +
      "The constitution was ratified via CIP-1694 governance and defines the rules " +
      "for the Constitutional Committee and governance actions.",
    {},
    async () => {
      try {
        const constitution = await koios<Array<{
          url: string;
          data_hash: string;
          script_hash: string | null;
          epoch_no: number;
        }>>("/constitution");

        const latest = constitution[constitution.length - 1];
        if (!latest) throw new Error("No constitution data returned from Koios");

        return ok({
          epoch: latest.epoch_no,
          url: latest.url,
          data_hash: latest.data_hash,
          script_hash: latest.script_hash,
          note: "The data_hash is the Blake2b-256 hash of the constitution document at the URL",
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );
}

// Exported for re-use in tests
export type { GovActionType, ProposalStatus, VoterRole };
