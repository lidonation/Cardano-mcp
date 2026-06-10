import { useState } from "react";
import { callTool } from "../lib/api";

// ── Validator template metadata ──────────────────────────────────────────────

const TEMPLATES = [
  { id: "simple_lock", label: "Simple Lock",   icon: "🔒", desc: "Single owner PubKeyHash — only one address can unlock" },
  { id: "time_lock",   label: "Time Lock",     icon: "⏰", desc: "Funds locked until a POSIX timestamp passes" },
  { id: "multisig",    label: "Multi-sig",     icon: "👥", desc: "M-of-N signatories required to spend" },
  { id: "vesting",     label: "Vesting",       icon: "📅", desc: "Cliff-time vesting — owner can cancel before unlock" },
  { id: "nft_mint",    label: "NFT Mint",      icon: "🎨", desc: "One-shot minting policy tied to a specific UTxO" },
  { id: "oracle",      label: "Oracle",        icon: "🔮", desc: "Reads a price datum from a reference input" },
] as const;

type TemplateId = typeof TEMPLATES[number]["id"];

// ── Small helpers ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="bg-gray-900 text-green-300 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre leading-relaxed max-h-80">
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

// ── Section: Script Inspector ─────────────────────────────────────────────────

function ScriptInspector() {
  const [hash,    setHash]    = useState("");
  const [result,  setResult]  = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const lookup = async () => {
    if (hash.trim().length !== 56) { setError("Script hash must be 56 hex characters"); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await callTool("get_script_info", { script_hash: hash.trim() });
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  };

  const typeLabel: Record<string, string> = {
    timelock: "Native / Timelock",
    plutusV1: "Plutus V1",
    plutusV2: "Plutus V2",
    plutusV3: "Plutus V3",
  };
  const typeColor: Record<string, string> = {
    timelock: "bg-yellow-100 text-yellow-800",
    plutusV1: "bg-purple-100 text-purple-800",
    plutusV2: "bg-blue-100 text-blue-800",
    plutusV3: "bg-indigo-100 text-indigo-800",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Script Inspector</h3>
        <p className="text-xs text-gray-400">Look up any deployed Plutus or native script by its hash</p>
      </div>

      <div className="flex gap-2">
        <input
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder="56-character script hash"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 font-mono"
          autoComplete="off" spellCheck={false}
        />
        <button
          onClick={lookup}
          disabled={loading || hash.trim().length !== 56}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? "…" : "Inspect"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${typeColor[result.type] ?? "bg-gray-100 text-gray-700"}`}>
              {typeLabel[result.type] ?? result.type}
            </span>
            <span className="text-xs text-gray-500">{result.serialised_size ?? result.serialized_size ?? "?"} bytes</span>
          </div>
          <div className="font-mono text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 break-all">{hash}</div>
          {result.cbor && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">CBOR</p>
              <div className="relative">
                <div className="font-mono text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 break-all max-h-24 overflow-y-auto">
                  {result.cbor}
                </div>
                <div className="absolute top-1 right-1"><CopyButton text={result.cbor} /></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section: Datum Decoder ────────────────────────────────────────────────────

function DatumDecoder() {
  const [hex,     setHex]     = useState("");
  const [result,  setResult]  = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const decode = async () => {
    if (!hex.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await callTool("decode_cbor_datum", { cbor_hex: hex.trim() });
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Datum Decoder</h3>
        <p className="text-xs text-gray-400">Paste any CBOR hex datum from a UTxO — get readable JSON</p>
      </div>

      <div className="space-y-2">
        <textarea
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          placeholder="d87980  (or any CBOR hex from a UTxO's inline_datum)"
          rows={3}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 font-mono resize-none"
          spellCheck={false}
        />
        <button
          onClick={decode}
          disabled={loading || !hex.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? "Decoding…" : "Decode"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Decoded PlutusData</p>
          <div className="relative">
            <pre className="bg-gray-50 text-gray-800 text-xs rounded-lg px-3 py-2 overflow-x-auto whitespace-pre max-h-64">
              {JSON.stringify(result.decoded, null, 2)}
            </pre>
            <div className="absolute top-1 right-1">
              <CopyButton text={JSON.stringify(result.decoded, null, 2)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section: Validator Templates ──────────────────────────────────────────────

function ValidatorTemplates() {
  const [active,  setActive]  = useState<TemplateId | null>(null);
  const [code,    setCode]    = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const select = async (id: TemplateId) => {
    if (active === id) { setActive(null); setCode(null); return; }
    setActive(id); setLoading(true); setCode(null);
    try {
      const data = await callTool<{ code: string }>("scaffold_validator", { template: id });
      setCode(data.code);
    } catch { setCode("// Error loading template"); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Aiken Validator Templates</h3>
        <p className="text-xs text-gray-400">Ready-to-compile Aiken smart contract patterns — click to expand</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => select(t.id)}
            className={`text-left p-3 rounded-xl border transition-colors ${
              active === t.id
                ? "border-blue-400 bg-blue-50"
                : "border-gray-100 bg-gray-50 hover:border-gray-300"
            }`}
          >
            <span className="text-lg block mb-1">{t.icon}</span>
            <p className="text-xs font-semibold text-gray-800">{t.label}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{t.desc}</p>
          </button>
        ))}
      </div>

      {active && (
        <div>
          {loading
            ? <div className="bg-gray-900 rounded-xl p-4 h-32 animate-pulse" />
            : code && <CodeBlock code={code} />
          }
          <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-700">
              <strong>To compile:</strong> create an Aiken project (<code className="font-mono">aiken new my_contract</code>),
              place this in <code className="font-mono">validators/</code>, then run <code className="font-mono">aiken build</code>.
              The compiled script hash ends up in <code className="font-mono">plutus.json</code>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function Contracts() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Smart Contracts</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Inspect on-chain scripts, decode UTxO datums, and browse Aiken validator templates
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ScriptInspector />
        <DatumDecoder />
      </div>

      <ValidatorTemplates />
    </div>
  );
}
