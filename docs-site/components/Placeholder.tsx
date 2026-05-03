import React from "react";

interface PlaceholderProps {
  label?: string;
  height?: number;
}

export function Placeholder({ label = "diagram", height = 200 }: PlaceholderProps) {
  return (
    <div className="placeholder" style={{ height }}>
      {label}
    </div>
  );
}
