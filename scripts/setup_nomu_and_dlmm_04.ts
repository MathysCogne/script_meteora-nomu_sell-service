// scripts/setup_nomu_and_dlmm_strategy.ts
// NOMU + USDC_DEV (devnet) + Meteora DLMM — LFG “Curve by Meteora”, snap au bin, top-up SOL auto

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
const RPC_URL = "https://devnet.helius-rpc.com/?api-key=18dccc6d-d62d-480f-b652-d30e4b641a5e"
const KEYPAIR_PATH =
  process.env.KEYPAIR || path.resolve(os.homedir(), '.config/solana/nomu.json')

// Wallet perso à fund (modifiable)
const PERSONAL_WALLET = new PublicKey('76SuA1VD69doQDYjKqFrSb5Hc1Xj3kZWnrfCQvrPDzEt')

// USDC devnet officiel
const USDC_DEV_MINT = new PublicKey('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr')

const DECIMALS = 6
const TEN = 10n
const POW6 = TEN ** 6n

// supplies (mintés dans l'ATA du payer) — on ne minte que NOMU
const SUPPLY_RAW = 1_000_000_000n * POW6 // 1B NOMU

// montants à ENVOYER au wallet perso (unités entières de token)
const FUND_NOMU = 5_000_000n * POW6 // 5,000,000 NOMU
const FUND_USDC = 100_000n * POW6   // 100,000 USDC_DEV (skip si pas assez de solde)

// ====== DLMM strategy params ======
const START_PRICE = 0.0015        // prix souhaité
const BIN_STEP = 25               // ~0.25% par bin
const FEE_BPS = 25                // fees fixes

// Seed principal (Meteora calcule la structure via curvature)
const RANGE_MULTIPLIER = 10       // range: START → START*x
const CURVATURE_MAIN = 1.2        // >1: bias haut (smooth pump)
const SEED_AMOUNT_MAIN = '100000000' // 100M NOMU (string attendu par le CLI)

// Option: petit “pad” autour du spot pour activer immédiatement (≥ spot)
const ENABLE_SPOT_PAD = true
const PAD_MAX_FACTOR = 1.05       // 105% du spot
const PAD_SEED_AMOUNT = '2000000' // 2M NOMU
const PAD_CURVATURE = 1.0         // flat

// Répertoires meteora-pool-setup (CLI officielle)
const ROOT = process.cwd()
const SETUP_DIR = path.join(ROOT, 'meteora-setup')
const TOOLKIT_DIR = path.join(SETUP_DIR, 'meteora-pool-setup')

// Fichiers de config
const CREATE_CFG = path.join(TOOLKIT_DIR, 'config', 'create_dlmm_pool.nomu_usdcm.json')
const SEED_LFG_MAIN_CFG = path.join(TOOLKIT_DIR, 'config', 'seed_lfg.nomu_usdcm.json')
const SEED_LFG_PAD_CFG = path.join(TOOLKIT_DIR, 'config', 'seed_lfg_pad.nomu_usdcm.json')

// Commandes CLI
const CREATE_POOL_CMD =
  'bun run src/create_pool.ts --config ./config/create_dlmm_pool.nomu_usdcm.json'
const SEED_LFG_CMD =
  'bun run src/seed_liquidity_lfg.ts --config ./config/seed_lfg.nomu_usdcm.json'
const SEED_LFG_PAD_CMD =
  'bun run src/seed_liquidity_lfg.ts --config ./config/seed_lfg_pad.nomu_usdcm.json'

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

// ---- Math DLMM
function ratioFromBinStep(bps: number) {
  return 1 + bps / 10_000
}
function snapPriceToBin(price: number, binStepBps: number, mode: 'down'|'up'|'nearest'='nearest') {
  const r = ratioFromBinStep(binStepBps)
  const id = Math.log(price) / Math.log(r)
  let k = Math.round(id)
  if (mode === 'down') k = Math.floor(id)
  if (mode === 'up') k = Math.ceil(id)
  return { price: Math.pow(r, k), id: k }
}
function nextTick(price: number, binStepBps: number) {
  return price * ratioFromBinStep(binStepBps)
}

// ---- Top-up SOL robuste pour devnet (faucet public)
async function topUpSolForDevnet(conn: Connection, minSOL: number, kp: Keypair) {
  for (let i = 0; i < 6; i++) {
    try {
      const bal = await conn.getBalance(kp.publicKey)
      if (bal >= minSOL * LAMPORTS_PER_SOL) return

      console.log(`Solde bas (${(bal/LAMPORTS_PER_SOL).toFixed(4)} SOL), tentative d'airdrop...`)
      const sig = await conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL)
      await conn.confirmTransaction(sig, 'confirmed')
      console.log('Airdrop réussi, attente confirmation solde...')
      await sleep(5000) // Laisse le temps au solde de se mettre à jour
    } catch (e: any) {
      console.warn(`Airdrop/getBalance a échoué (RPC devnet ?), retry...`)
      // Affiche l'erreur si elle est pertinente, pour éviter le bruit
      if (!e.message?.includes('fetch failed')) console.error(e)
      await sleep(5000)
    }
  }
}
async function ensureFunds(conn: Connection, kp: Keypair, minSOL = 2) {
  if (CLUSTER === 'devnet') await topUpSolForDevnet(conn, minSOL, kp)
  
  // recheck via TON RPC (ex: Helius) pour être sûr côté transactions
  for (let i = 0; i < 10; i++) {
    const bal = await conn.getBalance(kp.publicKey)
    if (bal >= minSOL * LAMPORTS_PER_SOL) return
    await sleep(1500)
  }
  const finalBal = await conn.getBalance(kp.publicKey)
  if (finalBal < minSOL * LAMPORTS_PER_SOL) {
    throw new Error(`Solde insuffisant: ${(finalBal / LAMPORTS_PER_SOL).toFixed(3)} < ${minSOL} SOL. Relance l'airdrop.`)
  }
}

/* ========================= MAIN ========================= */
async function main() {
  console.log('== NOMU + USDC_DEV + Meteora DLMM (Curve by Meteora) ==')
  console.log('RPC:', RPC_URL)
  console.log('Start price (wish):', START_PRICE)

  try { sh('bun -v') } catch { throw new Error('Installe bun puis relance (https://bun.sh).') }

  const connection = new Connection(RPC_URL, 'confirmed')
  const payer = loadKeypair(KEYPAIR_PATH)

  // Assure 2 SOL avant de démarrer (mint/ATA consomment)
  await ensureFunds(connection, payer, 2)

  /* 1) Mints */
  console.log('> Creating NOMU mint…')
  const nomuMint = await createMint(connection, payer, payer.publicKey, null, DECIMALS, undefined, undefined, TOKEN_PROGRAM_ID)
  console.log('NOMU Mint:', nomuMint.toBase58())

  console.log('> Creating ATA & minting NOMU supply…')
  const nomuAta = await getOrCreateAssociatedTokenAccount(connection, payer, nomuMint, payer.publicKey)
  console.log('NOMU ATA:', nomuAta.address.toBase58())
  await mintTo(connection, payer, nomuMint, nomuAta.address, payer, Number(SUPPLY_RAW))
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
    await transfer(connection, payer, nomuAta.address, personalNomuAta.address, payer.publicKey, Number(FUND_NOMU))
    console.log(`Sent ${Number(FUND_NOMU) / Number(POW6)} NOMU to ${PERSONAL_WALLET.toBase58()}`)
  }
  if (FUND_USDC > 0n) {
    const cur = await getTokenAmountRaw(connection, usdcDevAta.address)
    if (cur >= FUND_USDC) {
      await transfer(connection, payer, usdcDevAta.address, personalUsdcAta.address, payer.publicKey, Number(FUND_USDC))
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

  /* 3) Génération des configs — LFG (Meteora choisit la curve via curvature) */
  const activationPoint = Math.floor(Date.now() / 1000) + 30  // ~30s
  const snapped = snapPriceToBin(START_PRICE, BIN_STEP, 'nearest') // spot “canonique”
  const SPOT = snapped.price
  const SPOT_PLUS_1TICK = nextTick(SPOT, BIN_STEP)
  const UPPER_PRICE = START_PRICE * RANGE_MULTIPLIER

  const createCfg = {
    rpcUrl: RPC_URL,
    dryRun: false,
    keypairFilePath: './keypair.json',
    computeUnitPriceMicroLamports: 100000,
    baseMint: nomuMint.toBase58(),
    quoteMint: USDC_DEV_MINT.toBase58(),
    dlmm: {
      binStep: BIN_STEP,
      feeBps: FEE_BPS,
      initialPrice: START_PRICE,
      activationType: 'timestamp',
      activationPoint,
      priceRounding: 'down',
      hasAlphaVault: false,
      creatorPoolOnOffControl: false
    },
  }

  // Seed principal : minPrice >= spot (+1 tick pour être 100% safe), Meteora gère la courbe
  const seedLfgMainCfg = {
    rpcUrl: RPC_URL,
    dryRun: false,
    keypairFilePath: './keypair.json',
    computeUnitPriceMicroLamports: 100000,
    baseMint: nomuMint.toBase58(),
    quoteMint: USDC_DEV_MINT.toBase58(),
    dlmm: {
      binStep: BIN_STEP,
      feeBps: FEE_BPS,
      initialPrice: START_PRICE,
      activationType: 'timestamp',
      activationPoint,
      priceRounding: 'down',
      hasAlphaVault: false
    },
    lfgSeedLiquidity: {
      minPrice: SPOT_PLUS_1TICK,
      maxPrice: UPPER_PRICE,
      seedAmount: SEED_AMOUNT_MAIN,
      curvature: CURVATURE_MAIN,
      basePositionKeypairFilepath: './keypair.json',
      operatorKeypairFilepath: './keypair.json',
      positionOwner: payer.publicKey.toBase58(),
      feeOwner: payer.publicKey.toBase58(),
      lockReleasePoint: 0,
      seedTokenXToPositionOwner: true
    },
  }

  // Pad optionnel : commence au spot (jamais < spot)
  const seedLfgPadCfg = {
    rpcUrl: RPC_URL,
    dryRun: false,
    keypairFilePath: './keypair.json',
    computeUnitPriceMicroLamports: 100000,
    baseMint: nomuMint.toBase58(),
    quoteMint: USDC_DEV_MINT.toBase58(),
    dlmm: {
      binStep: BIN_STEP,
      feeBps: FEE_BPS,
      initialPrice: START_PRICE,
      activationType: 'timestamp',
      activationPoint,
      priceRounding: 'down',
      hasAlphaVault: false
    },
    lfgSeedLiquidity: {
      minPrice: SPOT,
      maxPrice: SPOT * PAD_MAX_FACTOR,
      seedAmount: PAD_SEED_AMOUNT,
      curvature: PAD_CURVATURE,
      basePositionKeypairFilepath: './keypair.json',
      operatorKeypairFilepath: './keypair.json',
      positionOwner: payer.publicKey.toBase58(),
      feeOwner: payer.publicKey.toBase58(),
      lockReleasePoint: 0,
      seedTokenXToPositionOwner: true
    },
  }

  writeJSON(CREATE_CFG, createCfg)
  writeJSON(SEED_LFG_MAIN_CFG, seedLfgMainCfg)
  if (ENABLE_SPOT_PAD) writeJSON(SEED_LFG_PAD_CFG, seedLfgPadCfg)

  console.log(
    `Create + LFG configs written (spot≈${SPOT.toFixed(8)}, spot+1=${SPOT_PLUS_1TICK.toFixed(8)}, range=${START_PRICE}→${UPPER_PRICE}, curvature=${CURVATURE_MAIN}).`
  )

  /* 4) Create + Seed */
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

  // IMPORTANT : s’assurer qu’on a de la marge de SOL pour InitializeBinArray + rent des positions
  await ensureFunds(connection, payer, 2)

  console.log('> Seeding LFG (Curve by Meteora)…')
  try {
    const out = execSync(SEED_LFG_CMD, { cwd: TOOLKIT_DIR, encoding: 'utf-8' })
    process.stdout.write(out)
  } catch (e: any) {
    if (e?.stdout) process.stdout.write(e.stdout)
    if (e?.stderr) process.stderr.write(e.stderr)
    console.warn('seed_liquidity_lfg (main) a échoué.')
  }

  if (ENABLE_SPOT_PAD) {
    // Re-vérifie avant le pad, au cas où
    await ensureFunds(connection, payer, 1.5)

    console.log('> Seeding LFG (spot pad)…')
    try {
      const out = execSync(SEED_LFG_PAD_CMD, { cwd: TOOLKIT_DIR, encoding: 'utf-8' })
      process.stdout.write(out)
    } catch (e: any) {
      if (e?.stdout) process.stdout.write(e.stdout)
      if (e?.stderr) process.stderr.write(e.stderr)
      console.warn('seed_liquidity_lfg (pad) a échoué.')
    }
  }

  /* 5) Résolution adresse de pool (depuis logs) */
  const lb = parsePoolAddrFromLogs(createOut)
  if (lb) {
    console.log('\n============================')
    console.log(' DLMM LBPair:', lb)
    console.log(' UI (devnet): https://devnet.meteora.ag/dlmm/' + lb)
    console.log(' Base mint :', nomuMint.toBase58())
    console.log(' Quote mint:', USDC_DEV_MINT.toBase58(), '(USDC_DEV)')
    console.log(' Start P  :', START_PRICE, '→ Upper P:', UPPER_PRICE)
    console.log(' binStep  :', BIN_STEP, ' | feeBps:', FEE_BPS, ' | curvature:', CURVATURE_MAIN)
    console.log(' Spot     :', SPOT, ' | Spot+1:', SPOT_PLUS_1TICK)
    console.log(' SpotPad  :', ENABLE_SPOT_PAD ? `spot→${(PAD_MAX_FACTOR*100).toFixed(0)}%` : 'off')
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