import { useState } from "react";
import { truncateHash } from "../lib/api";

interface Props {
  hash: string;
  head?: number;
  tail?: number;
  className?: string;
}

export function HashDisplay({ hash, head = 8, tail = 6, className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <code className="font-mono text-sm text-gray-600">
        {truncateHash(hash, head, tail)}
      </code>
      <button
        onClick={copy}
        title="Copy full hash"
        className="text-gray-400 hover:text-cardano transition-colors text-xs"
      >
        {copied ? "✓" : "⎘"}
      </button>
    </span>
  );
}
