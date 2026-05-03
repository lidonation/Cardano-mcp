/** Shared TypeScript types for Cardano MCP. All amounts are strings to avoid JS BigInt overflow. */

export interface Asset {
  unit: string; // policyId.hexAssetName or "lovelace"
  quantity: string; // string — avoid BigInt overflow
}

export interface UTxO {
  tx_hash: string;
  tx_index: number;
  address: string;
  amount: Asset[];
  block: string;
  data_hash: string | null;
  inline_datum: string | null; // CBOR hex
  reference_script_hash: string | null;
}

export interface TransactionInput {
  address: string;
  amount: Asset[];
  tx_hash: string;
  output_index: number;
  data_hash: string | null;
  inline_datum: string | null;
  collateral: boolean;
  reference: boolean;
}

export interface TransactionOutput {
  address: string;
  amount: Asset[];
  output_index: number;
  data_hash: string | null;
  inline_datum: string | null;
  collateral: boolean;
  reference: boolean;
}

export interface Transaction {
  hash: string;
  block: string;
  block_height: number;
  block_time: number;
  slot: number;
  index: number;
  output_amount: Asset[];
  fees: string;
  deposit: string;
  size: number;
  invalid_before: string | null;
  invalid_hereafter: string | null;
  utxos: {
    inputs: TransactionInput[];
    outputs: TransactionOutput[];
  };
}

export interface ProtocolParams {
  epoch: number;
  min_fee_a: number;
  min_fee_b: number;
  max_block_size: number;
  max_tx_size: number;
  max_block_header_size: number;
  key_deposit: string;
  pool_deposit: string;
  e_max: number;
  n_opt: number;
  a0: number;
  rho: number;
  tau: number;
  decentralisation_param: number;
  extra_entropy: string | null;
  protocol_major_ver: number;
  protocol_minor_ver: number;
  min_utxo: string;
  min_pool_cost: string;
  nonce: string;
  cost_models: Record<string, Record<string, number>> | null;
  price_mem: number;
  price_step: number;
  max_tx_ex_mem: string;
  max_tx_ex_steps: string;
  max_block_ex_mem: string;
  max_block_ex_steps: string;
  max_val_size: string;
  collateral_percent: number;
  max_collateral_inputs: number;
  coins_per_utxo_size: string;
  coins_per_utxo_word: string;
}

export interface BlockInfo {
  hash: string;
  epoch: number;
  abs_slot: number;
  epoch_slot: number;
  block_no: number;
  block_time: number;
  tx_count: number;
  vrf_key: string;
  op_cert: string;
  op_cert_counter: string;
  pool: string;
  proto_major: number;
  proto_minor: number;
  total_output: string;
  total_fees: string;
  num_confirmations: number;
  parent_hash: string;
  child_hash: string | null;
}

export interface AssetInfo {
  asset: string;
  policy_id: string;
  asset_name: string | null;
  fingerprint: string;
  quantity: string;
  initial_mint_tx_hash: string;
  mint_or_burn_count: number;
  onchain_metadata: Record<string, unknown> | null;
  onchain_metadata_standard: "CIP25v1" | "CIP25v2" | "CIP68" | null;
  metadata: {
    name: string;
    description: string;
    ticker: string | null;
    url: string | null;
    logo: string | null;
    decimals: number | null;
  } | null;
}

export interface AddressTx {
  tx_hash: string;
  epoch_no: number;
  block_height: number;
  block_time: number;
}

// Governance types — CIP-1694

export type GovActionType =
  | "MotionOfNoConfidence"
  | "UpdateCommittee"
  | "UpdateConstitution"
  | "HardForkInitiation"
  | "ParameterChange"
  | "TreasuryWithdrawal"
  | "InfoAction";

export type ProposalStatus = "active" | "ratified" | "enacted" | "expired" | "dropped";

export type VoteChoice = "yes" | "no" | "abstain";

export type VoterRole = "drep" | "spo" | "committee";

export interface GovernanceProposal {
  proposal_id: string; // CIP-129 bech32 gov_action1...
  tx_hash: string;
  cert_index: number;
  gov_action_type: GovActionType;
  epoch_no: number;
  epoch_expiry: number;
  proposal_status: ProposalStatus;
  meta_url: string | null;
  meta_hash: string | null;
  deposit: string;
  return_address: string;
  ratified_epoch: number | null;
  enacted_epoch: number | null;
  dropped_epoch: number | null;
  expired_epoch: number | null;
}

export interface DRepInfo {
  drep_id: string; // bech32 drep1...
  hex: string;
  has_script: boolean;
  registered: boolean;
  retired: boolean;
  deposit: string;
  active_epoch_no: number | null;
  meta_url: string | null;
  meta_hash: string | null;
  voting_power: string | null;
}

export interface Vote {
  proposal_id: string;
  voter_role: VoterRole;
  voter_id: string;
  vote: VoteChoice;
  tx_hash: string;
  block_time: number;
  meta_url: string | null;
  meta_hash: string | null;
}

export interface CommitteeMember {
  cc_hot_id: string;
  cc_cold_id: string;
  status: "active" | "expired" | "resigned" | "unrecognized";
  expiration_epoch: number | null;
  has_script: boolean;
}

export interface ScriptInfo {
  script_hash: string;
  type: "timelock" | "plutusV1" | "plutusV2" | "plutusV3";
  serialised_size: number | null;
}

export interface KupoMatch {
  transaction_index: number;
  transaction_id: string;
  output_index: number;
  address: string;
  value: {
    coins: number;
    assets: Record<string, number>;
  };
  datum_hash: string | null;
  script_hash: string | null;
  created_at: { slot_no: number; header_hash: string };
  spent_at: { slot_no: number; header_hash: string } | null;
}

export interface MintTransaction {
  policyId: string;
  assetName: string; // hex
  quantity: string;
  mintingScript: string; // CBOR hex of the minting script
}

export interface BuildTxResult {
  unsignedTx: string; // CBOR hex of unsigned transaction
  fee: string; // lovelace
  inputs: string[]; // txHash#index
  outputs: Array<{ address: string; value: Asset[] }>;
}
