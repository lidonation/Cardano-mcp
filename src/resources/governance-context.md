# Cardano CIP-1694 Governance — Context for AI Agents

## Status: LIVE on Mainnet

Cardano on-chain governance went live with the **Plomin Hard Fork** in January 2025.
Any queries about "current" governance refer to mainnet epoch 450+.

## The three voting bodies

### 1. DReps (Delegated Representatives)
- Any ADA holder can register as a DRep
- ADA holders delegate their voting power (stake) to a DRep
- DRep voting power = total lovelace delegated to them
- DRep ID format: bech32 `drep1...` (CIP-0005/CIP-129)
- Special DReps: `drep_always_abstain` and `drep_always_no_confidence`

### 2. SPOs (Stake Pool Operators)
- All registered stake pools automatically vote on certain proposal types
- SPO voting power = blocks minted in recent epochs (stake-weighted)
- Pool IDs: bech32 `pool1...`
- SPOs vote only on: HardForkInitiation and ParameterChange proposals

### 3. Constitutional Committee (CC)
- A fixed set of trusted entities defined in the constitution
- CC votes using hot credentials (day-to-day voting key)
- Cold credentials are used only for key rotation/resignation
- CC hot ID: bech32 `cc_hot1...`
- CC cold ID: bech32 `cc_cold1...`
- CC members have expiration epochs; must rotate before expiry

## The seven governance action types

| Type | Who votes | Description |
|------|-----------|-------------|
| `MotionOfNoConfidence` | DReps, SPOs | Remove CC from power |
| `UpdateCommittee` | DReps, SPOs | Add/remove CC members, change threshold |
| `UpdateConstitution` | DReps, CC | Change the on-chain constitution |
| `HardForkInitiation` | DReps, SPOs, CC | Protocol version upgrade |
| `ParameterChange` | DReps, SPOs, CC | Change protocol parameters |
| `TreasuryWithdrawal` | DReps, CC | Withdraw ADA from treasury |
| `InfoAction` | DReps, SPOs, CC | Record intent on-chain (no protocol effect) |

## Proposal lifecycle

```
Submitted → Active → Ratified → Enacted
                  ↘ Expired (epoch_expiry reached)
                  ↘ Dropped (no longer valid)
```

- **Active**: voting is open, within expiry epoch
- **Ratified**: threshold met, waiting for next epoch boundary to enact
- **Enacted**: change has been applied to the protocol
- **Expired**: voting window closed without reaching threshold
- **Dropped**: proposal became invalid (e.g. prerequisite not met)

## Proposal IDs

Proposals use two formats:
1. **CIP-129 bech32**: `gov_action1...` — human-readable, preferred
2. **txHash#certIndex**: `abc123...#0` — low-level format from chain data

The Koios API accepts both formats in `_proposal_ids`.

## Thresholds

Ratification requires thresholds to be met across the relevant voting bodies.
Thresholds are protocol parameters (as fractions, e.g. 0.67 = 67%).
Current thresholds are available via `get_protocol_params`.

Key thresholds (approximate, check params for exact values):
- DRep vote threshold: ~67% for most actions
- SPO threshold: ~51% for HardFork
- CC threshold: ~67% for all actions requiring CC

## The Treasury

- Funded by: 20% of transaction fees + protocol reserve draws (monetary expansion)
- Current balance: use `get_treasury_balance` tool
- Withdrawals require a `TreasuryWithdrawal` proposal passing DRep + CC vote
- Withdrawals go to specific stake addresses specified in the proposal

## Anchors (metadata)

Governance proposals, DRep registrations, and votes can carry an **anchor**:
- `meta_url`: URL to a JSON metadata document (typically IPFS or HTTPS)
- `meta_hash`: Blake2b-256 hash of the document at that URL

The hash prevents tampering. Always verify the document at the URL matches the hash
before trusting the metadata content.

## Encoding

- Lovelace applies to all amounts (voting power, deposits, treasury balances)
- DRep deposit: 500 ADA (500,000,000 lovelace) per CIP-1694
- Proposal deposit: 100,000 ADA (100,000,000,000 lovelace) — refunded on expiry/enactment
