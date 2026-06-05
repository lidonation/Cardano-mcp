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
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

/** Extract plain text from a CIP-100/108 IPFS metadata document */
function extractIpfsMeta(doc: any): { title: string | null; abstract: string | null; rationale: string | null; motivation: string | null } {
  const body = doc?.body ?? {};
  return {
    title:      body.title      ?? null,
    abstract:   body.abstract   ?? null,
    rationale:  body.rationale  ?? null,
    motivation: body.motivation ?? null,
  };
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

// ── AI chatbot endpoint ───────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  if (!anthropic) {
    res.json({ reply: "AI assistant not available — add ANTHROPIC_API_KEY to .env." });
    return;
  }

  const { message, history = [] } = req.body as {
    message: string;
    history: { role: string; text: string }[];
  };

  // Fetch live context to ground Claude's answers
  let context = "";
  try {
    const [net, params] = await Promise.all([
      handleTool("get_network_info", {}) as Promise<any>,
      handleTool("get_protocol_params", {}) as Promise<any>,
    ]);
    context = `Current Cardano state:
- Network: ${net.network}, Epoch: ${net.current_epoch.epoch}, Block: ${net.chain_tip.block_height}
- Min fee A: ${params.min_fee_a}, Min fee B: ${params.min_fee_b}
- Coins per UTxO byte: ${params.coins_per_utxo_size}
- Max tx size: ${params.max_tx_size} bytes`;
  } catch { /* use no context if APIs fail */ }

  const systemPrompt = `You are a helpful Cardano blockchain assistant embedded in a wallet companion app. You have access to live chain data and can answer questions about ADA, UTxOs, governance, native assets, and the Cardano protocol.

${context ? `Live chain data:\n${context}` : ""}

Keep answers concise (2-4 sentences). Use ₳ for ADA amounts. If asked about a specific address, token, or proposal you don't have data for, say so clearly and suggest what the user can look up in the app tabs.`;

  const claudeHistory = history.slice(-8).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.text,
  }));

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 350,
      system: systemPrompt,
      messages: [...claudeHistory, { role: "user", content: message }],
    });

    const reply = (response.content[0] as any)?.text ?? "No response generated.";
    res.json({ reply });
  } catch (e: unknown) {
    res.json({ reply: "AI error: " + (e instanceof Error ? e.message : String(e)) });
  }
});

app.listen(PORT, () => {
  console.log(`\n  ● cardano/mcp demo bridge`);
  console.log(`  ▸ network  : ${NETWORK}`);
  console.log(`  ▸ blockfrost: ${BF_KEY ? "configured ✓" : "MISSING — set BLOCKFROST_PROJECT_ID"}`);
  console.log(`  ▸ listening: http://localhost:${PORT}\n`);
});
