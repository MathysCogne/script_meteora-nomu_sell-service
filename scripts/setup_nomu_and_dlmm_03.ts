// scripts/setup_nomu_and_dlmm_single.ts
// NOMU + USDC_DEV (devnet) + DLMM Meteora — single-bin @ 0.0015, rounding=down

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
} from '@solana/spl-token'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'

/* ======================== PARAMS ======================== */
const CLUSTER: 'devnet' | 'mainnet-beta' = 'devnet'
const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl(CLUSTER)
const KEYPAIR_PATH =
  process.env.KEYPAIR || path.resolve(os.homedir(), '.config/solana/nomu.json')

// Wallet perso à fund (modifiable)
const PERSONAL_WALLET = new PublicKey('76SuA1VD69doQDYjKqFrSb5Hc1Xj3kZWnrfCQvrPDzEt')

// USDC devnet "officiel" (stable 1$ côté dev)
const USDC_DEV_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr')

const DECIMALS = 6
const TEN = 10n
const POW6 = TEN ** 6n

// supplies (mintés dans l'ATA du payer) — on ne minte que NOMU
const SUPPLY_RAW = 1_000_000_000n * POW6 // 1B NOMU

// montants à ENVOYER au wallet perso (unités entières de token, pas lamports)
// NB: Pour USDC_DEV, il faut EN AVOIR sur le payer (via faucet) sinon le transfert sera skip.
const FUND_NOMU = 5_000_000n * POW6 // 5,000,000 NOMU
const FUND_USDC = 100_000n * POW6   // 100,000 USDC_DEV (skip si pas assez de solde)

// DLMM params
const START_PRICE = 0.0015 // Single bin @ 0.0015
const BIN_STEP = 25
const FEE_BPS = 25
const SEED_AMOUNT_NOMU = '100000000' // 100M NOMU (string attendu par leur script)

// Répertoires meteora-pool-setup (CLI officielle)
const ROOT = process.cwd()
const SETUP_DIR = path.join(ROOT, 'meteora-setup')
const TOOLKIT_DIR = path.join(SETUP_DIR, 'meteora-pool-setup')

// Fichiers de config qu’on va générer
const CREATE_CFG = path.join(TOOLKIT_DIR, 'config', 'create_dlmm_pool.nomu_usdcm.json')
const SEED_SINGLE_CFG = path.join(TOOLKIT_DIR, 'config', 'seed_single.nomu_usdcm.json')

// Commandes CLI
const CREATE_POOL_CMD =
  'bun run src/create_pool.ts --config ./config/create_dlmm_pool.nomu_usdcm.json'
const SEED_SINGLE_BIN_CMD =
  'bun run src/seed_liquidity_single_bin.ts --config ./config/seed_single.nomu_usdcm.json'

/* ====================== HELPERS ====================== */
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))
const sh = (cmd: string, cwd?: string) => {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd })
}
function loadKeypair(file: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(file, 'utf-8'))),
  )
}
function writeJSON(file: string, data: any) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}
async function ensureSol(conn: Connection, kp: Keypair) {
  const bal = await conn.getBalance(kp.publicKey)
  if (CLUSTER === 'devnet' && bal < 0.5 * LAMPORTS_PER_SOL) {
    try { await conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL) } catch {}
    await sleep(2500)
  }
}
function asNumber(n: bigint): number {
  return Number(n)
}
async function getTokenAmountRaw(conn: Connection, ata: PublicKey): Promise<bigint> {
  try {
    const bal = await conn.getTokenAccountBalance(ata)
    return BigInt(bal.value.amount)
  } catch { return 0n }
}
function parsePoolAddrFromLogs(text: string): string | null {
  if (!text) return null
  const m = text.match(/Pool address:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/)
  return m?.[1] || null
}

/* ========================= MAIN ========================= */
async function main() {
  console.log('== NOMU + USDC_DEV + Meteora DLMM (single-bin) ==')
  console.log('RPC:', RPC_URL)
  console.log('Start price:', START_PRICE)

  try { sh('bun -v') } catch { throw new Error('Installe bun puis relance (https://bun.sh).') }

  const connection = new Connection(RPC_URL, 'confirmed')
  const payer = loadKeypair(KEYPAIR_PATH)
  await ensureSol(connection, payer)

  /* 1) Mints */
  console.log('> Creating NOMU mint…')
  const nomuMint = await createMint(connection, payer, payer.publicKey, null, DECIMALS, undefined, undefined, TOKEN_PROGRAM_ID)
  console.log('NOMU Mint:', nomuMint.toBase58())

  console.log('> Creating ATA & minting NOMU supply…')
  const nomuAta = await getOrCreateAssociatedTokenAccount(connection, payer, nomuMint, payer.publicKey)
  console.log('NOMU ATA:', nomuAta.address.toBase58())
  await mintTo(connection, payer, nomuMint, nomuAta.address, payer, asNumber(SUPPLY_RAW))
  console.log('NOMU total supply minted.')

  // USDC_DEV : pas de mint, on utilise le mint devnet existant
  console.log('> Preparing USDC_DEV ATA (no mint on devnet)…')
  const usdcDevAta = await getOrCreateAssociatedTokenAccount(connection, payer, USDC_DEV_MINT, payer.publicKey)
  console.log('USDC_DEV ATA (payer):', usdcDevAta.address.toBase58())

  /* 1.b) FUND ton wallet perso */
  console.log('> Funding personal wallet…')
  const personalNomuAta = await getOrCreateAssociatedTokenAccount(connection, payer, nomuMint, PERSONAL_WALLET)
  const personalUsdcAta = await getOrCreateAssociatedTokenAccount(connection, payer, USDC_DEV_MINT, PERSONAL_WALLET)

  if (FUND_NOMU > 0n) {
    await transfer(connection, payer, nomuAta.address, personalNomuAta.address, payer.publicKey, asNumber(FUND_NOMU))
    console.log(`Sent ${Number(FUND_NOMU) / Number(POW6)} NOMU to ${PERSONAL_WALLET.toBase58()}`)
  }

  if (FUND_USDC > 0n) {
    const cur = await getTokenAmountRaw(connection, usdcDevAta.address)
    if (cur >= FUND_USDC) {
      await transfer(connection, payer, usdcDevAta.address, personalUsdcAta.address, payer.publicKey, asNumber(FUND_USDC))
      console.log(`Sent ${Number(FUND_USDC) / Number(POW6)} USDC_DEV to ${PERSONAL_WALLET.toBase58()}`)
    } else {
      console.warn(`Skip USDC_DEV funding: balance=${Number(cur)/1e6} < needed=${Number(FUND_USDC)/1e6}. Approvisionne via faucet si besoin.`)
    }
  }

  /* 2) meteora-pool-setup */
  if (!fs.existsSync(SETUP_DIR)) fs.mkdirSync(SETUP_DIR, { recursive: true })
  if (!fs.existsSync(TOOLKIT_DIR)) {
    console.log('> Cloning meteora-pool-setup …')
    sh('git clone https://github.com/MeteoraAg/meteora-pool-setup', SETUP_DIR)
  } else {
    console.log('> Using existing meteora-pool-setup')
  }
  try { sh('bun install', TOOLKIT_DIR) } catch {}

  // keypair pour leurs scripts
  fs.writeFileSync(path.join(TOOLKIT_DIR, 'keypair.json'), JSON.stringify(Array.from(payer.secretKey)))

  /* 3) Génération des configs — single bin @ 0.0015, rounding=down */
  const activationPoint = Math.floor(Date.now() / 1000) + 30  // activation ~30s

  const createCfg = {
    rpcUrl: RPC_URL,
    dryRun: false,
    keypairFilePath: './keypair.json',
    computeUnitPriceMicroLamports: 100000,
    baseMint: nomuMint.toBase58(),
    quoteMint: USDC_DEV_MINT.toBase58(),    // ← USDC devnet
    dlmm: {
      binStep: BIN_STEP,
      feeBps: FEE_BPS,
      initialPrice: START_PRICE,
      activationType: 'timestamp',
      activationPoint,
      priceRounding: 'down',
      hasAlphaVault: false,
      creatorPoolOnOffControl: false,
    },
  }

  const seedSingleCfg = {
    rpcUrl: RPC_URL,
    dryRun: false,
    keypairFilePath: './keypair.json',
    computeUnitPriceMicroLamports: 100000,
    baseMint: nomuMint.toBase58(),
    quoteMint: USDC_DEV_MINT.toBase58(),    // ← USDC devnet
    dlmm: {
      binStep: BIN_STEP,
      feeBps: FEE_BPS,
      initialPrice: START_PRICE,
      activationType: 'timestamp',
      activationPoint,
      priceRounding: 'down',                 // évite les décalages “canonical”
      hasAlphaVault: false,
    },
    singleBinSeedLiquidity: {
      price: START_PRICE,
      priceRounding: 'down',
      seedAmount: SEED_AMOUNT_NOMU,         // 100M NOMU
      basePositionKeypairFilepath: './keypair.json',
      operatorKeypairFilepath: './keypair.json',
      positionOwner: payer.publicKey.toBase58(),
      feeOwner: payer.publicKey.toBase58(),
      lockReleasePoint: 0,
      seedTokenXToPositionOwner: true,
    },
  }

  writeJSON(CREATE_CFG, createCfg)
  writeJSON(SEED_SINGLE_CFG, seedSingleCfg)
  console.log('Create + single-bin seed config written (price=0.0015, rounding=down).')

  /* 4) Create + Seed (single bin) */
  console.log('> Creating DLMM pool…')
  let createOut = ''
  try {
    createOut = execSync(CREATE_POOL_CMD, { cwd: TOOLKIT_DIR, encoding: 'utf8' })
    process.stdout.write(createOut)
  } catch (e: any) {
    if (e?.stdout) process.stdout.write(e.stdout)
    if (e?.stderr) process.stderr.write(e.stderr)
    console.warn('create_pool a échoué (voir logs).')
  }
  
  console.log('> Seeding single-bin @ 0.0015 (rounding=down)…')
  try {
    const out = execSync(SEED_SINGLE_BIN_CMD, { cwd: TOOLKIT_DIR, encoding: 'utf-8' })
    process.stdout.write(out)
  } catch (e: any) {
    if (e?.stdout) process.stdout.write(e.stdout)
    if (e?.stderr) process.stderr.write(e.stderr)
    console.warn('seed_liquidity (single) a échoué.')
  }

  /* 5) Résolution adresse de pool (depuis logs) */
  const lb = parsePoolAddrFromLogs(createOut)
  if (lb) {
    console.log('\n============================')
    console.log(' DLMM LBPair:', lb)
    console.log(' UI (devnet): https://devnet.meteora.ag/dlmm/' + lb)
    console.log(' Base mint :', nomuMint.toBase58())
    console.log(' Quote mint:', USDC_DEV_MINT.toBase58(), '(USDC_DEV)')
    console.log(' Start P  :', START_PRICE)
    console.log('============================\n')
  } else {
    console.warn('\nLBPair introuvable pour le moment.')
    console.log('Base mint :', nomuMint.toBase58())
    console.log('Quote mint:', USDC_DEV_MINT.toBase58(), '(USDC_DEV)\n')
  }

  console.log('✅ Done.')
}

main().catch((e) => {
  console.error('\nFatal error:\n', e)
  process.exit(1)
})
