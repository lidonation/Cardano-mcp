import React from "react";

interface ChainPillProps {
  network?: string;
  label?: string;
}

export function ChainPill({ network = "mainnet", label = "live" }: ChainPillProps) {
  return (
    <span className="chain-pill">
      <span className="dot" />
      {network} · {label}
    </span>
  );
}
