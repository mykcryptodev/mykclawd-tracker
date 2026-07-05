# Log a Dog Voting Workflows

These workflows assume a Bankr wallet on Base mainnet.

The goal is to mirror the Log a Dog app's current user-wallet path: acquire and stake HOTDOG when needed, then call `AttestationManager.attestToLog` from the user's wallet. Do not use a server wallet, thirdweb Engine, or `attestToLogOnBehalf`.

## Parse Dog ID And Verdict

Inputs required from the user:

- Dog ID, either as a number like `2078` or a URL like `https://www.logadog.xyz/dog/2078`
- Verdict, either `VALID DOG` / `valid` or `SUS` / `invalid`

Parsing rules:

1. If the user provides a URL, extract the first numeric path segment after `/dog/`.
2. If the user provides only a number, use it as the `logId`.
3. If there is no dog ID, ask for one.
4. If there is no clear verdict, ask whether they want to vote `VALID DOG` or `SUS`.
5. Normalize `VALID DOG`, `valid`, `real`, `legit`, and `yes` to `isValid = true`.
6. Normalize `SUS`, `suspicious`, `invalid`, `fake`, and `no` to `isValid = false`.

Do not infer a verdict from the photo or dog page unless the user asks for advice. If the user asks for advice, explain uncertainty and ask for explicit confirmation before voting.

## Check Dog And Voting Period

Read from the Attestation Manager:

```text
getAttestationPeriod(logId)
```

Use the response fields as:

- `startTime`: voting period start timestamp
- `endTime`: voting period end timestamp
- `status`: `0` active, `1` resolved, `2` disputed
- `isValid`: final result, only safe to share after resolution
- `resolvedAt`: resolution timestamp, `0` if unresolved

Before voting:

1. If `startTime` is `0`, stop and explain that the dog does not have an attestation period.
2. If `status` is not `0`, stop and explain that voting is no longer active. If resolved, share the final result.
3. If the current block timestamp is after `endTime`, stop and explain that the voting period has ended.
4. Read `hasUserAttested(logId, wallet)`. If true, stop and tell the user they already voted on this dog. You may share their own prior vote only if you can read it from user-specific data.
5. Optionally read `LogADog.hotdogLogs(logId)` to identify the eater. If the Bankr wallet is the eater, stop and explain that users cannot vote on their own dog.

Privacy rule: while status is active, do not report current valid/sus counts, total stake by side, percentages, or which side is ahead.

## Check HOTDOG And Staking Setup

Read:

```text
HOTDOG.balanceOf(wallet)
HOTDOG.allowance(wallet, stakingContract)
Staking.stakes(wallet)
Staking.lockedForAttestation(wallet)
Staking.getAvailableStake(wallet)
Staking.canParticipateInAttestation(wallet, voteStakeAmount)
AttestationManager.MINIMUM_ATTESTATION_STAKE()
Staking.MINIMUM_STAKE()
```

Interpretation:

- `MINIMUM_ATTESTATION_STAKE` is the minimum HOTDOG amount that can be locked behind a dog vote. It is currently `30,000 HOTDOG`.
- `Staking.MINIMUM_STAKE` is the minimum amount accepted by the staking contract for a stake transaction. It is currently `300,000 HOTDOG`.
- `getAvailableStake(wallet)` must be at least the vote stake amount before voting.
- `canParticipateInAttestation(wallet, voteStakeAmount)` must return `true` before voting.
- `lockedForAttestation(wallet)` is already committed to active votes and cannot be reused until those periods resolve.

If available stake is already at least `MINIMUM_ATTESTATION_STAKE`, the wallet is set up to vote. Continue to "Vote Valid Or Sus".

If available stake is insufficient:

1. Explain that the wallet is not set up to vote because it lacks enough available HOTDOG staked in the voting contract.
2. Check the wallet's liquid HOTDOG balance.
3. Ask how much HOTDOG the user wants to stake. Default to the entire liquid HOTDOG balance if it is at least `Staking.MINIMUM_STAKE`.
4. If the wallet has no HOTDOG or the amount to stake is below `Staking.MINIMUM_STAKE`, explain the minimum and offer to acquire enough HOTDOG through Bankr on Base.
5. If liquid HOTDOG is insufficient for the selected stake amount, ask permission to swap enough Base assets into HOTDOG. Do not swap without explicit approval.
6. After any swap completes, re-check `HOTDOG.balanceOf(wallet)`.
7. If `allowance(wallet, stakingContract)` is below the selected stake amount, submit `HOTDOG.approve(stakingContract, selectedStakeAmount)` and wait for confirmation.
8. Submit `Staking.stake(selectedStakeAmount)` and wait for confirmation.
9. Re-check `Staking.getAvailableStake(wallet)`.
10. Continue only if available stake is at least the vote stake amount.

Do not assume a user's entire staked balance should be locked on one dog. If the user did not specify a vote stake amount, use `MINIMUM_ATTESTATION_STAKE` for the dog vote after staking setup is complete.

## Acquire HOTDOG

Use Bankr's swap capability on Base.

Before swapping:

- Ask for explicit permission.
- State the token being acquired: `HOTDOG`.
- State the approximate amount needed. If the wallet has no HOTDOG and no stake, the normal setup amount is at least `Staking.MINIMUM_STAKE` (`300,000 HOTDOG`) plus a small cushion for slippage.
- Prefer swapping only enough to satisfy the requested staking amount plus a small slippage cushion.

After swapping:

- Re-check `HOTDOG.balanceOf(wallet)`.
- Continue to approval and staking only if the selected stake amount is available.

If the user declines the swap, stop and explain that voting requires enough HOTDOG to stake.

## Vote Valid Or Sus

Inputs:

- `logId`: parsed dog ID
- `isValid`: `true` for `VALID DOG`, `false` for `SUS`
- `voteStakeAmount`: HOTDOG amount to lock on this verdict, defaulting to `MINIMUM_ATTESTATION_STAKE`

Before submitting:

1. Confirm the dog ID and verdict with the user.
2. Confirm the vote stake amount if it is greater than `MINIMUM_ATTESTATION_STAKE`.
3. Confirm `getAvailableStake(wallet) >= voteStakeAmount`.
4. Confirm `canParticipateInAttestation(wallet, voteStakeAmount)` is `true`.
5. Confirm the attestation period is active.
6. Confirm the user has not already voted on the dog.

Submit from the user's wallet:

```text
AttestationManager.attestToLog(logId, isValid, voteStakeAmount)
```

Do not use `attestToLogOnBehalf`; it is reserved for authorized operator wallets.
Do not re-encode this as a generic `judge` or operator call. The active app flow calls `attestToLog` directly from the connected wallet.

After confirmation:

1. Re-read `getAttestationPeriod(logId)`.
2. Tell the user the vote succeeded and include:
   - Dog ID
   - User's verdict
   - Transaction hash
   - Voting period end time
3. Do not share current vote totals or which side is ahead while active.

## If Something Goes Wrong

Map common contract errors to plain language:

- `Attestation period does not exist`: this dog is not open for voting.
- `Attestation period has ended`: voting has closed for this dog.
- `Attestation period not active`: this dog is not currently voteable.
- `Already attested to this log`: the wallet already voted on this dog.
- `Stake amount too low`: the vote stake is below the minimum HOTDOG required for a verdict.
- `Cannot attest to your own log`: users cannot vote on their own dog.
- `Insufficient available stake`: the wallet needs more unlocked HOTDOG staked before voting.
- `Amount below minimum stake`: the staking amount is below the staking contract minimum.
- `Reward period has ended`: the staking season is over, so new setup cannot continue.

If a transaction fails for another reason, report the revert reason or wallet error exactly enough for the user to understand what happened, then stop.

## Reporting Resolved Results

Only after `status` is resolved may you share the final outcome:

- `isValid = true`: final outcome is `VALID DOG`
- `isValid = false`: final outcome is `SUS`

You may then share resolved totals if the user asks and the data is available. Do not share unresolved live totals.
