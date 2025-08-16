# Meteora DLMM Liquidity Pool Setup

## 1. Prerequisites


- [Node.js](https://nodejs.org/) (v18 or higher)
- [pnpm](https://pnpm.io/installation)
- [Bun](https://bun.sh/docs/installation)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)

## 2. Wallet Creation if you want 

```bash
# 1. Set the Solana CLI to use the devnet
solana config set --url https://api.devnet.solana.com

# 2. Generate a new wallet and save the keypair
rm -rf /home/mathys/.config/solana/nomu.json
solana-keygen new -o ~/.config/solana/nomu.json

# 3. Request test SOL (airdrop) to cover transaction fees
solana airdrop 5 ~/.config/solana/nomu.json
```



### Token Configuration in spl-token-creator

When you run `pnpm start` 

- **Decimals**: `6`
- **Total supply**: `1000000000`
- **Token image URL**: https://bafybeih42hpmi5fezoxei6sapou7abzldsfmag6liqv45rjry66svesvxu.ipfs.nftstorage.link/12032.png
- **Secret key**: You will need to provide the secret key for your `nomu.json` wallet. To get it, run the following command in another terminal:
    ```bash
    node -e "const fs=require('fs');const bs58=require('bs58');const k=Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[1],'utf8')));console.log(bs58.encode(k));" $HOME/.config/solana/nomu.json
    ```


## 4. Pool Creation Script Setup

This script will automate the creation and seeding of the DLMM pool on Meteora.

```bash
cd meteora-invent
pnpm install

# for timestamp in seconds
node -e 'console.log(Math.floor(Date.now()/1000)+120)' 

pnpm studio dlmm-create-pool --config ./studio/config/dlmm_config.jsonc
pnpm studio dlmm-seed-liquidity-lfg --config ./studio/config/dlmm_config.jsonc
```


### Utils 

```bash
solana-keygen pubkey ./studio/keypair.json


node -e "const fs=require('fs');const bs58=require('bs58');const k=Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[1],'utf8')));console.log(bs58.encode(k));" /home/mathys/Documents/nomu/dwa/meteora-invent/studio/keypair.json

# generate keypair and inject .env
pnpm studio generate-keypair --network devnet

# start test validator  for localnet
pnpm studio start-test-validator
```