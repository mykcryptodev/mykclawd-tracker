# Log a Dog Contracts

These values are for Base mainnet. If the live Log a Dog app publishes newer addresses, prefer the app's current constants.

## Chain

- Chain: Base mainnet
- Chain ID: `8453`

## Contracts

- HOTDOG token: `0x61f47EC6D1d0ef9b095574D7b76cF0467d13fB07`
- Season 3 voting/staking contract: `0x42B32e8de4eC9cc53825bcd61D4d29A724BC9f54`
- Attestation manager: `0xf890Ba81bA07aEf61320e1500AbB141BC3316fdC`
- Log a Dog contract: `0x6CfB88C8d0d7FFC563155e13C62b4Fa17bc25974`

## Token Units

- HOTDOG decimals: `18`
- Minimum staking transaction amount: `300000000000000000000000` (`300,000 HOTDOG`)
- Minimum vote/attestation stake: `30000000000000000000000` (`30,000 HOTDOG`)

## ERC-20 ABI

```json
[
  {
    "type": "function",
    "name": "balanceOf",
    "stateMutability": "view",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "allowance",
    "stateMutability": "view",
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "approve",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "value", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool" }]
  }
]
```

## Staking ABI

```json
[
  {
    "type": "function",
    "name": "MINIMUM_STAKE",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "stake",
    "stateMutability": "nonpayable",
    "inputs": [{ "name": "amount", "type": "uint256" }],
    "outputs": []
  },
  {
    "type": "function",
    "name": "stakes",
    "stateMutability": "view",
    "inputs": [{ "name": "user", "type": "address" }],
    "outputs": [
      { "name": "amount", "type": "uint256" },
      { "name": "rewardDebt", "type": "uint256" },
      { "name": "pendingRewards", "type": "uint256" },
      { "name": "isActive", "type": "bool" },
      { "name": "stakeTimestamp", "type": "uint256" }
    ]
  },
  {
    "type": "function",
    "name": "lockedForAttestation",
    "stateMutability": "view",
    "inputs": [{ "name": "user", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "getAvailableStake",
    "stateMutability": "view",
    "inputs": [{ "name": "user", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "canParticipateInAttestation",
    "stateMutability": "view",
    "inputs": [
      { "name": "user", "type": "address" },
      { "name": "requiredStake", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool" }]
  }
]
```

## Attestation Manager ABI

```json
[
  {
    "type": "function",
    "name": "MINIMUM_ATTESTATION_STAKE",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "getAttestationPeriod",
    "stateMutability": "view",
    "inputs": [{ "name": "logId", "type": "uint256" }],
    "outputs": [
      { "name": "startTime", "type": "uint256" },
      { "name": "endTime", "type": "uint256" },
      { "name": "status", "type": "uint8" },
      { "name": "totalValidStake", "type": "uint256" },
      { "name": "totalInvalidStake", "type": "uint256" },
      { "name": "isValid", "type": "bool" },
      { "name": "resolvedAt", "type": "uint256" }
    ]
  },
  {
    "type": "function",
    "name": "hasUserAttested",
    "stateMutability": "view",
    "inputs": [
      { "name": "logId", "type": "uint256" },
      { "name": "user", "type": "address" }
    ],
    "outputs": [{ "name": "", "type": "bool" }]
  },
  {
    "type": "function",
    "name": "getUserStakeInAttestation",
    "stateMutability": "view",
    "inputs": [
      { "name": "logId", "type": "uint256" },
      { "name": "user", "type": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "getUserAttestationsWithChoices",
    "stateMutability": "view",
    "inputs": [{ "name": "user", "type": "address" }],
    "outputs": [
      { "name": "logIds", "type": "uint256[]" },
      { "name": "choices", "type": "bool[]" }
    ]
  },
  {
    "type": "function",
    "name": "attestToLog",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "logId", "type": "uint256" },
      { "name": "isValid", "type": "bool" },
      { "name": "stakeAmount", "type": "uint256" }
    ],
    "outputs": []
  }
]
```

## Log a Dog ABI

```json
[
  {
    "type": "function",
    "name": "hotdogLogs",
    "stateMutability": "view",
    "inputs": [{ "name": "logId", "type": "uint256" }],
    "outputs": [
      { "name": "id", "type": "uint256" },
      { "name": "imageUri", "type": "string" },
      { "name": "metadataUri", "type": "string" },
      { "name": "timestamp", "type": "uint256" },
      { "name": "eater", "type": "address" },
      { "name": "logger", "type": "address" },
      { "name": "zoraCoin", "type": "address" }
    ]
  }
]
```

## Status Values

`getAttestationPeriod(logId).status` returns:

- `0`: active
- `1`: resolved
- `2`: disputed

Only share the final `isValid` result after `status` is `1`.
