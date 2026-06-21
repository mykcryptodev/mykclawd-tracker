---
name: log-a-dog-voting
description: Vote on Log a Dog submissions on Base as VALID DOG or SUS, including HOTDOG balance checks, staking setup, and private vote-result handling
tags: [defi, voting, base, hotdog, log-a-dog]
version: 1
visibility: public
metadata:
  clawdbot:
    emoji: "🌭"
    homepage: "https://mykclawd.xyz/skills#logadog"
---

# Log a Dog Voting Skill Overview

**Log a Dog** is a Base app where users log dog photos and judges vote whether each dog is valid or sus. This skill helps agents prepare a Bankr wallet, stake HOTDOG when needed, and cast a verdict during the dog attestation window.

## Key Capabilities

- **Dog ID Parsing**: Extract the dog ID from `https://www.logadog.xyz/dog/<id>` URLs or use a provided numeric dog ID.
- **Vote Setup**: Check HOTDOG balance, current Season 3 staking status, and available unlocked stake before voting.
- **Token Acquisition**: If the user lacks enough HOTDOG, ask permission before swapping into HOTDOG on Base.
- **Staking**: Ask how much HOTDOG to stake when setup is required; default to the user's entire HOTDOG wallet balance.
- **Voting**: Vote `VALID DOG` or `SUS` according to the user's requested verdict.
- **Result Privacy**: Do not share current vote outcomes while the voting period is still active.

## Before Voting

Users must:

1. Provide a verdict: `valid`, `VALID DOG`, `sus`, or equivalent wording.
2. Provide a dog ID or Log a Dog dog URL.
3. Have a Bankr wallet on Base mainnet.
4. Have enough available HOTDOG staked in the active voting/staking contract.

If the wallet is not set up to vote, guide the user through HOTDOG acquisition and staking before attempting the vote. Ask for explicit permission before any swap and before any staking or voting transaction.

## Primary Data Sources

- App URL pattern: `https://www.logadog.xyz/dog/<dogId>`
- Contracts reference: `https://mykclawd.xyz/api/skills/logadog/contracts`
- Workflows reference: `https://mykclawd.xyz/api/skills/logadog/workflows`

Use Base mainnet (`chainId: 8453`) unless the user explicitly asks for a supported testnet flow.

## Important Privacy Rule

While a dog's voting period is active, do **not** reveal live vote outcomes, current valid/sus totals, stake totals, percentages, or which side is ahead. You may say whether the wallet has voted, which side the user voted for, and when the voting period ends.

Only share the final valid/sus outcome after the attestation period is resolved.

## References

- Workflows: https://mykclawd.xyz/api/skills/logadog/workflows
- Contracts: https://mykclawd.xyz/api/skills/logadog/contracts
