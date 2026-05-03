import React from "react";
import Link from "next/link";

interface Module {
  slug: string;
  name: string;
  phase: 1 | 2 | 3;
  tools: number;
  description: string;
  apis: string[];
}

const MODULES: Module[] = [
  {
    slug: "query",
    name: "Query",
    phase: 1,
    tools: 6,
    description: "Fetch UTxOs, transactions, assets, and block data from the chain.",
    apis: ["Blockfrost", "Koios", "Maestro"],
  },
  {
    slug: "tokens",
    name: "Tokens",
    phase: 1,
    tools: 4,
    description: "Native assets, NFT metadata (CIP-25/68), minting transactions.",
    apis: ["Blockfrost", "Koios"],
  },
  {
    slug: "txbuilder",
    name: "Tx Builder",
    phase: 1,
    tools: 5,
    description: "Build, sign, and submit payment and smart contract transactions.",
    apis: ["Blockfrost", "Mesh SDK"],
  },
  {
    slug: "contracts",
    name: "Contracts",
    phase: 2,
    tools: 7,
    description: "Aiken validation, CBOR datum decode/encode, script inspection.",
    apis: ["Blockfrost", "Aiken CLI"],
  },
  {
    slug: "indexer",
    name: "Indexer",
    phase: 2,
    tools: 4,
    description: "Watch addresses with Kupo, query custom indexers via Yaci Store.",
    apis: ["Kupo", "Yaci Store"],
  },
  {
    slug: "governance",
    name: "Governance",
    phase: 3,
    tools: 12,
    description: "Full CIP-1694: proposals, DReps, SPOs, Constitutional Committee.",
    apis: ["Koios"],
  },
];

export function ModuleGrid() {
  return (
    <div className="module-grid">
      {MODULES.map((m) => (
        <Link href={`/modules/${m.slug}`} key={m.slug} className="module-card">
          <div className="module-card-header">
            <span className="module-name">{m.name}</span>
            <span className={`chip phase-${m.phase}`}>Phase {m.phase}</span>
          </div>
          <p className="module-desc">{m.description}</p>
          <div className="module-card-footer">
            <span className="module-tool-count">{m.tools} tools</span>
            <span className="module-apis">{m.apis.join(" · ")}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
