import React from "react";
import Link from "next/link";

export function Hero() {
  return (
    <div className="hero">
      <div className="hero-content">
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          Mainnet · Live since Plomin Hard Fork
        </div>
        <h1 className="hero-title">
          Cardano for<br />AI Agents
        </h1>
        <p className="hero-subtitle">
          A production-grade MCP server giving Claude deep, idiomatic access to the
          Cardano blockchain. Query UTxOs, build transactions, decode Plutus datums,
          and participate in on-chain governance — all from your AI coding session.
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-value">38</span>
            <span className="hero-stat-label">Tools</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">6</span>
            <span className="hero-stat-label">Modules</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">3</span>
            <span className="hero-stat-label">APIs</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">0</span>
            <span className="hero-stat-label">Competitors</span>
          </div>
        </div>
        <div className="hero-actions">
          <Link href="/install" className="btn btn-primary">
            Get started
          </Link>
          <Link href="/tools" className="btn btn-ghost">
            Browse tools →
          </Link>
        </div>
      </div>
      <div className="hero-graph" aria-hidden="true">
        <HeroGraph />
      </div>
    </div>
  );
}

function HeroGraph() {
  const nodes = [
    { id: "claude", x: 50, y: 50, label: "Claude", primary: true },
    { id: "mcp", x: 50, y: 200, label: "Cardano MCP", primary: true },
    { id: "koios", x: 180, y: 120, label: "Koios" },
    { id: "blockfrost", x: 180, y: 200, label: "Blockfrost" },
    { id: "maestro", x: 180, y: 280, label: "Maestro" },
    { id: "chain", x: 310, y: 200, label: "Cardano" },
  ];

  const edges = [
    ["claude", "mcp"],
    ["mcp", "koios"],
    ["mcp", "blockfrost"],
    ["mcp", "maestro"],
    ["koios", "chain"],
    ["blockfrost", "chain"],
    ["maestro", "chain"],
  ];

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <svg viewBox="0 0 380 330" className="hero-svg" aria-label="Architecture diagram">
      <defs>
        <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="oklch(0.78 0.16 230)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="oklch(0.78 0.16 230)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {edges.map(([a, b]) => {
        const na = nodeMap[a];
        const nb = nodeMap[b];
        return (
          <line
            key={`${a}-${b}`}
            x1={na.x}
            y1={na.y}
            x2={nb.x}
            y2={nb.y}
            stroke="oklch(0.78 0.16 230 / 0.25)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        );
      })}
      {nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
          {n.primary && (
            <circle r="22" fill="url(#node-glow)" />
          )}
          <circle
            r={n.primary ? 14 : 10}
            fill={n.primary ? "oklch(0.78 0.16 230 / 0.15)" : "oklch(0.2 0.02 230)"}
            stroke={n.primary ? "oklch(0.78 0.16 230)" : "oklch(0.4 0.04 230)"}
            strokeWidth={n.primary ? 1.5 : 1}
          />
          <text
            y={n.primary ? 28 : 22}
            textAnchor="middle"
            fontSize={n.primary ? 10 : 9}
            fill={n.primary ? "oklch(0.78 0.16 230)" : "oklch(0.7 0.04 230)"}
            fontFamily="var(--font-mono)"
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
