/**
 * Cardano MCP demo bridge server
 *
 * Wraps the same Blockfrost + Koios calls that the MCP server makes and
 * exposes them as plain HTTP POST /tools/:toolName endpoints so the React
 * frontend can call them from the browser.
 *
 * Start with:  tsx watch server.ts
 * Listens on:  http://localhost:3001
 */

import express from "express";
import cors from "cors";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const BF_KEY        = process.env.BLOCKFROST_PROJECT_ID ?? "";
const NETWORK       = process.env.CARDANO_NETWORK ?? "mainnet";
const KOIOS_URL     = process.env.KOIOS_URL ?? "https://api.koios.rest/api/v1";
const BF_URL        = `https://cardano-${NETWORK}.blockfrost.io/api/v0`;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const IPFS_GATEWAY  = "https://ipfs.lidonation.com/ipfs";

const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;
const PORT     = parseInt(process.env.DEMO_PORT ?? "3001", 10);

// ── API helpers ─────────────────────────────────────────────────────────────

async function bf<T>(path: string): Promise<T> {
  const res = await fetch(`${BF_URL}${path}`, {
    headers: { project_id: BF_KEY },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Blockfrost ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function koios<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${KOIOS_URL}${path}`, {
    method: body !== undefined ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const b = await res.text();
    throw new Error(`Koios ${path} → ${res.status}: ${b}`);
  }
  return res.json() as Promise<T>;
}

/** Resolve an ipfs:// URL through the Lidonation gateway and return parsed JSON */
async function fetchIpfs<T = unknown>(ipfsUrl: string): Promise<T | null> {
  try {
    const cid = ipfsUrl.replace("ipfs://", "");
    const res = await fetch(`${IPFS_GATEWAY}/${cid}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("json")) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Extract CIP-100/108 proposal metadata from an IPFS document */
function extractIpfsMeta(doc: any): { title: string | null; abstract: string | null; rationale: string | null; motivation: string | null } {
  const body = doc?.body ?? {};
  return {
    title:      body.title      ?? null,
    abstract:   body.abstract   ?? null,
    rationale:  body.rationale  ?? null,
    motivation: body.motivation ?? null,
  };
}

/** Extract CIP-119 DRep identity metadata from an IPFS document */
function extractDRepMeta(doc: any): {
  name: string | null;
  bio: string | null;
  objectives: string | null;
  qualifications: string | null;
  paymentAddress: string | null;
  references: Array<{ type: string; label: string; uri: string }>;
} {
  const body = doc?.body ?? {};
  const refs: Array<{ type: string; label: string; uri: string }> = [];
  for (const r of body.references ?? []) {
    if (r?.uri) refs.push({ type: r["@type"] ?? "Link", label: r.label ?? "", uri: r.uri });
  }
  return {
    name:           body.givenName ?? body.name ?? null,
    bio:            body.motivations ?? body.bio ?? null,
    objectives:     body.objectives ?? null,
    qualifications: body.qualifications ?? null,
    paymentAddress: body.paymentAddress ?? null,
    references:     refs,
  };
}

function predictOutcome(tally: { yes: number; no: number; abstain: number }): {
  prediction: string;
  confidence: string;
  reasoning: string;
} {
  const decisive = tally.yes + tally.no;
  if (decisive < 5) return { prediction: "insufficient_data", confidence: "low", reasoning: "Not enough decisive votes yet." };
  const yesRatio = tally.yes / decisive;
  const yesPct = Math.round(yesRatio * 100);
  if (yesRatio >= 0.67) return { prediction: "likely_to_pass", confidence: decisive >= 20 ? "high" : "medium", reasoning: `${yesPct}% of decisive votes are YES.` };
  if (yesRatio <= 0.33) return { prediction: "likely_to_fail", confidence: decisive >= 20 ? "high" : "medium", reasoning: `Only ${yesPct}% of decisive votes are YES.` };
  return { prediction: "too_close_to_call", confidence: "low", reasoning: `YES: ${yesPct}%, NO: ${100 - yesPct}% — within the uncertain band.` };
}

function lovelaceToAda(lovelace: string | number | bigint): string {
  const n = typeof lovelace === "bigint" ? lovelace : BigInt(String(lovelace));
  return (Number(n) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

// ── Tool handlers ───────────────────────────────────────────────────────────

type Params = Record<string, unknown>;

async function handleTool(name: string, params: Params): Promise<unknown> {
  switch (name) {

    // ── Query tools ──────────────────────────────────────────────────────
    case "get_network_info": {
      const [block, epoch] = await Promise.all([
        bf<any>("/blocks/latest"),
        bf<any>("/epochs/latest"),
      ]);
      return {
        network: NETWORK,
        chain_tip: {
          block_hash:   block.hash,
          block_height: block.height,
          slot:         block.slot,
          epoch:        block.epoch,
          block_time:   new Date(block.time * 1000).toISOString(),
        },
        current_epoch: {
          epoch:            epoch.epoch,
          start_time:       new Date(epoch.start_time * 1000).toISOString(),
          end_time:         new Date(epoch.end_time   * 1000).toISOString(),
          block_count:      epoch.block_count,
          tx_count:         epoch.tx_count,
          total_output_ada: lovelaceToAda(epoch.output ?? "0"),
        },
      };
    }

    case "get_address_utxos": {
      const address = params.address as string;
      const utxos = await bf<any[]>(`/addresses/${address}/utxos?page=1&count=100&order=asc`);
      const totalLovelace = utxos.reduce((sum, u) => {
        const lv = (u.amount as any[]).find((a) => a.unit === "lovelace");
        return sum + BigInt(lv?.quantity ?? 0);
      }, 0n);

      // Collect all native assets across UTxOs
      const assetMap = new Map<string, bigint>();
      for (const u of utxos) {
        for (const a of u.amount as any[]) {
          if (a.unit !== "lovelace") {
            assetMap.set(a.unit, (assetMap.get(a.unit) ?? 0n) + BigInt(a.quantity));
          }
        }
      }

      return {
        address,
        utxo_count:      utxos.length,
        total_ada:       lovelaceToAda(totalLovelace),
        total_lovelace:  totalLovelace.toString(),
        native_assets:   Array.from(assetMap.entries()).map(([unit, qty]) => ({
          unit,
          policy_id:  unit.slice(0, 56),
          asset_name: unit.slice(56),
          asset_name_utf8: unit.slice(56)
            ? Buffer.from(unit.slice(56), "hex").toString("utf8")
            : "(no name)",
          quantity: qty.toString(),
        })),
      };
    }

    case "query_address_history": {
      const address = params.address as string;
      const count = (params.count as number) ?? 10;
      // Blockfrost gives us reliable recent tx list
      const txs = await bf<any[]>(`/addresses/${address}/transactions?count=${count}&order=desc`);
      return { address, tx_count: txs.length, transactions: txs };
    }

    case "get_protocol_params": {
      return bf<any>("/epochs/latest/parameters");
    }

    // ── Token tools ──────────────────────────────────────────────────────
    case "get_asset_info":
    case "get_nft_metadata": {
      const assetId = (params.asset as string).replace(".", "");
      const info = await bf<any>(`/assets/${assetId}`);
      return {
        ...info,
        asset_name_utf8: info.asset_name
          ? Buffer.from(info.asset_name as string, "hex").toString("utf8")
          : null,
      };
    }

    case "get_policy_assets": {
      const policy_id = params.policy_id as string;
      const assets = await bf<any[]>(`/assets/policy/${policy_id}?page=1&count=100`);
      return {
        policy_id,
        asset_count: assets.length,
        assets: assets.map((a) => {
          const hexName = (a.asset as string).slice(policy_id.length);
          return {
            asset_id:       a.asset,
            asset_name_hex: hexName,
            asset_name_utf8: hexName
              ? Buffer.from(hexName, "hex").toString("utf8")
              : "(no name)",
            quantity: a.quantity,
          };
        }),
      };
    }

    // ── Governance tools — Koios for rich metadata, Blockfrost for vote aggregation ──

    case "list_governance_proposals": {
      // Try Koios first — it includes title, abstract, rationale from CIP-100 metadata
      let proposals: any[] = [];
      try {
        const raw = await koios<any[]>("/proposal_list?limit=100&order=block_time.desc");
        // Filter to active only (not ratified, enacted, dropped, or expired)
        proposals = (raw ?? []).filter(
          (p) =>
            p.ratified_epoch == null &&
            p.enacted_epoch  == null &&
            p.dropped_epoch  == null &&
            p.expired_epoch  == null
        );
      } catch {
        // Koios unavailable — fall back to Blockfrost (no rich metadata)
        const pages = await Promise.all(
          [1, 2, 3].map((pg) =>
            bf<any[]>(`/governance/proposals?count=100&page=${pg}&order=desc`).catch(() => [])
          )
        );
        const all = pages.flat();
        proposals = all.filter(
          (p) =>
            p.ratified_epoch == null &&
            p.enacted_epoch  == null &&
            p.dropped_epoch  == null &&
            p.expired_epoch  == null
        );
      }

      // Normalise to a common shape + fetch IPFS metadata for proposals
      // where Koios hasn't indexed the CIP-100 body yet
      const normalised = await Promise.all(
        proposals.map(async (p: any) => {
          let body = p.meta_json?.body ?? {};

          // If Koios didn't return a title, fetch the metadata document from IPFS
          if (!body.title && p.meta_url) {
            const doc = await fetchIpfs<any>(p.meta_url).catch(() => null);
            if (doc) body = doc?.body ?? body;
          }

          return {
            proposal_id:     p.proposal_id     ?? p.id,
            tx_hash:         p.proposal_tx_hash ?? p.tx_hash,
            cert_index:      p.proposal_index   ?? p.cert_index ?? 0,
            governance_type: p.proposal_type    ?? p.governance_type,
            expiration:      p.expiration,
            deposit:         p.deposit,
            title:      body.title      ?? null,
            abstract:   body.abstract   ?? null,
            rationale:  body.rationale  ?? null,
            motivation: body.motivation ?? null,
            meta_url:   p.meta_url ?? null,
          };
        })
      );

      return { proposals: normalised };
    }

    case "get_proposal_details": {
      const { tx_hash, cert_index = 0 } = params as { tx_hash: string; cert_index?: number };
      return bf<any>(`/governance/proposals/${tx_hash}/${cert_index}`);
    }

    case "get_proposal_votes": {
      const { tx_hash, cert_index = 0, proposal_id } = params as {
        tx_hash?: string; cert_index?: number; proposal_id?: string;
      };

      let bfVotes: any[] = [];
      let koiosVotes: any[] = [];

      // Blockfrost → aggregate tallies
      if (tx_hash) {
        bfVotes = await bf<any[]>(
          `/governance/proposals/${tx_hash}/${cert_index}/votes?count=100`
        ).catch(() => []);
      }

      // Koios → individual votes with optional rationale URLs
      if (proposal_id) {
        koiosVotes = await koios<any[]>(
          `/proposal_votes?_proposal_id=${proposal_id}&limit=20`
        ).catch(() => []);
      }

      // Aggregate from whichever source returned data
      const source = bfVotes.length ? bfVotes : koiosVotes;
      const tally = { yes: 0, no: 0, abstain: 0 };
      const byRole: Record<string, { yes: number; no: number; abstain: number }> = {};

      for (const v of source) {
        const vote = (v.vote ?? "").toLowerCase() as "yes" | "no" | "abstain";
        const role = (v.voter_role ?? "unknown").toLowerCase();
        if (!byRole[role]) byRole[role] = { yes: 0, no: 0, abstain: 0 };
        if (vote === "yes" || vote === "no" || vote === "abstain") {
          tally[vote]++;
          byRole[role][vote]++;
        }
      }

      // Include a sample of individual votes with rationale from Koios
      const sampleVotes = koiosVotes.slice(0, 10).map((v: any) => ({
        voter_role: v.voter_role,
        voter_id:   v.voter_id,
        vote:       v.vote,
        meta_url:   v.meta_url ?? null,
      }));

      return { total: tally, by_role: byRole, sample_votes: sampleVotes };
    }

    case "get_treasury_balance": {
      // Blockfrost /network has live treasury in lovelace
      const net = await bf<any>("/network");
      const lovelace = net?.supply?.treasury ?? "0";
      return {
        treasury_ada:      lovelaceToAda(lovelace),
        treasury_lovelace: lovelace,
        reserves_ada:      lovelaceToAda(net?.supply?.reserves ?? "0"),
      };
    }

    case "get_constitution": {
      const data = await koios<any[]>("/constitution").catch(() => null);
      return data?.[0] ?? { note: "Constitution data unavailable" };
    }

    // ── AI-powered community sentiment ────────────────────────────────────
    case "get_proposal_sentiment": {
      const { proposal_id, tx_hash, cert_index = 0, title } = params as {
        proposal_id?: string; tx_hash?: string; cert_index?: number; title?: string;
      };

      if (!anthropic) {
        return { error: "ANTHROPIC_API_KEY not set — add it to .env to enable AI summaries." };
      }

      // 1. Fetch individual votes with rationale URLs from Koios
      let koiosVotes: any[] = [];
      if (proposal_id) {
        koiosVotes = await koios<any[]>(
          `/proposal_votes?_proposal_id=${proposal_id}&limit=30`
        ).catch(() => []);
      }

      // 2. Collect votes that have a rationale document
      const votesWithRationale = koiosVotes.filter((v: any) => v.meta_url);

      // 3. Fetch up to 8 rationale documents from IPFS via Lidonation (in parallel)
      const toFetch = votesWithRationale.slice(0, 8);
      const docs = await Promise.all(
        toFetch.map(async (v: any) => {
          const doc = await fetchIpfs<any>(v.meta_url);
          if (!doc) return null;
          const meta = extractIpfsMeta(doc);
          return {
            voter_role: v.voter_role,
            vote:       v.vote,
            text:       meta.rationale ?? meta.abstract ?? meta.motivation ?? null,
          };
        })
      );

      const validDocs = docs.filter((d): d is NonNullable<typeof d> => d !== null && !!d.text);

      // 4. Aggregate vote tallies from Blockfrost
      let tally = { yes: 0, no: 0, abstain: 0 };
      if (tx_hash) {
        const bfVotes = await bf<any[]>(
          `/governance/proposals/${tx_hash}/${cert_index}/votes?count=100`
        ).catch(() => []);
        for (const v of bfVotes) {
          const vote = (v.vote ?? "").toLowerCase() as "yes" | "no" | "abstain";
          if (vote === "yes" || vote === "no" || vote === "abstain") tally[vote]++;
        }
      }

      const total = tally.yes + tally.no + tally.abstain;
      const yesPct = total ? Math.round((tally.yes / total) * 100) : 0;
      const noPct  = total ? Math.round((tally.no  / total) * 100) : 0;

      // 5. If no rationale docs, return tallies only
      if (validDocs.length === 0) {
        return {
          tally,
          yes_pct: yesPct,
          no_pct: noPct,
          ai_summary: null,
          rationale_count: 0,
          note: "No voter rationale documents found for this proposal.",
        };
      }

      // 6. Build prompt for Claude
      const rationaleBlock = validDocs
        .map((d, i) =>
          `Voter ${i + 1} (${d.voter_role}, voted ${d.vote}):\n${(d.text ?? "").slice(0, 600)}`
        )
        .join("\n\n---\n\n");

      const prompt = `You are summarizing community sentiment on a Cardano governance proposal.

Proposal: "${title ?? "Unknown proposal"}"
Vote result: ${tally.yes} yes (${yesPct}%), ${tally.no} no (${noPct}%), ${tally.abstain} abstain

Below are rationale statements from ${validDocs.length} DReps (elected representatives) who voted on this proposal. Summarize in 3-4 sentences what the community said — cover the main arguments in favor, the main concerns or objections, and the overall sentiment. Be neutral and factual.

${rationaleBlock}`;

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      });

      const summary = (response.content[0] as any)?.text ?? null;

      return {
        tally,
        yes_pct: yesPct,
        no_pct: noPct,
        ai_summary: summary,
        rationale_count: validDocs.length,
      };
    }

    case "get_drep_info": {
      const { drep_id } = params as { drep_id: string };
      const raw = await koios<any[]>("/drep_info", { _drep_ids: [drep_id] });
      if (!raw?.length) throw new Error(`DRep ${drep_id} not found`);
      const d = raw[0];
      const doc = d.meta_url ? await fetchIpfs<any>(d.meta_url) : null;
      const identity = doc ? extractDRepMeta(doc) : null;
      return {
        drep_id:              d.drep_id,
        status:               d.retired ? "retired" : d.registered ? "active" : "unregistered",
        voting_power_ada:     lovelaceToAda(d.voting_power ?? "0"),
        voting_power_lovelace: d.voting_power,
        deposit_lovelace:     d.deposit,
        has_script:           d.has_script,
        registered_epoch:     d.active_epoch_no,
        meta_url:             d.meta_url,
        identity,
      };
    }

    case "get_drep_profile": {
      const { drep_id } = params as { drep_id: string };

      const [rawInfo, rawVotes] = await Promise.all([
        koios<any[]>("/drep_info", { _drep_ids: [drep_id] }),
        koios<any[]>("/drep_votes", { _drep_id: drep_id }).catch(() => [] as any[]),
      ]);

      if (!rawInfo?.length) throw new Error(`DRep ${drep_id} not found`);
      const d = rawInfo[0];

      const doc = d.meta_url ? await fetchIpfs<any>(d.meta_url) : null;
      const identity = doc ? extractDRepMeta(doc) : null;

      const totals = { yes: 0, no: 0, abstain: 0 };
      const byActionType: Record<string, { yes: number; no: number; abstain: number }> = {};

      for (const v of rawVotes as any[]) {
        const choice = (v.vote ?? "").toLowerCase() as "yes" | "no" | "abstain";
        const actionType: string = v.gov_action_type ?? "Unknown";
        if (!byActionType[actionType]) byActionType[actionType] = { yes: 0, no: 0, abstain: 0 };
        if (choice === "yes" || choice === "no" || choice === "abstain") {
          totals[choice]++;
          byActionType[actionType][choice]++;
        }
      }

      const totalVotes = totals.yes + totals.no + totals.abstain;
      const votingStats = {
        total_votes:  totalVotes,
        yes:          totals.yes,
        no:           totals.no,
        abstain:      totals.abstain,
        yes_pct:      totalVotes ? Math.round((totals.yes     / totalVotes) * 100) : 0,
        no_pct:       totalVotes ? Math.round((totals.no      / totalVotes) * 100) : 0,
        abstain_pct:  totalVotes ? Math.round((totals.abstain / totalVotes) * 100) : 0,
        by_action_type: byActionType,
      };

      const recentVotes = (rawVotes as any[])
        .sort((a: any, b: any) => (b.block_time ?? 0) - (a.block_time ?? 0))
        .slice(0, 10)
        .map((v: any) => ({
          proposal_id:     v.proposal_id,
          gov_action_type: v.gov_action_type ?? null,
          vote:            v.vote,
          tx_hash:         v.tx_hash,
        }));

      return {
        drep_id:               d.drep_id,
        status:                d.retired ? "retired" : d.registered ? "active" : "unregistered",
        voting_power_ada:      lovelaceToAda(d.voting_power ?? "0"),
        voting_power_lovelace: d.voting_power,
        deposit_lovelace:      d.deposit,
        has_script:            d.has_script,
        registered_epoch:      d.active_epoch_no,
        meta_url:              d.meta_url,
        identity,
        voting_stats:  votingStats,
        recent_votes:  recentVotes,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:3000"] }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    network: NETWORK,
    blockfrost_configured: !!BF_KEY,
    koios_url: KOIOS_URL,
  });
});

app.post("/tools/:toolName", async (req, res) => {
  try {
    const result = await handleTool(req.params.toolName, req.body ?? {});
    res.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[${req.params.toolName}]`, message);
    res.status(500).json({ error: message });
  }
});

// ── Shared context builder ────────────────────────────────────────────────
async function buildChatContext(message: string): Promise<{
  systemPrompt: string;
  cards: any[];
}> {
  // Cards and data fetches trigger off the current message only — not history —
  // to avoid showing stale/irrelevant cards from prior conversation turns.
  const msgLower     = message.toLowerCase();
  const isGovernance = /governance|proposal|drep|vote|treasury|withdraw|constitution|committee|cip.?1694/.test(msgLower);
  const isTreasury   = /treasury|withdraw/.test(msgLower);
  const drepMatch    = message.match(/drep1[a-z0-9]{50,}/i);

  let context = "";
  const cards: any[] = [];

  try {
    const fetches: Promise<any>[] = [
      handleTool("get_network_info",    {}) as Promise<any>,
      handleTool("get_protocol_params", {}) as Promise<any>,
    ];
    if (isGovernance) fetches.push(handleTool("list_governance_proposals", {}) as Promise<any>);
    if (isTreasury)   fetches.push(handleTool("get_treasury_balance",      {}) as Promise<any>);

    const [net, params, ...extra] = await Promise.all(fetches);

    context = `Current Cardano state:
- Network: ${net.network}, Epoch: ${net.current_epoch.epoch}, Block: ${net.chain_tip.block_height}
- Min fee A: ${params.min_fee_a}, Min fee B: ${params.min_fee_b}
- Coins per UTxO byte: ${params.coins_per_utxo_size}
- Max tx size: ${params.max_tx_size} bytes`;

    if (isGovernance && extra[0]) {
      const proposals: any[] = (extra[0].proposals ?? extra[0]) as any[];
      const top = proposals.slice(0, 6);
      const summaries = proposals.slice(0, 20).map((p: any) => {
        const type  = p.governance_type ?? p.gov_action_type ?? "Unknown";
        const title = p.title ?? "(no title)";
        const id    = p.tx_hash ? `${p.tx_hash.slice(0, 8)}…` : "?";
        const amt   = p.withdrawal_ada ? ` | ₳${p.withdrawal_ada}` : "";
        return `  - [${type}] ${title} (id: ${id})${amt}`;
      }).join("\n");
      context += `\n\nActive governance proposals (${proposals.length} total):\n${summaries}`;

      // Include top 6 as proposal cards for the UI
      if (top.length) {
        cards.push({ type: "proposal_list", data: top });
      }
    }

    if (isTreasury) {
      const tIdx = isGovernance ? 1 : 0;
      const treasury = extra[tIdx];
      if (treasury) context += `\n\nTreasury: ₳${treasury.treasury_ada} | Reserves: ₳${treasury.reserves_ada}`;
    }

    // Detect Cardano address in the message and fetch UTxOs + recent history
    const addrMatch = message.match(/(addr(?:_test)?1[a-z0-9]{50,})/i);
    if (addrMatch) {
      const address = addrMatch[1]!;
      try {
        const [utxoRes, txRes] = await Promise.allSettled([
          handleTool("get_address_utxos",      { address }) as Promise<any>,
          handleTool("query_address_history",  { address, count: 10 }) as Promise<any>,
        ]);
        const utxoData = utxoRes.status === "fulfilled" ? utxoRes.value  : null;
        const txData   = txRes.status   === "fulfilled" ? txRes.value    : null;
        if (utxoData) {
          const assets: any[] = utxoData.native_assets ?? [];
          context += `\n\nAddress ${address.slice(0, 20)}…:` +
            `\n- Balance: ₳${utxoData.total_ada}` +
            `\n- UTxOs: ${utxoData.utxo_count}` +
            `\n- Native assets: ${assets.length}` +
            (assets.length
              ? "\n" + assets.slice(0, 5).map((a: any) => `  • ${a.asset_name_utf8 || a.asset_name_hex || a.unit.slice(56) || "(unnamed)"}: ${a.quantity}`).join("\n")
              : "");
          cards.push({
            type: "address_utxos",
            data: {
              address,
              total_ada:     utxoData.total_ada,
              total_lovelace: utxoData.total_lovelace,
              utxo_count:    utxoData.utxo_count,
              native_assets: assets,
              recent_txs:    txData?.transactions ?? [],
            },
          });
        }
      } catch { /* continue without address data */ }
    }

    // If a specific DRep ID is in the message, fetch their profile
    if (drepMatch) {
      try {
        const profile = await handleTool("get_drep_profile", { drep_id: drepMatch[0] }) as any;
        cards.push({ type: "drep_profile", data: profile });
        context += `\n\nDRep profile for ${drepMatch[0]}:\n${JSON.stringify(profile, null, 2).slice(0, 800)}`;
      } catch { /* DRep not found — continue */ }
    }
  } catch { /* use no context if APIs fail */ }

  // Tx detection is always attempted — independent of API availability
  // Permissive: capture amount + any addr1... in the same message
  const txMatch = message.match(
    /send\s+(\d+(?:\.\d+)?)\s*(?:ada|₳).{0,40}?(addr[a-z0-9]{50,})/i
  );
  if (txMatch) {
    const amount_ada      = txMatch[1]!;
    const to_address      = txMatch[2]!;
    const amount_lovelace = Math.floor(parseFloat(amount_ada) * 1_000_000).toString();
    // Replace any address_utxos card for the same address with tx_request
    // (don't show a balance card for the recipient when user is sending)
    const filtered = cards.filter((c) => !(c.type === "address_utxos" && c.data?.address === to_address));
    filtered.push({ type: "tx_request", data: { to_address, amount_ada, amount_lovelace } });
    cards.length = 0;
    cards.push(...filtered);
  }

  const systemPrompt = `You are a helpful Cardano blockchain assistant embedded in a governance explorer and wallet app. You have access to live mainnet data and can assist with both read and write operations.

Capabilities:
- Query live chain data: balances, UTxOs, native assets, transaction history, network stats, protocol parameters
- Governance: view proposals, DRep profiles, vote tallies, treasury balance
- Transactions: when a user asks to send ADA (e.g. "send 10 ADA to addr1..."), a transaction request card is automatically shown in the UI below your message — acknowledge this and tell them to connect their wallet and click "Sign & Send"
- Address lookup: when a user mentions an address, an address card with the live balance and UTxOs is shown automatically

${context ? `Live chain data:\n${context}` : ""}

Instructions:
- Answer concisely (2–4 sentences). Use ₳ for ADA amounts.
- For governance questions, reference actual proposals by title and type from the live data above.
- For transaction requests: confirm what will be sent and to whom, mention the transaction card below, and guide them to connect their wallet to sign. Do NOT say you cannot send transactions.
- For address queries: summarise the balance and UTxO count from the live data above.
- If data for something isn't in the context, say so briefly.`;

  return { systemPrompt, cards };
}

// ── AI chatbot — non-streaming (kept for backward compat) ─────────────────
app.post("/chat", async (req, res) => {
  if (!anthropic) {
    res.json({ reply: "AI assistant not available — add ANTHROPIC_API_KEY to .env." });
    return;
  }
  const { message, history = [] } = req.body as { message: string; history: { role: string; text: string }[] };
  const { systemPrompt, cards } = await buildChatContext(message);
  const claudeHistory = history.slice(-8).map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));

  try {
    const response = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:     systemPrompt,
      messages:   [...claudeHistory, { role: "user", content: message }],
    });
    const reply = (response.content[0] as any)?.text ?? "No response generated.";
    res.json({ reply, cards });
  } catch (e: unknown) {
    res.json({ reply: "AI error: " + (e instanceof Error ? e.message : String(e)), cards });
  }
});

// ── AI chatbot — streaming ────────────────────────────────────────────────
app.post("/stream-chat", async (req, res) => {
  if (!anthropic) {
    res.json({ error: "ANTHROPIC_API_KEY not set" });
    return;
  }

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const { message, history = [] } = req.body as { message: string; history: { role: string; text: string }[] };

  try {
    const { systemPrompt, cards } = await buildChatContext(message);

    console.log("[stream-chat] message:", JSON.stringify(message));
    console.log("[stream-chat] cards:", JSON.stringify(cards.map((c) => ({ type: c.type, data: c.type === "tx_request" ? c.data : "(omitted)" }))));

    // Send card data first so the UI can render it while text streams in
    if (cards.length) send({ type: "cards", cards });

    const claudeHistory = history.slice(-8).map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));

    const stream = anthropic.messages.stream({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:     systemPrompt,
      messages:   [...claudeHistory, { role: "user", content: message }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        send({ type: "text", text: chunk.delta.text });
      }
    }
  } catch (e: unknown) {
    send({ type: "error", error: e instanceof Error ? e.message : String(e) });
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

// ── Streaming governance summary ──────────────────────────────────────────
// Takes pre-loaded proposals from the client — no extra API call needed.
app.post("/stream-summary", async (req, res) => {
  if (!anthropic) {
    res.json({ error: "ANTHROPIC_API_KEY not set" });
    return;
  }

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");

  const { proposals = [] } = req.body as { proposals: any[] };
  const count = proposals.length;

  const groups: Record<string, string[]> = {};
  for (const p of proposals) {
    const type = p.governance_type ?? p.gov_action_type ?? "Unknown";
    if (!groups[type]) groups[type] = [];
    const title = p.title ?? "(no title)";
    const amt   = p.withdrawal_ada ? ` (₳${p.withdrawal_ada})` : "";
    groups[type].push(`${title}${amt}`);
  }

  const proposalBlock = Object.entries(groups)
    .map(([type, titles]) => `${type} (${titles.length}):\n${titles.slice(0, 5).map((t) => `  • ${t}`).join("\n")}`)
    .join("\n\n");

  const prompt = `You are summarizing the current state of Cardano on-chain governance for ADA holders.

There are ${count} active governance proposals grouped by type:

${proposalBlock}

Write a 6–8 sentence overview. Group by proposal type, highlight the most significant ones, note the overall governance activity level, and explain what it means for ADA holders. Be factual and neutral. Do not use headers or bullet points — write in flowing prose.`;

  try {
    const stream = anthropic.messages.stream({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages:   [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }
  } catch (e: unknown) {
    res.write(`data: ${JSON.stringify({ error: e instanceof Error ? e.message : String(e) })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

// ── Wallet-transaction endpoints ─────────────────────────────────────────

/** Decode a CIP-30 CBOR-hex address → bech32 using CSL */
app.post("/decode-address", async (req, res) => {
  const { cbor_hex } = req.body as { cbor_hex: string };
  try {
    const csl = await import("@emurgo/cardano-serialization-lib-nodejs");
    const buf  = Buffer.from(cbor_hex, "hex");
    // Strip CBOR byte-string header (major type 2)
    let offset = 0;
    const first = buf[0] ?? 0;
    if ((first & 0xe0) === 0x40)    offset = 1;       // 0x40–0x57: length in low bits
    else if (first === 0x58)        offset = 2;        // 1-byte length follows
    else if (first === 0x59)        offset = 3;        // 2-byte length follows
    const addr = csl.Address.from_bytes(buf.subarray(offset));
    res.json({ bech32: addr.to_bech32() });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** Build an unsigned payment tx using Mesh + Blockfrost UTxOs */
app.post("/build-tx", async (req, res) => {
  const { from_address, to_address, amount_lovelace } = req.body as {
    from_address: string;
    to_address:   string;
    amount_lovelace: string;
  };
  try {
    // Use CSL directly — avoids @meshsdk/core and its libsodium-wrappers-sumo ESM bug
    const CSL = await import("@emurgo/cardano-serialization-lib-nodejs");

    const [bfUtxos, params, latestBlock] = await Promise.all([
      bf<Array<{ tx_hash: string; tx_index: number; amount: Array<{ unit: string; quantity: string }> }>>(
        `/addresses/${from_address}/utxos`
      ),
      bf<{ min_fee_a: number; min_fee_b: number; coins_per_utxo_size: string; pool_deposit: string; key_deposit: string; max_val_size: string; max_tx_size: number }>(
        "/epochs/latest/parameters"
      ),
      bf<{ slot: number }>("/blocks/latest"),
    ]);

    if (!bfUtxos.length) throw new Error(`No UTxOs found at ${from_address}`);

    // Build UTxO list
    const utxoList = CSL.TransactionUnspentOutputs.new();
    for (const u of bfUtxos) {
      const lovelace = u.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0";
      utxoList.add(
        CSL.TransactionUnspentOutput.new(
          CSL.TransactionInput.new(CSL.TransactionHash.from_hex(u.tx_hash), u.tx_index),
          CSL.TransactionOutput.new(
            CSL.Address.from_bech32(from_address),
            CSL.Value.new(CSL.BigNum.from_str(lovelace))
          )
        )
      );
    }

    const txCfg = CSL.TransactionBuilderConfigBuilder.new()
      .fee_algo(CSL.LinearFee.new(
        CSL.BigNum.from_str(String(params.min_fee_a)),
        CSL.BigNum.from_str(String(params.min_fee_b))
      ))
      .coins_per_utxo_byte(CSL.BigNum.from_str(params.coins_per_utxo_size))
      .pool_deposit(CSL.BigNum.from_str(params.pool_deposit))
      .key_deposit(CSL.BigNum.from_str(params.key_deposit))
      .max_value_size(parseInt(params.max_val_size ?? "5000"))
      .max_tx_size(params.max_tx_size ?? 16384)
      .build();

    const txBuilder = CSL.TransactionBuilder.new(txCfg);

    // Payment output
    txBuilder.add_output(
      CSL.TransactionOutput.new(
        CSL.Address.from_bech32(to_address),
        CSL.Value.new(CSL.BigNum.from_str(amount_lovelace))
      )
    );

    // TTL = latest slot + 2 hours
    txBuilder.set_ttl_bignum(CSL.BigNum.from_str(String(latestBlock.slot + 7200)));

    // CIP-2 coin selection + change back to sender
    txBuilder.add_inputs_from_and_change(
      utxoList,
      CSL.CoinSelectionStrategyCIP2.LargestFirst,
      CSL.ChangeConfig.new(CSL.Address.from_bech32(from_address))
    );

    const unsigned_cbor = Buffer.from(
      CSL.Transaction.new(txBuilder.build(), CSL.TransactionWitnessSet.new()).to_bytes()
    ).toString("hex");

    res.json({ unsigned_cbor });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** Submit a signed transaction via Blockfrost */
app.post("/submit-tx", async (req, res) => {
  const { signed_cbor } = req.body as { signed_cbor: string };
  try {
    const txBytes = Buffer.from(signed_cbor, "hex");
    const bfRes = await fetch(`${BF_URL}/tx/submit`, {
      method:  "POST",
      headers: { project_id: BF_KEY, "Content-Type": "application/cbor" },
      body:    txBytes,
    });
    if (!bfRes.ok) {
      const msg = await bfRes.text();
      throw new Error(`Blockfrost submit error: ${msg}`);
    }
    const tx_hash: string = await bfRes.json();
    res.json({ tx_hash, explorer_url: `https://cardanoscan.io/transaction/${tx_hash}` });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`\n  ● cardano/mcp demo bridge`);
  console.log(`  ▸ network  : ${NETWORK}`);
  console.log(`  ▸ blockfrost: ${BF_KEY ? "configured ✓" : "MISSING — set BLOCKFROST_PROJECT_ID"}`);
  console.log(`  ▸ listening: http://localhost:${PORT}\n`);
});
