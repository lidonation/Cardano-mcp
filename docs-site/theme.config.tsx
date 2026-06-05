import React from "react";
import type { DocsThemeConfig } from "nextra-theme-docs";
import { useRouter } from "next/router";
import { useConfig } from "nextra-theme-docs";

const Logo = () => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
    <img src="/brand/mark.svg" alt="" width={32} height={32} />
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, letterSpacing: "-0.01em" }}>
      <strong>cardano</strong>
      <span style={{ background: "var(--grad-brand)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>/</span>
      <span style={{ color: "var(--fg-2)" }}>mcp</span>
    </span>
  </span>
);

const ChainPill = () => (
  <span className="nav-chain-pill"
    style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "4px 10px 4px 8px", borderRadius: 999,
      background: "var(--bg-2)", border: "1px solid var(--line-1)",
      fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-2)",
      marginLeft: 12,
    }}
  >
    <span
      style={{
        width: 7, height: 7, borderRadius: "50%",
        background: "var(--ok)",
        animation: "pulse 2s ease-out infinite",
        flexShrink: 0,
      }}
    />
    mainnet · live
  </span>
);

const config: DocsThemeConfig = {
  logo: (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <Logo />
      <ChainPill />
    </span>
  ),

  project: { link: "https://github.com/lidonation/Cardano-mcp" },
  docsRepositoryBase: "https://github.com/lidonation/Cardano-mcp/tree/main/docs-site",

  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },

  toc: {
    backToTop: true,
    title: "On this page",
  },

  navigation: { prev: true, next: true },

  feedback: { content: null },
  editLink: { content: "Edit this page on GitHub →" },

  footer: {
    content: (
      <div style={{
        display: "flex", justifyContent: "space-between", width: "100%",
        fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)",
      }}>
        <span>cardano-mcp · v0.1.0</span>
        <span>MIT · {new Date().getFullYear()}</span>
      </div>
    ),
  },

  search: {
    placeholder: "Search docs, tools…",
    emptyResult: (
      <span style={{ color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        No matches
      </span>
    ),
  },

  darkMode: false,
  nextThemes: { defaultTheme: "dark", forcedTheme: "dark" },

  head: () => {
    const { asPath } = useRouter();
    const { frontMatter } = useConfig();
    const title = frontMatter.title
      ? `${frontMatter.title as string} — Cardano MCP`
      : "Cardano MCP";
    const desc =
      (frontMatter.description as string | undefined) ??
      "Production-grade MCP server for Cardano blockchain development.";
    return (
      <>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={desc} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        <meta property="og:url" content={`https://cardano-mcp.dev${asPath}`} />
        <link rel="icon" href="/favicon.svg" />
      </>
    );
  },

  banner: {
    key: "v0.1.0-launch",
    content: (
      <a href="/changelog" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
        🟢 v0.1.0 — 38 tools across 6 modules. See what shipped →
      </a>
    ),
  },
};

export default config;
