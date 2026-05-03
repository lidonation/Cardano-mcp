/**
 * CBOR datum decoder using @emurgo/cardano-serialization-lib-nodejs.
 *
 * Cardano datums are stored on-chain as CBOR hex. This module converts
 * them to a readable JSON representation that AI agents can reason about.
 *
 * CSL is loaded lazily because it's a WASM module — importing it at the
 * top level can cause issues in some environments.
 */

type CslModule = typeof import("@emurgo/cardano-serialization-lib-nodejs");

let _csl: CslModule | null = null;

async function getCsl(): Promise<CslModule> {
  if (!_csl) {
    _csl = await import("@emurgo/cardano-serialization-lib-nodejs");
  }
  return _csl;
}

export interface PlutusDataJson {
  type: "int" | "bytes" | "list" | "map" | "constructor";
  value?: string | number | bigint;
  items?: PlutusDataJson[];
  entries?: Array<{ key: PlutusDataJson; value: PlutusDataJson }>;
  constructor?: number;
  fields?: PlutusDataJson[];
}

function cslPlutusDataToJson(
  Csl: CslModule,
  data: ReturnType<CslModule["PlutusData"]["from_hex"]>
): PlutusDataJson {
  const kind = data.kind();
  const DataKind = Csl.PlutusDataKind;

  if (kind === DataKind.Integer) {
    const integer = data.as_integer();
    if (!integer) return { type: "int", value: 0 };
    return { type: "int", value: integer.to_str() };
  }

  if (kind === DataKind.Bytes) {
    const bytes = data.as_bytes();
    if (!bytes) return { type: "bytes", value: "" };
    return {
      type: "bytes",
      value: Buffer.from(bytes).toString("hex"),
    };
  }

  if (kind === DataKind.List) {
    const list = data.as_list();
    if (!list) return { type: "list", items: [] };
    const items: PlutusDataJson[] = [];
    for (let i = 0; i < list.len(); i++) {
      const item = list.get(i);
      items.push(cslPlutusDataToJson(Csl, item));
    }
    return { type: "list", items };
  }

  if (kind === DataKind.Map) {
    const map = data.as_map();
    if (!map) return { type: "map", entries: [] };
    const keys = map.keys();
    const entries: Array<{ key: PlutusDataJson; value: PlutusDataJson }> = [];
    for (let i = 0; i < keys.len(); i++) {
      const key = keys.get(i);
      const val = map.get(key);
      if (val) {
        entries.push({
          key: cslPlutusDataToJson(Csl, key),
          value: cslPlutusDataToJson(Csl, val),
        });
      }
    }
    return { type: "map", entries };
  }

  if (kind === DataKind.ConstrPlutusData) {
    const constr = data.as_constr_plutus_data();
    if (!constr) return { type: "constructor", constructor: 0, fields: [] };
    const alt = constr.alternative().to_str();
    const dataList = constr.data();
    const fields: PlutusDataJson[] = [];
    for (let i = 0; i < dataList.len(); i++) {
      fields.push(cslPlutusDataToJson(Csl, dataList.get(i)));
    }
    return { type: "constructor", constructor: parseInt(alt, 10), fields };
  }

  return { type: "bytes", value: "<unknown kind>" };
}

/**
 * Decode a CBOR hex datum string into a structured JSON representation.
 * This is the primary tool for making on-chain datum state readable.
 */
export async function decodeCborDatum(cborHex: string): Promise<PlutusDataJson> {
  const Csl = await getCsl();
  const clean = cborHex.startsWith("0x") ? cborHex.slice(2) : cborHex;
  const data = Csl.PlutusData.from_hex(clean);
  return cslPlutusDataToJson(Csl, data);
}

/**
 * Encode a PlutusData JSON back to CBOR hex.
 * Useful for constructing datums when building transactions.
 */
export async function encodePlutusDataToHex(
  json: PlutusDataJson
): Promise<string> {
  const Csl = await getCsl();

  function buildPlutusData(
    j: PlutusDataJson
  ): ReturnType<CslModule["PlutusData"]["from_hex"]> {
    switch (j.type) {
      case "int": {
        const bigNum = Csl.BigInt.from_str(String(j.value ?? 0));
        return Csl.PlutusData.new_integer(bigNum);
      }
      case "bytes": {
        const hex = String(j.value ?? "");
        return Csl.PlutusData.new_bytes(Buffer.from(hex, "hex"));
      }
      case "list": {
        const list = Csl.PlutusList.new();
        for (const item of j.items ?? []) {
          list.add(buildPlutusData(item));
        }
        return Csl.PlutusData.new_list(list);
      }
      case "map": {
        const map = Csl.PlutusMap.new();
        for (const { key, value } of j.entries ?? []) {
          map.insert(buildPlutusData(key), buildPlutusData(value));
        }
        return Csl.PlutusData.new_map(map);
      }
      case "constructor": {
        const alt = Csl.BigNum.from_str(String(j.constructor ?? 0));
        const fields = Csl.PlutusList.new();
        for (const field of j.fields ?? []) {
          fields.add(buildPlutusData(field));
        }
        const constr = Csl.ConstrPlutusData.new(alt, fields);
        return Csl.PlutusData.new_constr_plutus_data(constr);
      }
      default:
        throw new Error(`Unknown PlutusData type: ${(j as PlutusDataJson).type}`);
    }
  }

  const plutusData = buildPlutusData(json);
  return plutusData.to_hex();
}
