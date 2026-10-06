# Mainnet launch runbook

**Done on 2026-10-06.** Kept as the record of how the launch was carried out, and as the procedure for doing it again. The contract is `0xddCC4eb18b39a520b874046b91b748B5E8cE7C54` (deploy transaction `0xb05be04587d5b55778163f0c100504f8c3c0d945528099c2b4564dcfe7c1afb7`); the first anchor was transaction `0xd39fe1aa466da40d375164d72241b45c559f797c7094fc7f2713eb4a7449976e`; production switched to mainnet the same day and its first batch was transaction `0x8d5d2db89fe694d1b04c98f72bdf961876008b79bb1c6864047025984233ffce`.

The text below is as written before the launch. Each step that sends a transaction or changes production is a separate decision. Written for someone who is not a developer.

Network facts, checked against GOAT's documentation (docs.goat.network, "Networks & RPC" and the quick start) on 2026-10-06:

| | |
|---|---|
| Network | GOAT Network ("Alpha Mainnet" in GOAT's docs) |
| Chain | 2345, `eip155:2345` |
| RPC | `https://rpc.goat.network` (GOAT lists `https://rpc.ankr.com/goat_mainnet` as a backup) |
| Explorer | `https://explorer.goat.network` |
| Gas | BTC; gas price read on 2026-10-06: 130,007 wei |

## Before you start

- [ ] The mainnet wallet exists, its key is in the password manager as "GOAT MAINNET anchor key", and it is funded (see `mainnet-funding.md`).
- [ ] The API change that keeps batch sizes private and stores each network's batches separately is merged and deployed (API branch `anchor-mainnet-prep`).
- [ ] The hourly QStash schedule exists (see "The hourly call" below).

## 1. Deploy the contract (one real transaction, about 0.00000004 BTC)

Read-only check first; it asks for no key and sends nothing:

```bash
cd ~/tanilo-work/tanilo-anchor && node scripts/deploy-guarded.mjs --network mainnet --check-only
```

Then the deploy. It asks for the mainnet key with the input hidden, shows the address and balance, and makes you type `DEPLOY ON MAINNET`:

```bash
cd ~/tanilo-work/tanilo-anchor && node scripts/deploy-guarded.mjs --network mainnet
```

It ends by printing `CONTRACT ADDRESS: 0x…`, after checking that the code at that address is byte-identical to `build/TaniloAnchor.json` and that the contract's publisher is your wallet. Keep that address: every later step needs it.

## 2. First anchor on mainnet (one real transaction, about 0.00000001 BTC)

The same end-to-end run as the testnet dry run: a local copy of the API, three test receipts, one batch. It touches nothing deployed. Read-only check first:

```bash
cd ~/tanilo-work/x402-research-skill && TANILO_ANCHOR_CONTRACT=0xPASTE_THE_ADDRESS node anchor_first_mainnet.mjs . --check-only
```

Then the real run. It asks for the mainnet key (hidden) and makes you type `ANCHOR ON MAINNET`:

```bash
cd ~/tanilo-work/x402-research-skill && TANILO_ANCHOR_CONTRACT=0xPASTE_THE_ADDRESS node anchor_first_mainnet.mjs .
```

Results are written to `~/Desktop/for-review/anchor-first-mainnet/` (no secrets in them).

## 3. Switch production to mainnet (Vercel, Production only)

Change these in Vercel → project **x402-research-skill** → **Settings** → **Environment Variables**, Production only:

| Name | Today (testnet soak) | Mainnet value | Sensitive |
|---|---|---|---|
| `ANCHOR_CHAIN` | `goat-testnet3` | `goat-mainnet` | off |
| `ALLOW_MAINNET` | not set | `1` | off |
| `GOAT_RPC_URL` | `https://rpc.testnet3.goat.network` | `https://rpc.goat.network` | off |
| `TANILO_ANCHOR_CONTRACT` | `0x821b832D25d8E18BD3A761B935bfaf1c2F761D58` | `0xPLACEHOLDER_UNTIL_DEPLOY` (the address from step 1) | off |
| `GOAT_ANCHOR_PRIVATE_KEY` | the testnet v2 key | the mainnet key | **on** |
| `ANCHOR_QUEUE` | `1` | `1` (unchanged) | off |
| `CRON_SECRET` | set | unchanged | on |
| `ANCHOR_ONCHAIN_LEAF_COUNT` | not set | leave unset (so the on-chain count stays 0) | |

Without `ALLOW_MAINNET=1` the service refuses mainnet even if `ANCHOR_CHAIN` says mainnet. Both must be set. To go back to testnet, restore the left-hand column and remove `ALLOW_MAINNET`.

The variables take effect on the next deployment (Deployments → latest → Redeploy, or the next push).

What the switch does to stored data: mainnet batches are stored under their own prefix. The testnet batches stay where they are and are no longer listed or served while the service is on mainnet. Hashes still in the queue at the moment of the switch are anchored on mainnet.

## 4. Confirm

```bash
node ~/tanilo-work/tanilo-anchor/scripts/health.mjs
```

It should show `eip155:2345` and the mainnet contract. After the next run: one batch, and a proof for a fresh receipt that the Python checker confirms against `https://rpc.goat.network` with the mainnet contract as the trusted one.

## The hourly call

An Upstash QStash schedule calls `POST https://api.tanilo.io/internal/anchor/run` once an hour with the header `Authorization: Bearer <CRON_SECRET>`. QStash forwards a header to the destination when it is sent to QStash as `Upstash-Forward-Authorization`. This puts a second copy of the secret in Upstash, where the API's storage already lives.

GitHub's scheduler was tried first and did not keep time (2 of about 19 hourly runs started on the first day), so the GitHub workflow is now a manual trigger only.

The run route also answers GET with the same bearer, for schedulers that can only make GET requests (Vercel Cron is one; its hourly schedules need a Pro plan).

## Announcing

Only after steps 1 to 4 and a few clean hours: publish the docs page, add the changelog line, switch the API's docs link back to the docs page, and update this repository's README status and contract table.
