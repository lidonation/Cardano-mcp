import { useState, useEffect } from "react";
import { callTool, truncateHash } from "../lib/api";
import { cachedTool } from "../lib/cache";
import { Skeleton } from "../components/Skeleton";

interface Proposal {
  proposal_id: string;
  tx_hash: string;
  cert_index: number;
  governance_type: string;
  expiration?: number;
  deposit?: string;
  title:     string | null;
  abstract:  string | null;
  rationale: string | null;
  motivation: string | null;
  meta_url:  string | null;
  vote_summary?: { yes_pct: number; no_pct: number; abstain_pct: number; total_votes: number };
  outcome_prediction?: { prediction: string; confidence: string };
}

interface VoteTally { yes: number; no: number; abstain: number; }
interface VoteResult {
  total:        VoteTally;
  by_role:      Record<string, VoteTally>;
  sample_votes: { voter_role: string; voter_id: string; vote: string; meta_url: string | null }[];
}
interface TreasuryData { treasury_ada: string; reserves_ada?: string; }

// ── helpers ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  TreasuryWithdrawals:  "Treasury Withdrawal",
  ParameterChange:      "Parameter Change",
  HardForkInitiation:   "Hard Fork",
  UpdateCommittee:      "Committee Update",
  UpdateConstitution:   "Constitution Update",
  NoConfidence:         "No Confidence",
  InfoAction:           "Info Action",
  // Blockfrost snake_case variants
  treasury_withdrawals: "Treasury Withdrawal",
  parameter_change:     "Parameter Change",
  hard_fork_initiation: "Hard Fork",
  update_committee:     "Committee Update",
  update_constitution:  "Constitution Update",
  no_confidence:        "No Confidence",
  info_action:          "Info Action",
};

const TYPE_COLORS: Record<string, string> = {
  TreasuryWithdrawals:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  ParameterChange:      "bg-blue-50 text-blue-700 border-blue-200",
  HardForkInitiation:   "bg-purple-50 text-purple-700 border-purple-200",
  UpdateCommittee:      "bg-orange-50 text-orange-700 border-orange-200",
  UpdateConstitution:   "bg-green-50 text-green-700 border-green-200",
  NoConfidence:         "bg-red-50 text-red-700 border-red-200",
  InfoAction:           "bg-gray-50 text-gray-600 border-gray-200",
  treasury_withdrawals: "bg-yellow-50 text-yellow-700 border-yellow-200",
  parameter_change:     "bg-blue-50 text-blue-700 border-blue-200",
  hard_fork_initiation: "bg-purple-50 text-purple-700 border-purple-200",
  update_committee:     "bg-orange-50 text-orange-700 border-orange-200",
  update_constitution:  "bg-green-50 text-green-700 border-green-200",
  no_confidence:        "bg-red-50 text-red-700 border-red-200",
  info_action:          "bg-gray-50 text-gray-600 border-gray-200",
};

/** Strip markdown bold/italic markers for plain display */
function stripMd(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/#+\s/g, "");
}

// ── sub-components ─────────────────────────────────────────────────────────

function VoteBar({ tally }: { tally: VoteTally }) {
  const total = tally.yes + tally.no + tally.abstain || 1;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return (
    <div>
      <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden bg-gray-100">
        <div className="bg-green-500" style={{ width: pct(tally.yes)     }} title={`Yes ${pct(tally.yes)}`} />
        <div className="bg-red-400"   style={{ width: pct(tally.no)      }} title={`No ${pct(tally.no)}`} />
        <div className="bg-gray-300"  style={{ width: pct(tally.abstain) }} title={`Abstain ${pct(tally.abstain)}`} />
      </div>
      <div className="flex gap-5 mt-1.5 text-xs">
        <span className="text-green-700 font-medium">{tally.yes} yes ({pct(tally.yes)})</span>
        <span className="text-red-600 font-medium">{tally.no} no ({pct(tally.no)})</span>
        <span className="text-gray-400">{tally.abstain} abstain</span>
      </div>
    </div>
  );
}

interface SentimentQuote {
  voter_role: string;
  vote: string;
  excerpt: string;
}

interface SentimentResult {
  tally: { yes: number; no: number; abstain: number };
  yes_pct: number;
  no_pct: number;
  ai_summary: string | null;
  rationale_count: number;
  quotes?: SentimentQuote[];
  error?: string;
  note?: string;
}

function ProposalCard({ proposal, injectedSentiment }: { proposal: Proposal; injectedSentiment?: SentimentResult | null }) {
  const [expanded,        setExpanded]       = useState(false);
  const [votes,           setVotes]          = useState<VoteResult | null>(null);
  const [loadingVotes,    setLoadingVotes]   = useState(false);
  const [showRationale,   setShowRationale]  = useState(false);
  const [localSentiment,  setLocalSentiment] = useState<SentimentResult | null>(null);
  const [loadingSentiment, setLoadingSentiment] = useState(false);

  // Prefer injected (batch-loaded) sentiment over locally-fetched
  const sentiment    = injectedSentiment ?? localSentiment;
  const setSentiment = setLocalSentiment;

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !votes && !loadingVotes) {
      setLoadingVotes(true);
      try {
        const v = await cachedTool<VoteResult>("get_proposal_votes", {
          tx_hash:     proposal.tx_hash,
          cert_index:  proposal.cert_index,
          proposal_id: proposal.proposal_id,
        });
        setVotes(v);
      } catch {
        setVotes({ total: { yes: 0, no: 0, abstain: 0 }, by_role: {}, sample_votes: [] });
      } finally {
        setLoadingVotes(false);
      }
    }
  };

  const fetchSentiment = async () => {
    if (sentiment || loadingSentiment) return;
    setLoadingSentiment(true);
    try {
      const s = await cachedTool<SentimentResult>("get_proposal_sentiment", {
        proposal_id: proposal.proposal_id,
        tx_hash:     proposal.tx_hash,
        cert_index:  proposal.cert_index,
        title:       proposal.title ?? undefined,
      }, 15 * 60 * 1000); // 15 min — DRep rationales don't change mid-session
      setSentiment(s);
    } catch (e: unknown) {
      setSentiment({ tally: { yes: 0, no: 0, abstain: 0 }, yes_pct: 0, no_pct: 0, ai_summary: null, rationale_count: 0, error: (e as Error).message });
    } finally {
      setLoadingSentiment(false);
    }
  };

  const label  = TYPE_LABELS[proposal.governance_type] ?? proposal.governance_type;
  const colors = TYPE_COLORS[proposal.governance_type] ?? "bg-gray-50 text-gray-600 border-gray-200";
  const depositAda = proposal.deposit
    ? (Number(proposal.deposit) / 1_000_000).toLocaleString()
    : null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">

      {/* ── Card header ── */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full border ${colors}`}>
            {label}
          </span>
          <div className="text-right text-xs text-gray-400 shrink-0">
            {proposal.expiration && <p>expires epoch {proposal.expiration}</p>}
            {depositAda && <p>₳ {depositAda} deposit</p>}
          </div>
        </div>

        {/* Title */}
        {proposal.title ? (
          <h3 className="font-semibold text-gray-900 leading-snug mb-1">{proposal.title}</h3>
        ) : (
          <p className="font-mono text-sm text-gray-500 mb-1">
            {truncateHash(proposal.tx_hash)}#{proposal.cert_index}
          </p>
        )}

        {/* Abstract — first 200 chars */}
        {proposal.abstract && (
          <p className="text-sm text-gray-600 leading-relaxed">
            {stripMd(proposal.abstract).slice(0, 220)}
            {proposal.abstract.length > 220 ? "…" : ""}
          </p>
        )}

        {/* meta link */}
        {proposal.meta_url && (
          <a
            href={proposal.meta_url.replace("ipfs://", "https://ipfs.io/ipfs/")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-xs text-cardano hover:underline"
          >
            Full proposal →
          </a>
        )}
      </div>

      {/* ── Expand toggle ── */}
      <button
        onClick={toggle}
        className="w-full px-5 py-2.5 border-t border-gray-50 text-xs text-gray-400 hover:text-cardano hover:bg-gray-50 transition-colors text-left flex items-center justify-between"
      >
        <span>{expanded ? "▲ Collapse" : "▼ Show vote counts & rationale"}</span>
        {loadingVotes && <span className="text-gray-300">loading…</span>}
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="px-5 pb-5 pt-3 border-t border-gray-50 space-y-4">

          {/* Vote bar */}
          {loadingVotes ? (
            <div className="skeleton h-4 w-full rounded" />
          ) : votes ? (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Vote Tally</p>
              <VoteBar tally={votes.total} />

              {/* By-role breakdown */}
              {Object.keys(votes.by_role).length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(votes.by_role).map(([role, t]) => (
                    <div key={role} className="bg-gray-50 rounded-lg p-2.5 text-xs">
                      <p className="text-gray-400 capitalize font-medium mb-1">{role}</p>
                      <span className="text-green-600 font-semibold">{t.yes} yes</span>
                      <span className="text-gray-300 mx-1">·</span>
                      <span className="text-red-500 font-semibold">{t.no} no</span>
                      <span className="text-gray-300 mx-1">·</span>
                      <span className="text-gray-400">{t.abstain} abstain</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sample individual votes with rationale links */}
              {votes.sample_votes.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                    Recent Votes
                  </p>
                  <div className="space-y-1.5">
                    {votes.sample_votes.map((v, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                            v.vote.toLowerCase() === "yes" ? "bg-green-500"
                            : v.vote.toLowerCase() === "no"  ? "bg-red-400"
                            : "bg-gray-300"
                          }`} />
                          <span className="capitalize text-gray-500">{v.voter_role}</span>
                          <span className="font-mono text-gray-400 truncate">{truncateHash(v.voter_id, 10, 6)}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`font-semibold capitalize ${
                            v.vote.toLowerCase() === "yes" ? "text-green-600"
                            : v.vote.toLowerCase() === "no" ? "text-red-500"
                            : "text-gray-400"
                          }`}>
                            {v.vote}
                          </span>
                          {v.meta_url && (
                            <a
                              href={v.meta_url.replace("ipfs://", "https://ipfs.io/ipfs/")}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cardano hover:underline"
                              title="View voter rationale"
                            >
                              rationale →
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* AI community sentiment */}
          <div className="border border-gray-100 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                🤖 Community Sentiment (AI)
              </p>
              {!sentiment && (
                <button
                  onClick={fetchSentiment}
                  disabled={loadingSentiment}
                  className="text-xs bg-cardano text-white px-3 py-1 rounded-full hover:bg-cardano-dark disabled:opacity-40 transition-colors"
                >
                  {loadingSentiment ? "Analysing rationales…" : "Summarise DRep rationales"}
                </button>
              )}
            </div>

            {loadingSentiment && (
              <div className="space-y-2 mt-2">
                <div className="skeleton h-3 w-full rounded" />
                <div className="skeleton h-3 w-5/6 rounded" />
                <div className="skeleton h-3 w-4/6 rounded" />
              </div>
            )}

            {sentiment?.error && (
              <p className="text-xs text-red-500 mt-1">{sentiment.error}</p>
            )}

            {sentiment && !sentiment.error && (
              <div className="space-y-3 mt-2">
                {/* Vote sentiment bar */}
                <div>
                  <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-gray-100">
                    <div className="bg-green-500" style={{ width: `${sentiment.yes_pct}%` }} />
                    <div className="bg-red-400"   style={{ width: `${sentiment.no_pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    <span className="text-green-600 font-semibold">{sentiment.yes_pct}% yes</span>
                    {" · "}
                    <span className="text-red-500 font-semibold">{sentiment.no_pct}% no</span>
                    {" · based on "}
                    {sentiment.tally.yes + sentiment.tally.no + sentiment.tally.abstain} votes
                    {sentiment.rationale_count > 0 && ` · ${sentiment.rationale_count} rationale docs read`}
                  </p>
                </div>

                {/* Always-visible computed sentiment text */}
                <p className="text-xs text-gray-600 leading-relaxed">{describeSentiment(sentiment)}</p>

                {/* AI rationale summary if DRep docs were found */}
                {sentiment.ai_summary && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-600 mb-1.5">AI Summary</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{sentiment.ai_summary}</p>
                  </div>
                )}

                {/* DRep rationale quotes */}
                {sentiment.quotes && sentiment.quotes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      DRep Rationales ({sentiment.quotes.length})
                    </p>
                    {sentiment.quotes.map((q, i) => {
                      const voteColor = q.vote === "yes"
                        ? "border-green-300 bg-green-50"
                        : q.vote === "no"
                        ? "border-red-300 bg-red-50"
                        : "border-gray-200 bg-gray-50";
                      const voteLabel = q.vote === "yes"
                        ? "text-green-700"
                        : q.vote === "no"
                        ? "text-red-600"
                        : "text-gray-500";
                      return (
                        <div key={i} className={`border-l-2 rounded-r-lg px-3 py-2 ${voteColor}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-semibold text-gray-500 uppercase">{q.voter_role}</span>
                            <span className={`text-[10px] font-bold uppercase ${voteLabel}`}>voted {q.vote}</span>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed italic">"{q.excerpt}{q.excerpt.length >= 280 ? "…" : ""}"</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!sentiment && !loadingSentiment && (
              <p className="text-xs text-gray-400 mt-1">
                Click to fetch DRep rationale documents from IPFS and generate an AI summary.
              </p>
            )}
          </div>

          {/* Rationale toggle */}
          {proposal.rationale && (
            <div>
              <button
                onClick={() => setShowRationale((s) => !s)}
                className="text-xs text-gray-400 hover:text-cardano transition-colors"
              >
                {showRationale ? "▲ Hide rationale" : "▼ Read full rationale"}
              </button>
              {showRationale && (
                <div className="mt-2 bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed max-h-72 overflow-y-auto">
                  {stripMd(proposal.rationale).split("\n").filter(Boolean).map((line, i) => (
                    <p key={i} className="mb-2">{line}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Motivation toggle */}
          {proposal.motivation && !proposal.rationale && (
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 leading-relaxed">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Motivation</p>
              {stripMd(proposal.motivation).slice(0, 400)}…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── sentiment text generation ─────────────────────────────────────────────

function describeSentiment(s: SentimentResult): string {
  const total = s.tally.yes + s.tally.no + s.tally.abstain;
  const participation = total < 10 ? "very few votes" : total < 30 ? "a modest number of votes" : `${total} votes`;

  if (total === 0) return "No votes have been recorded for this proposal yet.";

  let mood: string;
  if (s.yes_pct >= 80)      mood = "overwhelming support";
  else if (s.yes_pct >= 60) mood = "clear majority support";
  else if (s.yes_pct >= 50) mood = "a slight lean toward approval";
  else if (s.no_pct >= 80)  mood = "strong opposition";
  else if (s.no_pct >= 60)  mood = "a clear majority against";
  else if (s.no_pct >= 50)  mood = "a slight lean toward rejection";
  else                       mood = "a closely divided community";

  const abstainNote = s.tally.abstain > 0
    ? ` ${s.tally.abstain} voter${s.tally.abstain !== 1 ? "s" : ""} abstained.`
    : "";

  const outcomeNote = s.yes_pct >= 67
    ? " Current vote distribution meets the typical 67% supermajority threshold."
    : s.yes_pct >= 51
    ? " The proposal is passing but may not meet the supermajority threshold required for some action types."
    : " The proposal is currently failing to reach a passing threshold.";

  return `Based on ${participation}, this proposal shows ${mood}.${abstainNote}${outcomeNote}`;
}

// ── sentiment helpers ──────────────────────────────────────────────────────

function computeSentiment(proposals: Proposal[]) {
  const withVotes = proposals.filter((p) => p.vote_summary && p.vote_summary.total_votes > 0);
  if (!withVotes.length) return null;

  const totals = withVotes.reduce(
    (acc, p) => {
      const v = p.vote_summary!;
      acc.yes     += v.yes_pct     * v.total_votes;
      acc.no      += v.no_pct      * v.total_votes;
      acc.abstain += v.abstain_pct * v.total_votes;
      acc.votes   += v.total_votes;
      return acc;
    },
    { yes: 0, no: 0, abstain: 0, votes: 0 }
  );

  const yes_pct     = Math.round(totals.yes     / totals.votes);
  const no_pct      = Math.round(totals.no      / totals.votes);
  const abstain_pct = Math.round(totals.abstain / totals.votes);

  const likely_pass  = proposals.filter((p) => p.outcome_prediction?.prediction === "likely_to_pass").length;
  const likely_fail  = proposals.filter((p) => p.outcome_prediction?.prediction === "likely_to_fail").length;

  let mood: string;
  let moodColor: string;
  if (yes_pct >= 60)      { mood = "Generally supportive";  moodColor = "text-green-700"; }
  else if (no_pct >= 60)  { mood = "Largely opposed";       moodColor = "text-red-600"; }
  else if (yes_pct > no_pct) { mood = "Leaning supportive"; moodColor = "text-green-600"; }
  else if (no_pct > yes_pct) { mood = "Leaning opposed";    moodColor = "text-red-500"; }
  else                    { mood = "Mixed views";            moodColor = "text-amber-600"; }

  return { yes_pct, no_pct, abstain_pct, total_votes: totals.votes, withVotes: withVotes.length, likely_pass, likely_fail, mood, moodColor };
}

function SentimentOverview({ proposals }: { proposals: Proposal[] }) {
  const s = computeSentiment(proposals);
  if (!s) return null;

  return (
    <div className="mt-4 pt-4 border-t border-blue-100">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">Community Sentiment</p>
      <div className="flex items-center gap-3 mb-2">
        <span className={`text-sm font-bold ${s.moodColor}`}>{s.mood}</span>
        <span className="text-xs text-blue-500">
          across {s.withVotes} proposal{s.withVotes !== 1 ? "s" : ""} · {s.total_votes.toLocaleString()} total votes
        </span>
      </div>
      {/* Aggregate vote bar */}
      <div className="flex h-2 rounded-full overflow-hidden gap-px mb-1.5">
        <div className="bg-green-500 transition-all" style={{ width: `${s.yes_pct}%` }} title={`Yes ${s.yes_pct}%`} />
        <div className="bg-red-400   transition-all" style={{ width: `${s.no_pct}%` }}  title={`No ${s.no_pct}%`} />
        <div className="bg-gray-300  transition-all" style={{ width: `${s.abstain_pct}%` }} title={`Abstain ${s.abstain_pct}%`} />
      </div>
      <div className="flex gap-4 text-xs text-blue-800">
        <span><span className="text-green-600 font-semibold">{s.yes_pct}%</span> yes</span>
        <span><span className="text-red-500 font-semibold">{s.no_pct}%</span> no</span>
        <span><span className="text-gray-500">{s.abstain_pct}%</span> abstain</span>
      </div>
      {(s.likely_pass > 0 || s.likely_fail > 0) && (
        <div className="flex gap-3 mt-2 text-xs">
          {s.likely_pass > 0 && (
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {s.likely_pass} likely to pass
            </span>
          )}
          {s.likely_fail > 0 && (
            <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              {s.likely_fail} likely to fail
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export function Governance() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [treasury,      setTreasury]      = useState<TreasuryData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [filter,        setFilter]        = useState<string>("all");
  const [overview,      setOverview]      = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [sentimentMap,  setSentimentMap]  = useState<Record<string, SentimentResult>>({});
  const [loadingAllSentiments, setLoadingAllSentiments] = useState(false);
  const [sentimentProgress, setSentimentProgress] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const [propRes, treasRes] = await Promise.allSettled([
        cachedTool<{ proposals: Proposal[] }>("list_governance_proposals", {}),
        cachedTool<TreasuryData>("get_treasury_balance"),
      ]);
      if (propRes.status === "fulfilled") setProposals(propRes.value.proposals ?? []);
      else setError((propRes.reason as Error)?.message ?? "Failed to load proposals");
      if (treasRes.status === "fulfilled") setTreasury(treasRes.value);
      setLoading(false);
    }
    load();
  }, []);

  async function fetchOverview() {
    if (loadingOverview) return;
    setLoadingOverview(true);
    setOverview(null);
    try {
      // Pass the already-loaded proposals so the server doesn't re-fetch
      const res = await fetch("/stream-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposals }),
      });

      if (!res.body) throw new Error("No stream");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text   = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const event = JSON.parse(raw);
            if (event.text) {
              text += event.text;
              setOverview(text); // update as each chunk arrives
            } else if (event.error) {
              setOverview(`Error: ${event.error}`);
            }
          } catch { /* skip */ }
        }
      }

      if (!text) setOverview("No summary generated.");
    } catch {
      setOverview("Failed to generate overview — check your API key.");
    }
    setLoadingOverview(false);
  }

  async function fetchAllSentiments() {
    if (loadingAllSentiments || !proposals.length) return;
    setLoadingAllSentiments(true);
    setSentimentProgress(0);

    try {
      const res = await fetch("/stream-all-sentiments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ proposals }),
      });
      if (!res.body) throw new Error("No stream");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done_count = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const event = JSON.parse(raw) as { key?: string; proposal_id?: string; tx_hash?: string; result?: SentimentResult; error?: string };
            if (event.result) {
              const id = event.proposal_id ?? event.tx_hash ?? event.key ?? "";
              setSentimentMap((prev) => ({ ...prev, [id]: event.result! }));
              done_count++;
              setSentimentProgress(Math.round((done_count / proposals.length) * 100));
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      // silently fall through — individual cards still work
    }

    setLoadingAllSentiments(false);
  }

  // Collect unique action types for filter tabs
  const types = ["all", ...Array.from(new Set(proposals.map((p) => p.governance_type)))];
  const visible = filter === "all"
    ? proposals
    : proposals.filter((p) => p.governance_type === filter);

  return (
    <div className="space-y-6">

      {/* ── Treasury stat ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Treasury Balance</p>
          {loading
            ? <div className="skeleton h-8 w-48 rounded mt-1" />
            : <p className="text-3xl font-bold text-gray-900">₳ {treasury?.treasury_ada ?? "—"}</p>
          }
          <p className="text-xs text-gray-400 mt-1">on-chain reserve, updated each epoch</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Active Proposals</p>
          {loading
            ? <div className="skeleton h-8 w-16 rounded mt-1" />
            : <p className="text-3xl font-bold text-gray-900">{proposals.length}</p>
          }
          <p className="text-xs text-gray-400 mt-1">awaiting community vote</p>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      {!loading && proposals.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                filter === t
                  ? "bg-cardano text-white border-cardano"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
              }`}
            >
              {t === "all" ? `All (${proposals.length})` : (TYPE_LABELS[t] ?? t)}
            </button>
          ))}
        </div>
      )}

      {/* ── AI Overview ── */}
      {!loading && proposals.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <span className="text-sm font-semibold text-blue-900">AI Governance Overview</span>
            </div>
            {!overview && (
              <div className="flex gap-2">
                <button
                  onClick={fetchAllSentiments}
                  disabled={loadingAllSentiments}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loadingAllSentiments
                    ? `Analysing… ${sentimentProgress}%`
                    : Object.keys(sentimentMap).length > 0
                    ? "Re-analyse rationales"
                    : "Analyse all rationales"}
                </button>
                <button
                  onClick={fetchOverview}
                  disabled={loadingOverview}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loadingOverview ? "Summarising…" : "Summarise all proposals"}
                </button>
              </div>
            )}
            {overview && (
              <button
                onClick={() => { setOverview(null); }}
                className="text-xs text-blue-400 hover:text-blue-600"
              >
                Reset
              </button>
            )}
          </div>
          {loadingOverview && !overview && (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          )}
          {overview && (
            <p className="text-sm text-blue-900 leading-relaxed">{overview}</p>
          )}
          <SentimentOverview proposals={proposals} />
          {!overview && !loadingOverview && (
            <p className="text-xs text-blue-400">Click the button to get an AI-powered summary of all {proposals.length} active proposals.</p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3 opacity-30">⚖</div>
          <p className="font-medium text-gray-500">No proposals in this category</p>
        </div>
      )}

      {!loading && visible.map((p) => (
        <ProposalCard
          key={`${p.tx_hash}-${p.cert_index}`}
          proposal={p}
          injectedSentiment={sentimentMap[p.proposal_id ?? p.tx_hash ?? ""] ?? null}
        />
      ))}
    </div>
  );
}
