interface Proposal {
  proposal_id?: string;
  tx_hash?: string;
  title?: string | null;
  governance_type?: string;
  gov_action_type?: string;
  abstract?: string | null;
  withdrawal_ada?: string | null;
  epoch_expiry?: number;
  meta_url?: string | null;
  vote_summary?: {
    yes_pct: number;
    no_pct: number;
    abstain_pct: number;
    total_votes: number;
  };
  outcome_prediction?: {
    prediction: string;
    confidence: string;
  };
}

function stripMd(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, "$1")        // **bold** → text
    .replace(/\*([^*]+)\*/g, "$1")            // *italic* → text
    .replace(/`[^`]+`/g, "")                  // `code` → remove
    .replace(/^#{1,6}\s/gm, "")               // ## headers → remove hash
    .replace(/\n{2,}/g, " ")                  // collapse line breaks
    .trim();
}

const TYPE_FALLBACK: Record<string, string> = {
  TreasuryWithdrawal:   "Proposes withdrawing ADA from the Cardano treasury to fund a project or initiative.",
  ParameterChange:      "Proposes changes to on-chain protocol parameters such as fees, block size, or staking rewards.",
  UpdateConstitution:   "Proposes amending the Cardano constitution — the foundational governance document.",
  HardForkInitiation:   "Initiates a protocol upgrade (hard fork) to evolve the Cardano network.",
  UpdateCommittee:      "Proposes adding, removing, or changing the quorum of the Constitutional Committee.",
  MotionOfNoConfidence: "Signals that the community has lost confidence in the current Constitutional Committee.",
  InfoAction:           "An on-chain informational proposal — no protocol changes, used to gauge community sentiment.",
};

const TYPE_COLORS: Record<string, string> = {
  TreasuryWithdrawal:  "bg-amber-100 text-amber-800",
  ParameterChange:     "bg-blue-100 text-blue-800",
  UpdateConstitution:  "bg-purple-100 text-purple-800",
  HardForkInitiation:  "bg-red-100 text-red-800",
  UpdateCommittee:     "bg-indigo-100 text-indigo-800",
  MotionOfNoConfidence:"bg-rose-100 text-rose-800",
  InfoAction:          "bg-gray-100 text-gray-700",
};

const PREDICTION_STYLES: Record<string, { label: string; class: string }> = {
  likely_to_pass:    { label: "Likely to pass",   class: "bg-green-100 text-green-800" },
  likely_to_fail:    { label: "Likely to fail",   class: "bg-red-100 text-red-800" },
  too_close_to_call: { label: "Too close to call", class: "bg-yellow-100 text-yellow-800" },
  insufficient_data: { label: "Insufficient data", class: "bg-gray-100 text-gray-600" },
};

function VoteBar({ yes, no, abstain }: { yes: number; no: number; abstain: number }) {
  const total = yes + no + abstain;
  if (total === 0) return null;
  return (
    <div className="mt-2">
      <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
        {yes     > 0 && <div className="bg-green-500" style={{ width: `${yes}%` }} />}
        {no      > 0 && <div className="bg-red-400"   style={{ width: `${no}%` }} />}
        {abstain > 0 && <div className="bg-gray-300"  style={{ width: `${abstain}%` }} />}
      </div>
      <div className="flex gap-3 mt-1 text-xs text-gray-500">
        <span className="text-green-600">{yes}% yes</span>
        <span className="text-red-500">{no}% no</span>
        <span>{abstain}% abstain</span>
      </div>
    </div>
  );
}

export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const type  = proposal.governance_type ?? proposal.gov_action_type ?? "Unknown";
  const title = proposal.title ?? "Untitled proposal";
  const id    = proposal.tx_hash ? `${proposal.tx_hash.slice(0, 10)}…` : proposal.proposal_id?.slice(0, 12) ?? "?";
  const typeStyle = TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700";
  const pred      = proposal.outcome_prediction
    ? PREDICTION_STYLES[proposal.outcome_prediction.prediction]
    : null;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${typeStyle}`}>
          {type.replace(/([A-Z])/g, " $1").trim()}
        </span>
        {pred && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${pred.class}`}>
            {pred.label}
          </span>
        )}
      </div>

      <p className="text-sm font-medium text-gray-900 leading-snug mb-1">{title}</p>

      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
        {proposal.abstract ? stripMd(proposal.abstract) : (TYPE_FALLBACK[type] ?? "")}
      </p>

      {proposal.withdrawal_ada && (
        <p className="text-xs font-semibold text-amber-700 mt-1">₳{Number(proposal.withdrawal_ada).toLocaleString()}</p>
      )}

      {proposal.vote_summary && (
        <VoteBar
          yes={proposal.vote_summary.yes_pct}
          no={proposal.vote_summary.no_pct}
          abstain={proposal.vote_summary.abstain_pct}
        />
      )}

      <p className="text-[10px] text-gray-400 mt-1.5 font-mono">{id}</p>
    </div>
  );
}

export function ProposalCardList({ proposals }: { proposals: Proposal[] }) {
  if (!proposals.length) return null;
  return (
    <div className="mt-2 space-y-2">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        {proposals.length} proposal{proposals.length !== 1 ? "s" : ""}
      </p>
      {proposals.map((p, i) => (
        <ProposalCard key={p.proposal_id ?? p.tx_hash ?? i} proposal={p} />
      ))}
    </div>
  );
}
