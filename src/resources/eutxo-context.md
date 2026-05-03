# Cardano eUTxO Model — Context for AI Agents

## The fundamental difference from Ethereum

Cardano uses the **Extended Unspent Transaction Output (eUTxO)** model.
Ethereum uses an **account/balance** model.

**Do not confuse them.** There are no "account balances" in Cardano.
There are only UTxOs — discrete coins that exist at addresses.

## What is a UTxO?

A UTxO is a discrete chunk of value that has not yet been spent. Think of it like a physical coin or bill in your wallet.

Each UTxO has:
- `tx_hash` — the transaction that created it (64 hex chars)
- `output_index` — which output in that transaction (0, 1, 2…)
- `address` — where it lives (bech32: `addr1...` mainnet, `addr_test1...` testnet)
- `value` — lovelace amount + any native assets
- `datum` (optional) — arbitrary data attached to the UTxO (for smart contracts)
- `reference_script` (optional) — a script stored here for reference spending (Vasil CIP-31)

The **balance** of an address = sum of all UTxO values at that address.
Always fetch UTxOs to determine holdings — never assume a single balance number.

## Spending a UTxO

To spend a UTxO, you must consume it **entirely** in a transaction.
If you spend a 10 ADA UTxO but only need 7 ADA, you send 7 ADA to the recipient
and 2.83 ADA (10 - 7 - 0.17 fee) back to yourself as a **change output**.

Rules:
- Every input must be fully consumed
- Sum(inputs) = Sum(outputs) + fees
- No partial spending allowed

## Smart contracts in eUTxO

Plutus smart contracts are **validators**, not stateful programs.

A script **locks** a UTxO at a script address. To spend that UTxO, a transaction must:
1. Provide a **redeemer** (arbitrary data)
2. Run the validator with: `datum` (state on the UTxO) + `redeemer` (action) + `tx_context`
3. The validator returns `True` (allow) or throws (deny)

The script itself holds no state — **state lives in datums on UTxOs**.
Each "interaction" creates a new UTxO with a new datum (updated state).

Example flow for a DEX swap:
1. User locks ADA UTxO at script address with datum `{price: 1.5, asset: "tokenX"}`
2. Buyer builds a tx spending that UTxO, providing a redeemer `{action: "buy"}`
3. Validator checks: is the buyer paying the right price?
4. If valid, old UTxO is consumed, new UTxO with updated state is created

## Encoding rules — avoid common mistakes

| Thing | Format | Example |
|-------|--------|---------|
| ADA amount | lovelace (1 ADA = 1,000,000) | `"5000000"` = 5 ADA |
| Asset ID | policyId + hexAssetName | `"d5e6bf05...736f6d657468696e67"` |
| Asset separator | dot notation | `"policyId.hexName"` |
| Address (mainnet) | bech32 `addr1...` | 103 chars |
| Address (testnet) | bech32 `addr_test1...` | |
| Script hash | 56 hex chars | |
| Tx hash | 64 hex chars | |
| Datum | CBOR hex | use `decode_cbor_datum` tool |
| All amounts | strings, not numbers | avoids JS BigInt overflow |

## Minimum ADA (minUTxO)

Every UTxO must carry a minimum ADA amount determined by the protocol.
As of Babbage era: `minADA = ceil(utxoBytes * coinsPerUtxoByte)`
where `coinsPerUtxoByte ≈ 4310 lovelace`.

UTxOs with native assets or large datums require more ADA.
Use the `calculate_min_ada` tool to compute the exact minimum.

## Native assets

Native assets live alongside ADA in UTxOs. They are identified by:
`policyId.hexAssetName` where:
- `policyId` = 56 hex chars (hash of the minting script)
- `hexAssetName` = UTF-8 asset name encoded as hex

Example: `d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc.736f6d657468696e67`
decoded: policy `d5e6bf05...` + name `"something"` (UTF-8 → hex)

Native assets require no smart contract — their policy is enforced by a minting script
(either a simple multisig/timelock script or a Plutus script).

## Addresses

Three address types:
1. **Enterprise** — payment key only, no staking (`addr1v...`)
2. **Base** — payment + staking key (`addr1q...`)
3. **Script** — payment credential is a script hash (`addr1w...`)

Cardano addresses embed the network ID, so mainnet and testnet addresses
are structurally distinct and cannot be confused.
