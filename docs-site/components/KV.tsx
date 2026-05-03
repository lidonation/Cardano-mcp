import React from "react";

interface KVRow {
  k: string;
  v: React.ReactNode;
}

interface KVProps {
  rows: KVRow[];
}

export function KV({ rows }: KVProps) {
  return (
    <div className="kv">
      {rows.map(({ k, v }) => (
        <div className="row" key={k}>
          <div className="k">{k}</div>
          <div className="v">{v}</div>
        </div>
      ))}
    </div>
  );
}
