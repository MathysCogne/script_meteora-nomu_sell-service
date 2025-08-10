# Meteora Pool Setup Nomu

## Prerequisites

- [Bun](https://bun.sh/)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli)

```bash
# Devnet + wallet + fonds
solana config set --url https://api.devnet.solana.com
solana-keygen new -o ~/.config/solana/nomu.json
solana airdrop 5 ~/.config/solana/nomu.json

```



## Setup

```bash
pnpm install
```

## Run

```bash
tsx scripts/setup_nomu_and_dlmm.ts
```