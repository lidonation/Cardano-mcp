import React from "react";

interface EnvRow {
  key: string;
  required: boolean;
  default?: string;
  description: string;
}

interface EnvTableProps {
  rows: EnvRow[];
}

export function EnvTable({ rows }: EnvTableProps) {
  return (
    <div className="env-table-wrap">
    <table className="env-table">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Required</th>
          <th>Default</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="k">{r.key}</td>
            <td className={`req ${r.required ? "y" : "n"}`}>
              {r.required ? "yes" : "no"}
            </td>
            <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-3)" }}>
              {r.default ?? "—"}
            </td>
            <td className="desc">{r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
