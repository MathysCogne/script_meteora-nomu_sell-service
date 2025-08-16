# Meteora Invent

A toolkit consisting of everything you need to invent innovative token launches on Meteora.

## Metsumi

Meet Metsumi, your personal launch assistant engineered to help you launch anything and do any
action on Meteora programs with just a few configurations and CLI commands.

![Metsumi](./assets/mascot/metsumi-banner.png)

## 📋 Table of Contents

- [🏗️ Structure](#%EF%B8%8F-structure)
- [🚀 Getting Started](#-getting-started)
- [📦 Workspaces](#-workspaces)
  - [Studio](#studio-meteora-inventstudio)
  - [Scaffolds](#scaffolds)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 10.0.0

### Clone the repository

```bash
git clone https://github.com/MeteoraAg/meteora-invent.git
```

### Installation

```bash
# Install pnpm if you haven't already
npm install -g pnpm

# Install all dependencies
pnpm install
```

## 📦 Workspaces

---

### Studio (`@meteora-invent/studio`)

---

The studio workspace contains all the scripts for interacting with Meteora's programs.

#### Getting Started

1. Copy the `.env.example` file to `.env` and configure the environment variables.

```bash
cp studio/.env.example studio/.env
```

2. Optional: Start a Local Test Validator

_You can also run the studio scripts on localnet - http://localhost:8899 with the following command_

```bash
pnpm studio start-test-validator
```

3. Generate a keypair from your private key:

```bash
# For devnet (airdrops 5 SOL)
pnpm studio generate-keypair --network devnet

# For localnet (airdrops 5 SOL)
# Ensure that you have already started the local validator with pnpm start-test-validator
pnpm studio generate-keypair --network localnet
```

4. Configure the config files in the `studio/config` directory.

- Configure [DLMM](./studio/config/dlmm_config.jsonc)
- Configure [DAMM v2](./studio/config/damm_v2_config.jsonc)
- Configure [DAMM v1](./studio/config/damm_v1_config.jsonc)
- Configure [DBC](./studio/config/dbc_config.jsonc)
- Configure [Alpha Vault](./studio/config/alpha_vault_config.jsonc)

**Note:** You can use the provided example configurations as a starting point. Make sure to replace
the placeholders with your actual values.

---

#### DLMM Scripts

**Create a Customizable Permissionless DLMM Pool**

```bash
pnpm studio dlmm-create-pool --config ./studio/config/dlmm_config.jsonc
```

**Seed Liquidity (LFG)**

```bash
pnpm studio dlmm-seed-liquidity-lfg --config ./studio/config/dlmm_config.jsonc
```

**Seed Liquidity (Single Bin)**

```bash
pnpm studio dlmm-seed-liquidity-single-bin --config ./studio/config/dlmm_config.jsonc
```

**Set DLMM Pool Status**

```bash
pnpm studio dlmm-set-pool-status --config ./studio/config/dlmm_config.jsonc
```

---

#### DAMM v2 Scripts

**Create a Balanced Constant Product Pool**

```bash
pnpm studio damm-v2-create-balanced-pool --config ./studio/config/damm_v2_config.jsonc
```

**Create a One-Sided Pool**

```bash
pnpm studio damm-v2-create-one-sided-pool --config ./studio/config/damm_v2_config.jsonc
```

---

#### DAMM v1 Scripts

**Create a Constant Product Pool**

```bash
pnpm studio damm-v1-create-pool --config ./studio/config/damm_v1_config.jsonc
```

**Lock Liquidity**

```bash
pnpm studio damm-v1-lock-liquidity --config ./studio/config/damm_v1_config.jsonc
```

**Create a Stake2Earn Farm**

```bash
pnpm studio damm-v1-create-stake2earn-farm --config ./studio/config/damm_v1_config.jsonc
```

**Lock Liquidity (Stake2Earn)**

```bash
pnpm studio damm-v1-lock-liquidity-stake2earn --config ./studio/config/damm_v1_config.jsonc
```

---

#### DBC Scripts

**Create a DBC Config**

```bash
pnpm studio dbc-create-config --config ./studio/config/dbc_config.jsonc
```

**Create a DBC Pool**

```bash
pnpm studio dbc-create-pool --config ./studio/config/dbc_config.jsonc
```

**Claim Trading Fees**

```bash
pnpm studio dbc-claim-trading-fee --config ./studio/config/dbc_config.jsonc
```

**Migrate to DAMM v1**

```bash
pnpm studio dbc-migrate-to-damm-v1 --config ./studio/config/dbc_config.jsonc
```

**Migrate to DAMM v2**

```bash
pnpm studio dbc-migrate-to-damm-v2 --config ./studio/config/dbc_config.jsonc
```

**Swap (Buy/Sell)**

```bash
pnpm studio dbc-swap --config ./studio/config/dbc_config.jsonc
```

---

#### Alpha Vault Scripts

**Create an Alpha Vault**

```bash
pnpm studio alpha-vault-create --config ./studio/config/alpha_vault_config.jsonc
```

---

### Scaffolds

---

#### Fun Launch (`@meteora-invent/scaffold-fun-launch`)

A Next.js application template for creating a launchpad.

#### Getting Started

Copy the `.env.example` file to `.env` and configure the environment variables.

```bash
cp scaffolds/fun-launch/.env.example scaffolds/fun-launch/.env
```

#### Install Dependencies

```bash
pnpm install
```

#### Running the Scaffold

```bash
# Run the fun-launch scaffold in development
pnpm --filter @meteora-invent/scaffold/fun-launch dev

# Build the fun-launch scaffold
pnpm --filter @meteora-invent/scaffold/fun-launch build
```

## 🏗️ Structure

```
meteora-invent/
├── packages/          # Shared packages
│   └── config/
│       ├── eslint/
│       ├── prettier/
│       └── typescript/
├── scaffolds/         # Scaffolds - production-ready frontend application templates
│   └── fun-launch/
└── studio/            # Studio - a collection of scripts for you to innovate and create
    ├── config
    │   ├── damm_v1_config.jsonc
    │   ├── damm_v2_config.jsonc
    │   ├── dbc_config.jsonc
    │   └── dlmm_config.jsonc
    ├── data
    │   ├── kv_proof.json
    │   └── whitelist_wallet.csv
    ├── LLM.txt
    ├── package.json
    ├── README.md
    ├── src
    │   ├── helpers
    │   │   ├── accounts.ts
    │   │   ├── cli.ts
    │   │   ├── common.ts
    │   │   ├── config.ts
    │   │   ├── index.ts
    │   │   ├── token.ts
    │   │   ├── transaction.ts
    │   │   ├── utils.ts
    │   │   └── validation.ts
    │   ├── lib
    │   │   ├── alpha_vault
    │   │   │   ├── index.ts
    │   │   │   ├── merkle_tree
    │   │   │   │   ├── balance_tree.ts
    │   │   │   │   ├── index.ts
    │   │   │   │   └── merkle_tree.ts
    │   │   │   └── utils.ts
    │   │   ├── damm_v1
    │   │   │   ├── index.ts
    │   │   │   └── stake2earn.ts
    │   │   ├── damm_v2
    │   │   │   └── index.ts
    │   │   ├── dbc
    │   │   │   └── index.ts
    │   │   └── dlmm
    │   │       └── index.ts
    │   ├── scripts
    │   │   ├── alpha_vault
    │   │   │   └── create_alpha_vault.ts
    │   │   ├── damm_v1
    │   │   │   ├── create_pool.ts
    │   │   │   ├── create_stake2earn_farm.ts
    │   │   │   ├── lock_liquidity_stake2earn.ts
    │   │   │   └── lock_liquidity.ts
    │   │   ├── damm_v2
    │   │   │   ├── create_balanced_pool.ts
    │   │   │   └── create_one_sided_pool.ts
    │   │   ├── dbc
    │   │   │   ├── claim_trading_fee.ts
    │   │   │   ├── create_config.ts
    │   │   │   ├── create_pool.ts
    │   │   │   ├── migrate_damm_v1.ts
    │   │   │   ├── migrate_damm_v2.ts
    │   │   │   └── swap.ts
    │   │   ├── dlmm
    │   │   │   ├── create_pool.ts
    │   │   │   ├── seed_liquidity_lfg.ts
    │   │   │   ├── seed_liquidity_single_bin.ts
    │   │   │   └── set_pool_status.ts
    │   │   └── settings
    │   │       └── generate_keypair.ts
    │   ├── tests
    │   │   ├── artifacts
    │   │   │   ├── accounts
    │   │   │   │   └── 3ifhD4Ywaa8aBZAaQSqYgN4Q1kaFArioLU8uumJMaqkE.json
    │   │   │   ├── alpha_vault.so
    │   │   │   ├── cp_amm.so
    │   │   │   ├── dynamic_amm.so
    │   │   │   ├── dynamic_bonding_curve.so
    │   │   │   ├── dynamic_fee_sharing.so
    │   │   │   ├── dynamic_vault.so
    │   │   │   ├── lb_clmm.so
    │   │   │   ├── locker.so
    │   │   │   └── metaplex.so
    │   │   └── keys
    │   │       └── localnet
    │   │           └── admin-bossj3JvwiNK7pvjr149DqdtJxf2gdygbcmEPTkb2F1.json
    │   └── utils
    │       ├── constants.ts
    │       └── types.ts
```

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run `pnpm format` and `pnpm lint`
4. Submit a pull request

## 📄 License

ISC
