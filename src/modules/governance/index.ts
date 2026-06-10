import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { koios } from "../../lib/koios.js";
import type {
  DRepInfo,
  Vote,
  CommitteeMember,
  GovActionType,
  ProposalStatus,
  VoterRole,
} from "../../types/cardano.js";

const IPFS_GATEWAY = "https://ipfs.lidonation.com/ipfs";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

// ── IPFS helpers ─────────────────────────────────────────────────────────────

async function fetchCip100(url: string | null): Promise<Record<string, any> | null> {
  if (!url) return null;
  try {
    const endpoint = url.startsWith("ipfs://")
      ? `${IPFS_GATEWAY}/${url.slice(7)}`
      : url;
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null;
    return res.json() as Promise<Record<string, any>>;
  } catch {
    return null;
  }
}

function extractProposalMeta(doc: Record<string, any>): {
  title: string | null;
  abstract: string | null;
  rationale: string | null;
  motivation: string | null;
} {
  const body = (doc?.body ?? {}) as Record<string, any>;
  return {
    title:      (body.title as string)      ?? null,
    abstract:   (body.abstract as string)   ?? null,
    rationale:  (body.rationale as string)  ?? null,
    motivation: (body.motivation as string) ?? null,
  };
}

// CIP-119 DRep metadata fields
function extractDRepMeta(doc: Record<string, any>): {
  name: string | null;
  bio: string | null;
  objectives: string | null;
  qualifications: string | null;
  paymentAddress: string | null;
  references: Array<{ type: string; label: string; uri: string }>;
} {
  const body = (doc?.body ?? {}) as Record<string, any>;
  const refs: Array<{ type: string; label: string; uri: string }> = [];
  for (const r of (body.references as any[]) ?? []) {
    if (r?.uri) refs.push({ type: r["@type"] ?? "Link", label: r.label ?? "", uri: r.uri });
  }
  return {
    name:           (body.givenName as string)      ?? (body.name as string)       ?? null,
    bio:            (body.motivations as string)    ?? (body.bio as string)        ?? null,
    objectives:     (body.objectives as string)     ?? null,
    qualifications: (body.qualifications as string) ?? null,
    paymentAddress: (body.paymentAddress as string) ?? null,
    references:     refs,
  };
}

function predictOutcome(tally: { yes: number; no: number; abstain: number }): {
  prediction: "likely_to_pass" | "likely_to_fail" | "too_close_to_call" | "insufficient_data";
  confidence: "high" | "medium" | "low";
  reasoning: string;
} {
  const decisive = tally.yes + tally.no;
  if (decisive < 5) {
    return { prediction: "insufficient_data", confidence: "low", reasoning: "Not enough decisive votes to predict outcome yet." };
  }
  const yesRatio = tally.yes / decisive;
  const yesPct = Math.round(yesRatio * 100);
  if (yesRatio >= 0.67) {
    return {
      prediction: "likely_to_pass",
      confidence: decisive >= 20 ? "high" : "medium",
      reasoning: `${yesPct}% of decisive votes (yes+no) are YES. Exceeds the typical 2/3 threshold.`,
    };
  }
  if (yesRatio <= 0.33) {
    return {
      prediction: "likely_to_fail",
      confidence: decisive >= 20 ? "high" : "medium",
      reasoning: `Only ${yesPct}% of decisive votes are YES. Below the typical 1/3 minimum.`,
    };
  }
  return {
    prediction: "too_close_to_call",
    confidence: "low",
    reasoning: `YES: ${yesPct}%, NO: ${100 - yesPct}% — within the uncertain band between 33–67%.`,
  };
}

function lovelaceToAda(lovelace: string | number | null | undefined): string | null {
  if (lovelace == null) return null;
  return (Number(String(lovelace)) / 1_000_000).toFixed(0);
}

/**
 * Full CIP-1694 governance module — 13 tools.
 *
 * Governance went live on Cardano mainnet with the Plomin Hard Fork (Jan 2025).
 * Three voting bodies: DReps (delegated representatives), SPOs (stake pool operators),
 * and the Constitutional Committee (CC).
 *
 * Data is enriched at the MCP layer:
 *   - Proposal titles and abstracts fetched from CIP-100/108 IPFS metadata
 *   - Vote tallies aggregated per proposal in get_proposal_details
 *   - Outcome predictions calculated from current vote distribution
 *   - DRep identity fetched from CIP-119 IPFS metadata
 *   - DRep voting patterns computed from full vote history
 */
export function registerGovernanceModule(server: McpServer): void {

  // ── Proposals ─────────────────────────────────────────────────────────────

  server.tool(
    "list_governance_proposals",
    "List Cardano CIP-1694 governance proposals, enriched with human-readable titles and abstracts " +
      "fetched from CIP-100/108 IPFS metadata anchors. " +
      "Filter by status (active/ratified/enacted/expired/dropped) or action type. " +
      "Returns: proposal IDs, types, epoch info, deposit amounts, titles, and abstracts. " +
      "For full vote tallies and outcome predictions use get_proposal_details.",
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

        const raw = await koios<any[]>("/proposal_list", body);

        const filtered = action_type
          ? raw.filter((p: any) => p.gov_action_type === action_type)
          : raw;

        // Enrich each proposal with IPFS metadata where Koios hasn't indexed it
        const enriched = await Promise.all(
          filtered.map(async (p: any) => {
            let meta = extractProposalMeta(p.meta_json ?? {});

            if (!meta.title && p.meta_url) {
              const doc = await fetchCip100(p.meta_url);
              if (doc) meta = extractProposalMeta(doc);
            }

            // Withdrawal amount (present in meta_json for TreasuryWithdrawal proposals)
            const withdrawalLovelace: string | null =
              p.meta_json?.body?.withdrawal_amount ??
              p.withdrawal_amount ??
              null;

            return {
              proposal_id:      p.proposal_id,
              tx_hash:          p.tx_hash,
              cert_index:       p.cert_index ?? 0,
              gov_action_type:  p.gov_action_type,
              proposal_status:  p.proposal_status,
              epoch_no:         p.epoch_no,
              epoch_expiry:     p.epoch_expiry,
              deposit_lovelace: p.deposit ?? null,
              meta_url:         p.meta_url ?? null,
              // Enriched fields:
              title:                 meta.title,
              abstract:              meta.abstract ? meta.abstract.slice(0, 300) : null,
              withdrawal_lovelace:   withdrawalLovelace,
              withdrawal_ada:        lovelaceToAda(withdrawalLovelace),
            };
          })
        );

        return ok({
          count: enriched.length,
          filter: { status: status ?? "all", action_type: action_type ?? "all" },
          note: "titles and abstracts enriched from CIP-100/108 IPFS metadata. Use get_proposal_details for vote tallies and outcome prediction.",
          proposals: enriched,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_proposal_details",
    "Get full details for a single governance proposal, including: " +
      "complete CIP-100/108 IPFS metadata (title, abstract, rationale, motivation), " +
      "vote tally broken down by voter role (DRep / SPO / CC), " +
      "and an AI-free outcome prediction based on the current vote distribution vs the ~67% threshold. " +
      "Use this after list_governance_proposals to drill into a specific proposal.",
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
        const [proposals, votes] = await Promise.all([
          koios<any[]>("/proposal_list", { _proposal_ids: [proposal_id] }),
          koios<any[]>("/proposal_votes", { _proposal_id: proposal_id }).catch(() => [] as any[]),
        ]);

        if (proposals.length === 0) {
          throw new Error(`Proposal ${proposal_id} not found`);
        }

        const p = proposals[0];

        // Enrich with full IPFS metadata
        let meta = extractProposalMeta(p.meta_json ?? {});
        if (!meta.title && p.meta_url) {
          const doc = await fetchCip100(p.meta_url);
          if (doc) meta = extractProposalMeta(doc);
        }

        // Aggregate vote tallies per role
        const tally = { yes: 0, no: 0, abstain: 0 };
        const byRole: Record<string, { yes: number; no: number; abstain: number }> = {};

        for (const v of votes as any[]) {
          const choice = ((v.vote ?? "") as string).toLowerCase() as "yes" | "no" | "abstain";
          const role   = ((v.voter_role ?? "unknown") as string).toLowerCase();
          if (!byRole[role]) byRole[role] = { yes: 0, no: 0, abstain: 0 };
          if (choice === "yes" || choice === "no" || choice === "abstain") {
            tally[choice]++;
            byRole[role][choice]++;
          }
        }

        const total = tally.yes + tally.no + tally.abstain;
        const yesPct    = total ? Math.round((tally.yes / total) * 100) : 0;
        const noPct     = total ? Math.round((tally.no  / total) * 100) : 0;
        const abstainPct = total ? Math.round((tally.abstain / total) * 100) : 0;

        const outcome = predictOutcome(tally);

        const withdrawalLovelace: string | null = p.meta_json?.body?.withdrawal_amount ?? p.withdrawal_amount ?? null;

        return ok({
          proposal_id:      p.proposal_id,
          tx_hash:          p.tx_hash,
          cert_index:       p.cert_index ?? 0,
          gov_action_type:  p.gov_action_type,
          proposal_status:  p.proposal_status,
          epoch_no:         p.epoch_no,
          epoch_expiry:     p.epoch_expiry,
          deposit_lovelace: p.deposit,
          meta_url:         p.meta_url ?? null,
          return_address:   p.return_address ?? null,
          withdrawal_lovelace: withdrawalLovelace,
          withdrawal_ada:      lovelaceToAda(withdrawalLovelace),
          // Full IPFS metadata
          title:      meta.title,
          abstract:   meta.abstract,
          rationale:  meta.rationale,
          motivation: meta.motivation,
          // Vote data
          vote_summary: {
            total_votes:  total,
            yes:          tally.yes,
            no:           tally.no,
            abstain:      tally.abstain,
            yes_pct:      yesPct,
            no_pct:       noPct,
            abstain_pct:  abstainPct,
            by_role:      byRole,
          },
          // Outcome prediction
          outcome_prediction: outcome,
        });
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
        const votes = await koios<Vote[]>("/proposal_votes", { _proposal_id: proposal_id });

        const filtered = voter_role
          ? votes.filter((v) => v.voter_role === voter_role)
          : votes;

        const summary = {
          yes:     filtered.filter((v) => v.vote === "yes").length,
          no:      filtered.filter((v) => v.vote === "no").length,
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

  // ── DReps ─────────────────────────────────────────────────────────────────

  server.tool(
    "list_dreps",
    "List all registered Cardano Delegated Representatives (DReps). " +
      "Returns DRep IDs (bech32 drep1...), voting power, and registration status. " +
      "For full identity and voting history use get_drep_profile.",
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

        const totalVotingPower = filtered.reduce((sum, d) => sum + BigInt(d.voting_power ?? 0), 0n);

        return ok({
          count: filtered.length,
          total_voting_power_lovelace: totalVotingPower.toString(),
          total_voting_power_ada: lovelaceToAda(totalVotingPower.toString()),
          dreps: filtered.map((d) => ({
            drep_id:           d.drep_id,
            voting_power_ada:  lovelaceToAda(d.voting_power),
            voting_power_lovelace: d.voting_power,
            registered:        d.registered,
            retired:           d.retired,
            has_script:        d.has_script,
            meta_url:          d.meta_url,
          })),
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_drep_info",
    "Get basic information about a specific DRep: voting power, deposit, registration status, and metadata URL. " +
      "For full identity (name, bio from CIP-119) and voting history use get_drep_profile instead.",
    {
      drep_id: z.string().describe("DRep ID in bech32 format (drep1...) or hex"),
    },
    async ({ drep_id }) => {
      try {
        const dreps = await koios<DRepInfo[]>("/drep_info", { _drep_ids: [drep_id] });
        if (dreps.length === 0) throw new Error(`DRep ${drep_id} not found`);

        const d = dreps[0]!;

        // Enrich with CIP-119 IPFS identity metadata
        const doc = await fetchCip100(d.meta_url);
        const identity = doc ? extractDRepMeta(doc) : null;

        return ok({
          ...d,
          voting_power_ada: lovelaceToAda(d.voting_power),
          identity,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_drep_profile",
    "Get a complete profile for a DRep including: " +
      "identity (name, bio, objectives, qualifications, links from CIP-119 IPFS metadata), " +
      "voting power in ADA, registration status, " +
      "voting statistics (total votes cast, % yes/no/abstain, breakdown by governance action type), " +
      "and the 10 most recent votes with proposal types. " +
      "Use this when a user asks 'who is DRep X', 'how does DRep X vote', or 'tell me about DRep X'.",
    {
      drep_id: z.string().describe("DRep ID in bech32 format (drep1...) or hex"),
    },
    async ({ drep_id }) => {
      try {
        // Fetch DRep info and votes in parallel
        const [dreps, votes] = await Promise.all([
          koios<DRepInfo[]>("/drep_info", { _drep_ids: [drep_id] }),
          koios<any[]>("/drep_votes", { _drep_id: drep_id }).catch(() => [] as any[]),
        ]);

        if (dreps.length === 0) throw new Error(`DRep ${drep_id} not found`);
        const d = dreps[0]!;

        // Enrich with CIP-119 IPFS identity metadata
        const doc = await fetchCip100(d.meta_url);
        const identity = doc ? extractDRepMeta(doc) : null;

        // Compute voting statistics
        const totals = { yes: 0, no: 0, abstain: 0 };
        const byActionType: Record<string, { yes: number; no: number; abstain: number }> = {};

        for (const v of votes as any[]) {
          const choice = ((v.vote ?? "") as string).toLowerCase() as "yes" | "no" | "abstain";
          const actionType: string = (v.gov_action_type as string) ?? "Unknown";
          if (!byActionType[actionType]) byActionType[actionType] = { yes: 0, no: 0, abstain: 0 };
          if (choice === "yes" || choice === "no" || choice === "abstain") {
            totals[choice]++;
            byActionType[actionType][choice]++;
          }
        }

        const totalVotes = totals.yes + totals.no + totals.abstain;

        const votingStats = {
          total_votes: totalVotes,
          yes:         totals.yes,
          no:          totals.no,
          abstain:     totals.abstain,
          yes_pct:     totalVotes ? Math.round((totals.yes / totalVotes) * 100) : 0,
          no_pct:      totalVotes ? Math.round((totals.no  / totalVotes) * 100) : 0,
          abstain_pct: totalVotes ? Math.round((totals.abstain / totalVotes) * 100) : 0,
          by_action_type: byActionType,
        };

        // Most recent 10 votes
        const recentVotes = (votes as any[])
          .sort((a: any, b: any) => (b.block_time ?? 0) - (a.block_time ?? 0))
          .slice(0, 10)
          .map((v: any) => ({
            proposal_id:    v.proposal_id,
            gov_action_type: v.gov_action_type ?? null,
            vote:           v.vote,
            tx_hash:        v.tx_hash,
            meta_url:       v.meta_url ?? null,
          }));

        return ok({
          drep_id:               d.drep_id,
          status:                d.retired ? "retired" : d.registered ? "active" : "unregistered",
          voting_power_lovelace: d.voting_power,
          voting_power_ada:      lovelaceToAda(d.voting_power),
          deposit_lovelace:      d.deposit,
          has_script:            d.has_script,
          registered_epoch:      d.active_epoch_no,
          meta_url:              d.meta_url,
          identity,
          voting_stats:  votingStats,
          recent_votes:  recentVotes,
        });
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
      drep_id: z.string().describe("DRep ID in bech32 format (drep1...)"),
    },
    async ({ drep_id }) => {
      try {
        const votes = await koios<Vote[]>("/drep_votes", { _drep_id: drep_id });
        return ok({ drep_id, vote_count: votes.length, votes });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_drep_delegators",
    "Get all addresses that have delegated their voting power to a specific DRep. " +
      "Returns delegator addresses and their delegated stake amounts in lovelace.",
    {
      drep_id: z.string().describe("DRep ID in bech32 format (drep1...)"),
    },
    async ({ drep_id }) => {
      try {
        const delegators = await koios<Array<{
          stake_address: string;
          amount: string;
          active_epoch_no: number;
        }>>("/drep_delegators", { _drep_id: drep_id });

        const totalDelegated = delegators.reduce((sum, d) => sum + BigInt(d.amount), 0n);

        return ok({
          drep_id,
          delegator_count: delegators.length,
          total_delegated_lovelace: totalDelegated.toString(),
          total_delegated_ada: lovelaceToAda(totalDelegated.toString()),
          delegators,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── Constitutional Committee ───────────────────────────────────────────────

  server.tool(
    "list_committee_members",
    "List all current Cardano Constitutional Committee (CC) members. " +
      "The CC votes on constitutional matters and parameter changes. " +
      "Returns hot/cold credential IDs, status, expiration epoch, and script status.",
    {},
    async () => {
      try {
        const members = await koios<CommitteeMember[]>("/committee_info");
        const active  = members.filter((m) => m.status === "active");
        const expired = members.filter((m) => m.status === "expired");
        return ok({ total_members: members.length, active_count: active.length, expired_count: expired.length, members });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_committee_member_votes",
    "Get all governance votes cast by a Constitutional Committee member. " +
      "Use the hot credential ID (cc_hot1...) to identify the member.",
    {
      cc_hot_id: z.string().describe("Constitutional Committee hot credential ID (bech32 cc_hot1... or hex)"),
    },
    async ({ cc_hot_id }) => {
      try {
        const votes = await koios<Vote[]>("/committee_votes", { _cc_hot_id: cc_hot_id });
        return ok({ cc_hot_id, vote_count: votes.length, votes });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_voter_proposal_votes",
    "Get all governance votes for a specific voter on all proposals. " +
      "Works for any voter role: DRep, SPO, or Constitutional Committee member.",
    {
      voter_id: z.string().describe("Voter ID — DRep (drep1...), SPO pool ID (pool1...), or CC hot ID"),
      voter_role: z.enum(["drep", "spo", "committee"]).describe("Role of the voter"),
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
        const votes = await koios<Vote[]>(endpointMap[voter_role], { [bodyKeyMap[voter_role]]: voter_id });
        return ok({ voter_id, voter_role, vote_count: votes.length, votes });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── Treasury & Constitution ────────────────────────────────────────────────

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
          epoch:            latest.epoch_no,
          treasury_lovelace: latest.treasury,
          treasury_ada:      (treasuryLovelace / 1_000_000n).toString(),
          reserves_lovelace: latest.reserves,
          reserves_ada:      (reservesLovelace / 1_000_000n).toString(),
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  server.tool(
    "get_constitution",
    "Get the current Cardano on-chain constitution. " +
      "Returns the IPFS URL of the constitution document and its hash.",
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
          epoch:       latest.epoch_no,
          url:         latest.url,
          data_hash:   latest.data_hash,
          script_hash: latest.script_hash,
        });
      } catch (e: unknown) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );
}

export type { GovActionType, ProposalStatus, VoterRole };
