"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  href: string;
  group: string;
}

const STATIC_ITEMS: PaletteItem[] = [
  { id: "install", label: "Installation", href: "/install", group: "Getting Started", description: "Set up the MCP server" },
  { id: "configure", label: "Configuration", href: "/configure", group: "Getting Started", description: "Environment variables" },
  { id: "claude-desktop", label: "Claude Desktop setup", href: "/claude-desktop", group: "Getting Started" },
  { id: "claude-code", label: "Claude Code setup", href: "/claude-code", group: "Getting Started" },
  { id: "first-queries", label: "First queries", href: "/first-queries", group: "Getting Started" },
  { id: "concepts", label: "eUTxO concepts", href: "/concepts", group: "Concepts" },
  { id: "tools", label: "Tool explorer", href: "/tools", group: "Reference" },
  { id: "recipes", label: "Recipes", href: "/recipes", group: "Reference" },
  { id: "changelog", label: "Changelog", href: "/changelog", group: "Reference" },
  { id: "mod-query", label: "query module", href: "/modules/query", group: "Modules" },
  { id: "mod-tokens", label: "tokens module", href: "/modules/tokens", group: "Modules" },
  { id: "mod-txbuilder", label: "txbuilder module", href: "/modules/txbuilder", group: "Modules" },
  { id: "mod-contracts", label: "contracts module", href: "/modules/contracts", group: "Modules" },
  { id: "mod-indexer", label: "indexer module", href: "/modules/indexer", group: "Modules" },
  { id: "mod-governance", label: "governance module", href: "/modules/governance", group: "Modules" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = query.trim()
    ? STATIC_ITEMS.filter(
        (i) =>
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.description?.toLowerCase().includes(query.toLowerCase()) ||
          i.group.toLowerCase().includes(query.toLowerCase())
      )
    : STATIC_ITEMS;

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery("");
    setSelected(0);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openPalette();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openPalette]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const navigate = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [router]
  );

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && filtered[selected]) {
      navigate(filtered[selected]);
    }
  };

  if (!open) return null;

  const groups = Array.from(new Set(filtered.map((i) => i.group)));

  return (
    <div className="palette-overlay" onClick={() => setOpen(false)} aria-modal="true" role="dialog" aria-label="Command palette">
      <div className="palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKey}>
        <div className="palette-input-row">
          <span className="palette-icon" aria-hidden="true">⌘</span>
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search docs…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            aria-label="Search documentation"
            autoComplete="off"
          />
          <kbd className="palette-esc" onClick={() => setOpen(false)}>esc</kbd>
        </div>
        <div className="palette-results" role="listbox">
          {groups.map((group) => (
            <div key={group} className="palette-group">
              <div className="palette-group-label">{group}</div>
              {filtered
                .filter((i) => i.group === group)
                .map((item) => {
                  const idx = filtered.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      role="option"
                      aria-selected={selected === idx}
                      className={`palette-item ${selected === idx ? "active" : ""}`}
                      onClick={() => navigate(item)}
                      onMouseEnter={() => setSelected(idx)}
                    >
                      <span className="palette-item-label">{item.label}</span>
                      {item.description && (
                        <span className="palette-item-desc">{item.description}</span>
                      )}
                    </button>
                  );
                })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="palette-empty">No results for &ldquo;{query}&rdquo;</div>
          )}
        </div>
        <div className="palette-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
