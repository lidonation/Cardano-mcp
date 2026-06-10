interface DRepIdentity {
  name: string | null;
  bio: string | null;
  objectives: string | null;
  qualifications: string | null;
  references: Array<{ type: string; label: string; uri: string }>;
}

interface DRepProfile {
  drep_id: string;
  status: string;
  voting_power_ada: string | null;
  registered_epoch?: number | null;
  identity: DRepIdentity | null;
  voting_stats: {
    total_votes: number;
    yes_pct: number;
    no_pct: number;
    abstain_pct: number;
    by_action_type: Record<string, { yes: number; no: number; abstain: number }>;
  };
  recent_votes: Array<{
    proposal_id: string;
    gov_action_type: string | null;
    vote: string;
  }>;
}

const VOTE_COLORS: Record<string, string> = {
  yes:     "bg-green-500",
  no:      "bg-red-400",
  abstain: "bg-gray-300",
};

const VOTE_LABELS: Record<string, string> = {
  yes:     "text-green-600",
  no:      "text-red-500",
  abstain: "text-gray-500",
};

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-lg font-bold ${color}`}>{value}%</span>
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  );
}

export function DRepCard({ drep }: { drep: DRepProfile }) {
  const name = drep.identity?.name ?? null;
  const bio  = drep.identity?.bio  ?? null;
  const shortId = `${drep.drep_id.slice(0, 14)}…${drep.drep_id.slice(-6)}`;
  const isActive = drep.status === "active";
  const ada = drep.voting_power_ada
    ? Number(drep.voting_power_ada).toLocaleString()
    : null;

  const links = (drep.identity?.references ?? []).filter((r) =>
    r.uri?.startsWith("http")
  );

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          {name && <p className="text-sm font-semibold text-gray-900">{name}</p>}
          <p className="text-[10px] font-mono text-gray-400">{shortId}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
          {drep.status}
        </span>
      </div>

      {/* Voting power */}
      {ada && (
        <div className="bg-blue-50 rounded-lg px-3 py-2 mb-3">
          <p className="text-[10px] text-blue-500 font-medium">Voting power</p>
          <p className="text-sm font-bold text-blue-900">₳{ada}</p>
        </div>
      )}

      {/* Bio */}
      {bio && (
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3 mb-3">{bio}</p>
      )}

      {/* Vote stats */}
      {drep.voting_stats.total_votes > 0 && (
        <div className="border-t border-gray-50 pt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Voting record — {drep.voting_stats.total_votes} votes
          </p>
          <div className="flex justify-around mb-2">
            <StatPill label="Yes" value={drep.voting_stats.yes_pct}     color="text-green-600" />
            <StatPill label="No"  value={drep.voting_stats.no_pct}      color="text-red-500" />
            <StatPill label="Abs" value={drep.voting_stats.abstain_pct} color="text-gray-500" />
          </div>

          {/* Vote bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
            {drep.voting_stats.yes_pct > 0 && (
              <div className="bg-green-500" style={{ width: `${drep.voting_stats.yes_pct}%` }} />
            )}
            {drep.voting_stats.no_pct > 0 && (
              <div className="bg-red-400" style={{ width: `${drep.voting_stats.no_pct}%` }} />
            )}
            {drep.voting_stats.abstain_pct > 0 && (
              <div className="bg-gray-300" style={{ width: `${drep.voting_stats.abstain_pct}%` }} />
            )}
          </div>
        </div>
      )}

      {/* Recent votes */}
      {drep.recent_votes.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Recent votes</p>
          <div className="space-y-1">
            {drep.recent_votes.slice(0, 5).map((v, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-500 truncate max-w-[60%]">
                  {v.gov_action_type?.replace(/([A-Z])/g, " $1").trim() ?? "Proposal"}
                </span>
                <span className={`font-semibold capitalize ${VOTE_LABELS[v.vote] ?? "text-gray-500"}`}>
                  {v.vote}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By action type breakdown */}
      {Object.keys(drep.voting_stats.by_action_type).length > 0 && (
        <div className="mt-3 border-t border-gray-50 pt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">By proposal type</p>
          <div className="space-y-1">
            {Object.entries(drep.voting_stats.by_action_type).map(([type, tally]) => {
              const t = tally.yes + tally.no + tally.abstain;
              return (
                <div key={type} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 truncate flex-1">
                    {type.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span className="text-green-600">{tally.yes}y</span>
                  <span className="text-red-500">{tally.no}n</span>
                  {tally.abstain > 0 && <span className="text-gray-400">{tally.abstain}a</span>}
                  <span className="text-gray-300 text-[10px]">/{t}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Links */}
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {links.map((l, i) => (
            <a
              key={i}
              href={l.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:underline bg-blue-50 px-2 py-0.5 rounded-full"
            >
              {l.label || l.type}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
