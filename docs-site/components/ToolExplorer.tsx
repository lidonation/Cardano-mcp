"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";

interface Tool {
  name: string;
  module: string;
  description: string;
  upstream: string[];
}

interface ToolExplorerProps {
  tools: Tool[];
}

const MODULE_ORDER = ["query", "tokens", "txbuilder", "contracts", "indexer", "governance"];

export function ToolExplorer({ tools }: ToolExplorerProps) {
  const [query, setQuery] = useState("");
  const [activeModule, setActiveModule] = useState<string>("all");

  const modules = useMemo(
    () => ["all", ...MODULE_ORDER.filter((m) => tools.some((t) => t.module === m))],
    [tools]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return tools.filter((t) => {
      const matchModule = activeModule === "all" || t.module === activeModule;
      const matchQuery =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.module.toLowerCase().includes(q);
      return matchModule && matchQuery;
    });
  }, [tools, query, activeModule]);

  return (
    <div className="tool-explorer">
      <div className="tool-explorer-bar">
        <input
          className="tool-search"
          type="search"
          placeholder="Search tools…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tools"
        />
        <div className="tool-filter-tabs" role="tablist" aria-label="Filter by module">
          {modules.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={activeModule === m}
              className={`tool-filter-tab ${activeModule === m ? "active" : ""}`}
              onClick={() => setActiveModule(m)}
            >
              {m === "all" ? "All" : m}
            </button>
          ))}
        </div>
      </div>
      <div className="tool-count" aria-live="polite">
        {filtered.length} tool{filtered.length !== 1 ? "s" : ""}
      </div>
      <table className="tool-table">
        <thead>
          <tr>
            <th>Tool</th>
            <th>Module</th>
            <th>Description</th>
            <th>Upstream</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={t.name}>
              <td>
                <Link href={`/tools/${t.module}/${t.name}`} className="tool-link">
                  {t.name}
                </Link>
              </td>
              <td>
                <span className={`chip module-${t.module}`}>{t.module}</span>
              </td>
              <td className="tool-desc">{t.description}</td>
              <td className="tool-upstream">
                {t.upstream.map((u) => (
                  <span key={u} className="badge">{u}</span>
                ))}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={4} className="tool-empty">
                No tools match your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
