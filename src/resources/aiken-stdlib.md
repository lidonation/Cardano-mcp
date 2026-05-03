# Aiken Standard Library — Quick Reference

Aiken is Cardano's purpose-built smart contract language. Version: `aiken-lang/stdlib v2.x`

## Basic Types

```aiken
// Primitives
Int         // arbitrary precision integer
ByteArray   // raw bytes (hex literal: #"deadbeef")
Bool        // True | False
String      // UTF-8 string (double quotes)
Void        // unit type

// Collections
List<a>              // linked list
Option<a>            // None | Some(a)
Pair<a, b>           // (a, b) tuple
Dict<key, value>     // ordered map (from aiken/dict)
```

## aiken/list

```aiken
use aiken/list

list.length(xs)               // Int
list.head(xs)                 // Option<a>
list.tail(xs)                 // Option<List<a>>
list.map(xs, fn(x) { ... })   // List<b>
list.filter(xs, fn(x) { ... })
list.find(xs, fn(x) { ... })  // Option<a>
list.any(xs, fn(x) { ... })   // Bool
list.all(xs, fn(x) { ... })   // Bool
list.foldl(xs, init, fn(x, acc) { ... })
list.foldr(xs, init, fn(x, acc) { ... })
list.concat(xs, ys)
list.flatten(xss)
list.unique(xs)
list.zip(xs, ys)              // List<Pair<a, b>>
list.contains(xs, item)       // Bool (requires Eq)
```

## aiken/bytearray

```aiken
use aiken/bytearray

bytearray.length(ba)          // Int
bytearray.concat(b1, b2)      // ByteArray
bytearray.slice(ba, start, end)
bytearray.take(ba, n)
bytearray.drop(ba, n)
bytearray.at(ba, index)       // Int (byte value)
bytearray.from_string(s)      // ByteArray
bytearray.to_hex(ba)          // String
```

## aiken/math

```aiken
use aiken/math

math.abs(n)
math.min(a, b)
math.max(a, b)
math.pow(base, exp)
math.log(n, base)
math.sqrt(n)       // integer square root
math.gcd(a, b)
```

## aiken/transaction

```aiken
use cardano/transaction.{Transaction, Input, Output}
use cardano/assets.{Value, PolicyId, AssetName}
use cardano/address.{Address, Credential, StakeCredential}

// Transaction context (passed to validators)
type Transaction {
  inputs: List<Input>
  reference_inputs: List<Input>
  outputs: List<Output>
  fee: Int                          // lovelace
  mint: Value                       // minted/burned assets
  certificates: List<Certificate>
  withdrawals: Dict<StakeCredential, Int>
  validity_range: ValidityRange
  extra_signatories: List<ByteArray> // PubKeyHashes
  redeemers: Dict<ScriptPurpose, Data>
  datums: Dict<ByteArray, Data>
  id: TransactionId
}

type Input {
  output_reference: OutputReference
  output: Output
}

type Output {
  address: Address
  value: Value
  datum: Datum
  reference_script: Option<Script>
}

type OutputReference {
  transaction_id: TransactionId
  output_index: Int
}
```

## aiken/assets (Value)

```aiken
use cardano/assets.{Value, PolicyId, AssetName, lovelace}

// Check lovelace
assets.lovelace_of(value)                    // Int

// Check assets
assets.quantity_of(value, policy, name)      // Int
assets.tokens(value, policy_id)              // Dict<AssetName, Int>
assets.policies(value)                       // List<PolicyId>

// Arithmetic
assets.add(v1, v2)                           // Value
assets.merge(v1, v2)                         // Value (same as add)
assets.negate(value)                         // for burn

// Comparison
assets.without_lovelace(value)               // Value (strip ADA)
assets.flatten(value)                        // List<(PolicyId, AssetName, Int)>
```

## Writing Validators

```aiken
use cardano/transaction.{Transaction}

// Spend validator
validator my_contract {
  spend(
    datum: Option<MyDatum>,
    redeemer: MyRedeemer,
    _own_ref: OutputReference,
    tx: Transaction
  ) {
    // return Bool — True = allow, False/fail = deny
    when redeemer is {
      Unlock -> datum == Some(expected_datum)
      Cancel -> list.any(tx.extra_signatories, fn(sig) { sig == owner_pkh })
    }
  }
}

// Mint validator
validator my_policy {
  mint(redeemer: MintRedeemer, _policy_id: PolicyId, tx: Transaction) {
    // validate minting logic
    True
  }
}
```

## Common Patterns

### Require a signature
```aiken
must_be_signed_by(tx: Transaction, pkh: ByteArray) -> Bool {
  list.any(tx.extra_signatories, fn(sig) { sig == pkh })
}
```

### Find own input
```aiken
find_own_input(tx: Transaction, ref: OutputReference) -> Option<Input> {
  list.find(tx.inputs, fn(input) { input.output_reference == ref })
}
```

### Validate output to address
```aiken
output_to(tx: Transaction, addr: Address) -> Option<Output> {
  list.find(tx.outputs, fn(out) { out.address == addr })
}
```

### Validity range check
```aiken
use aiken/interval.{Interval}

// tx.validity_range is Interval<Int> (POSIX milliseconds)
interval.is_entirely_before(tx.validity_range, deadline)
interval.is_entirely_after(tx.validity_range, start_time)
```

## Running Aiken

```bash
aiken build              # compile to uplc + plutus.json
aiken check              # typecheck + run tests
aiken docs               # generate docs

# Test syntax
test my_test() {
  my_function(42) == expected_value
}
```
