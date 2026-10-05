# Funding a mainnet anchoring wallet on GOAT Network

Nothing here has been done. This is a plan for later, written for someone who is not a developer. Checked against GOAT's documentation and public chain data on 4 and 5 October 2026. Where a fact comes from GOAT's own documentation it says so; where it was only observed, it says that instead. Things change: read the bridge page itself before sending anything.

## The short version

- GOAT mainnet's gas is paid in BTC. Only BTC bridged from the Bitcoin network can pay gas there (GOAT docs, quick start).
- One anchoring transaction uses about 72,000 gas. At the gas price read from mainnet on 2026-10-05 (130,007 wei) that is about 0.0000000094 BTC per transaction.
- One transaction an hour for a year: about **0.000082 BTC**. At USD 100,000 per BTC that would be about USD 8. The figure scales with the gas price, which can change.
- A first deposit of **0.0005 BTC** is comfortably above the bridge's stated minimum and would cover about six years at that price. The real cost of setting up is the Bitcoin network fee and the exchange's withdrawal fee, not the gas.
- Keep the balance small. GOAT calls its mainnet "Alpha Mainnet".

## Yearly cost

| | Value | Source |
|---|---|---|
| Gas per `anchor()` | 71,804 used by the one testnet3 batch so far (the same figure as on a local chain); 72,672 estimated | transaction `0xdd2316…0492` on testnet3; `eth_estimateGas` on 2026-10-05 |
| Mainnet gas price | 130,007 wei | `eth_gasPrice` on `rpc.goat.network`, 2026-10-05 |
| Minimum priority fee | 130,000 wei | GOAT docs, fees page |
| Minimum base fee | 7 wei | GOAT docs, fees page |
| Fee per transaction | 72,672 × 130,007 wei ≈ 0.0000000094 BTC | arithmetic |
| Per year at one an hour (8,760) | ≈ 0.000083 BTC | arithmetic |
| If the gas price were 10 times higher | ≈ 0.00083 BTC a year | arithmetic |

The minimum priority fee is a node setting. GOAT's changelog shows it has been changed before, so it can change again.

## Step by step

### 1. Make a new wallet, for mainnet only

Do not reuse the testnet wallet or any wallet that holds anything else.

```
cd tanilo-anchor
npm run new-wallet -- --mainnet
```

It prints the address and puts the private key on the clipboard for 60 seconds. Paste the key into your password manager straight away, as "GOAT MAINNET anchor key". The key is not printed or saved anywhere by the script.

To see the wallet in MetaMask, import the key there and add the network (GOAT docs, quick start):

| Field | Value |
|---|---|
| Network name | GOAT Network |
| RPC URL | https://rpc.goat.network |
| Chain ID | 2345 |
| Currency symbol | BTC |
| Block explorer | https://explorer.goat.network |

### 2. Get BTC to it through the official bridge

The route GOAT documents for people who hold BTC on an exchange or in a Bitcoin wallet is the bridge's **Receive** tab.

1. Type `https://bridge.goat.network` into the address bar yourself. Do not follow a search result or an advert.
2. Open the **Receive** tab and connect MetaMask. Check that the connected account is the new mainnet wallet.
3. The page shows a Bitcoin deposit address made for that wallet.
4. From your exchange or Bitcoin wallet, withdraw BTC **on the Bitcoin network** to that address. GOAT's docs say to send at least **0.0002 BTC** "to avoid the transfer being treated as dust"; GOAT's user guide says smaller deposits may be lost. Send 0.0005 BTC.
5. Wait. The bridge contract requires six Bitcoin confirmations. In a small sample of recent deposits seen on the public explorer, the BTC arrived on GOAT about one to one and a half hours after the Bitcoin transaction.
6. Check the wallet's balance at `https://explorer.goat.network`.

If you hold only dollars on an exchange: buy a small amount of BTC there first, then follow the same steps.

### 3. Before the first real use

- Send nothing else to this wallet. It needs gas only.
- Deploying the contract on mainnet (about 291,000 gas, once) and switching the service to mainnet are separate steps, each needing an explicit decision. The code refuses mainnet unless `ALLOW_MAINNET=1` is set.

## Other routes, and why not

| Route | Finding |
|---|---|
| A refuel service (gas.zip) | GOAT's user guide mentions it. Third party; its reserve for GOAT looked small when checked. Fees and timing for GOAT were not confirmed. |
| Stargate | LayerZero has announced that support for GOAT ends on 23 October 2026. It carried stablecoins and WETH, not gas BTC. Do not use. |
| A direct exchange withdrawal to GOAT | None found. |
| A mainnet faucet | None. The faucet is for testnet only. |

## Risks

- **Alpha.** GOAT's documentation labels mainnet "Alpha Mainnet". No audit is listed on its security page.
- **The bridge holds the BTC.** GOAT documents a BitVM-based bridge design, but the user guide for it covers testnet. Who controls the Bitcoin-side keys of the mainnet bridge today is not stated in the current docs. Bridge only what the wallet needs.
- **Small deposits.** Below the minimum, a deposit may be lost.
- **Fees.** The docs state a 0.1% bridge service fee plus the Bitcoin network fee. Recent deposits seen on-chain carried no deposit fee and withdrawals carried 0.1%. The bridge page is the final word.
- **Getting BTC back out.** Withdrawals to Bitcoin exist; the docs give no mainnet timings. In a small sample seen on the explorer they were paid within a few hours. Treat what is bridged in as spent on gas.
- **Wrong network or address.** A withdrawal sent on any network other than Bitcoin, or to an address typed by hand, can be lost. Copy the address from the bridge page and check the first and last characters.
- **Fake bridge sites.** Type the address yourself.
- **Public RPC.** GOAT says its public RPC is rate-limited and that production systems should use a dedicated provider. One call an hour is far below any plausible limit; a second RPC as a fallback is still sensible.
- **The key.** Whoever has the key can spend the wallet's balance and anchor roots of their own. They cannot change a root that is already anchored or its time.
- **Chain halts or upgrades.** If the chain is down at the hour, that batch waits; nothing is lost. GOAT has had mandatory node upgrades. No public report of an outage was found, which is not proof that there has been none.

## Questions to settle on the bridge page before sending

1. What minimum and what fee does the Receive tab show today?
2. What kind of address does it show (`bc1q…` or `bc1p…`), and does your exchange accept it?
3. Is the address for one use, and does it expire?
4. Is it bound to the new mainnet wallet's address?
5. What wait does the page state?
6. Where do you ask for help if a deposit does not arrive?

## Sources

- GOAT docs: https://docs.goat.network/docs/users/bridge , https://docs.goat.network/docs/users/quick-start , https://docs.goat.network/docs/build/networks-rpc , https://docs.goat.network/docs/build/app-development/fees , https://docs.goat.network/docs/build/app-development/statuses , https://docs.goat.network/docs/network/security
- GOAT user guide: https://www.goat.network/blog/the-complete-users-guide-to-goat-network
- LayerZero support update: https://layerzero.network/blog/support-update-july-24-2026
- Chain data: https://explorer.goat.network , `eth_gasPrice` and `eth_maxPriorityFeePerGas` on https://rpc.goat.network
