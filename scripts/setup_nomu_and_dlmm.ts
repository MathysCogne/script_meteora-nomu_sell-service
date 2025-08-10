// tsx scripts/setup_nomu_and_dlmm.ts
// NOMU + USDC_MOCK + DLMM Meteora (devnet) — activation 30s + fund wallet perso

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
import DLMM from '@meteora-ag/dlmm'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'

/* ======================== PARAMS ======================== */
const CLUSTER: 'devnet' | 'mainnet-beta' = 'devnet'
const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl(CLUSTER)
const KEYPAIR_PATH =
  process.env.KEYPAIR || path.resolve(os.homedir(), '.config/solana/nomu.json')

// ton wallet perso à fund
const PERSONAL_WALLET = new PublicKey('76SuA1VD69doQDYjKqFrSb5Hc1Xj3kZWnrfCQvrPDzEt')

const DECIMALS = 6
const TEN = 10n
const POW6 = TEN ** 6n

// supplies (mintés dans l'ATA du payer)
const SUPPLY_RAW = 1_000_000_000n * POW6       // 1B NOMU
const USDC_SUPPLY_RAW = 1_000_000_000n * POW6  // 1B USDC_MOCK

// montants à ENVOYER à ton wallet perso (en unités "entières" de token, pas lamports)
const FUND_NOMU = 5_000_000n * POW6   // 5,000,000 NOMU
const FUND_USDC = 100_000n * POW6     // 100,000 USDC_MOCK

const INITIAL_PRICE = 0.0015 // 1 NOMU = 0.0015 USDC
const BIN_STEP = 25
const FEE_BPS = 25
const SEED_AMOUNT_NOMU = '100000000' // 100M NOMU (format texte attendu par script meteora)

const ROOT = process.cwd()
const SETUP_DIR = path.join(ROOT, 'meteora-setup')
const TOOLKIT_DIR = path.join(SETUP_DIR, 'meteora-pool-setup')

// configs isolées
const CREATE_CFG = path.join(TOOLKIT_DIR, 'config', 'create_dlmm_pool.nomu_usdcm.json')
const SEED_CFG = path.join(TOOLKIT_DIR, 'config', 'seed_liquidity_single_bin.nomu_usdcm.json')

const CREATE_POOL_CMD =
  'bun run src/create_pool.ts --config ./config/create_dlmm_pool.nomu_usdcm.json'
const SEED_SINGLE_BIN_CMD =
  'bun run src/seed_liquidity_single_bin.ts --config ./config/seed_liquidity_single_bin.nomu_usdcm.json'

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
  // OK ici: <= Number.MAX_SAFE_INTEGER (1e15 < 2^53)
  return Number(n)
}

function parsePoolAddrFromLogs(text: string): string | null {
  if (!text) return null
  const m = text.match(/Pool address:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/)
  return m?.[1] || null
}

async function findLbPair(
  conn: Connection,
  a: PublicKey,
  b: PublicKey,
): Promise<string | null> {
  const anyDLMM: any = DLMM as any
  const all = (await anyDLMM.getLbPairs(conn, { cluster: CLUSTER })) as any[]
  const A = a.toBase58()
  const B = b.toBase58()
  const b58 = (x: any) => {
    try { return new PublicKey(x).toBase58() } catch { return '' }
  }
  const match = all.find((p) => {
    const x = b58(p?.tokenXMint ?? p?.tokenX?.mint ?? p?.lbPair?.tokenXMint)
    const y = b58(p?.tokenYMint ?? p?.tokenY?.mint ?? p?.lbPair?.tokenYMint)
    return x && y && ((x === A && y === B) || (x === B && y === A))
  })
  const addr = match?.lbPair ?? match?.address ?? match?.publicKey
  return addr ? new PublicKey(addr).toBase58() : null
}

/* ========================= MAIN ========================= */
async function main() {
  console.log('== NOMU + USDC_MOCK + Meteora DLMM (bun) ==')
  console.log('RPC:', RPC_URL)

  try { sh('bun -v') } catch { throw new Error('Installe bun puis relance (https://bun.sh).') }

  const connection = new Connection(RPC_URL, 'confirmed')
  const payer = loadKeypair(KEYPAIR_PATH)
  await ensureSol(connection, payer)

  /* 1) Mints (Token Program classique) */
  console.log('> Creating NOMU mint…')
  const nomuMint = await createMint(connection, payer, payer.publicKey, null, DECIMALS, undefined, undefined, TOKEN_PROGRAM_ID)
  console.log('NOMU Mint:', nomuMint.toBase58())

  console.log('> Creating ATA & minting NOMU supply…')
  const nomuAta = await getOrCreateAssociatedTokenAccount(connection, payer, nomuMint, payer.publicKey)
  console.log('NOMU ATA:', nomuAta.address.toBase58())
  await mintTo(connection, payer, nomuMint, nomuAta.address, payer, asNumber(SUPPLY_RAW))
  console.log('NOMU total supply minted.')

  console.log('> Creating USDC_MOCK mint…')
  const usdcMockMint = await createMint(connection, payer, payer.publicKey, null, DECIMALS, undefined, undefined, TOKEN_PROGRAM_ID)
  console.log('USDC_MOCK Mint:', usdcMockMint.toBase58())

  console.log('> Creating ATA & minting USDC_MOCK supply…')
  const usdcAta = await getOrCreateAssociatedTokenAccount(connection, payer, usdcMockMint, payer.publicKey)
  console.log('USDC_MOCK ATA:', usdcAta.address.toBase58())
  await mintTo(connection, payer, usdcMockMint, usdcAta.address, payer, asNumber(USDC_SUPPLY_RAW))
  console.log('USDC_MOCK total supply minted.')

  /* 1.b) FUND ton wallet perso */
  console.log('> Funding personal wallet with NOMU + USDC_MOCK…')
  const personalNomuAta = await getOrCreateAssociatedTokenAccount(connection, payer, nomuMint, PERSONAL_WALLET)
  const personalUsdcAta = await getOrCreateAssociatedTokenAccount(connection, payer, usdcMockMint, PERSONAL_WALLET)

  if (FUND_NOMU > 0n) {
    await transfer(connection, payer, nomuAta.address, personalNomuAta.address, payer.publicKey, asNumber(FUND_NOMU))
    console.log(`Sent ${Number(FUND_NOMU) / Number(POW6)} NOMU to ${PERSONAL_WALLET.toBase58()}`)
  }
  if (FUND_USDC > 0n) {
    await transfer(connection, payer, usdcAta.address, personalUsdcAta.address, payer.publicKey, asNumber(FUND_USDC))
    console.log(`Sent ${Number(FUND_USDC) / Number(POW6)} USDC_MOCK to ${PERSONAL_WALLET.toBase58()}`)
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

  /* 3) Génération des configs (activation à 30 sec) */
  const activationPoint = Math.floor(Date.now() / 1000) + 30  // ← ⏱️ 30s

  const createCfg = {
    rpcUrl: RPC_URL,
    dryRun: false,
    keypairFilePath: './keypair.json',
    computeUnitPriceMicroLamports: 100000,
    baseMint: nomuMint.toBase58(),
    quoteMint: usdcMockMint.toBase58(), // pas de quoteSymbol
    dlmm: {
      binStep: BIN_STEP,
      feeBps: FEE_BPS,
      initialPrice: INITIAL_PRICE,
      activationType: 'timestamp',
      activationPoint,
      priceRounding: 'down',
      hasAlphaVault: false,
      creatorPoolOnOffControl: false,
    },
  }
  const seedCfg = {
    rpcUrl: RPC_URL,
    dryRun: false,
    keypairFilePath: './keypair.json',
    computeUnitPriceMicroLamports: 100000,
    baseMint: nomuMint.toBase58(),
    quoteMint: usdcMockMint.toBase58(),
    dlmm: {
      binStep: BIN_STEP,
      feeBps: FEE_BPS,
      initialPrice: INITIAL_PRICE,
      activationType: 'timestamp',
      activationPoint,
      priceRounding: 'down',
      hasAlphaVault: false,
    },
    singleBinSeedLiquidity: {
      price: INITIAL_PRICE,
      priceRounding: 'down',
      seedAmount: SEED_AMOUNT_NOMU,
      basePositionKeypairFilepath: './keypair.json',
      operatorKeypairFilepath: './keypair.json',
      positionOwner: payer.publicKey.toBase58(),
      feeOwner: payer.publicKey.toBase58(),
      lockReleasePoint: 0,
      seedTokenXToPositionOwner: true,
    },
  }
  writeJSON(CREATE_CFG, createCfg)
  writeJSON(SEED_CFG, seedCfg)
  console.log('Configs written (activation=30s, quoteMint=USDC_MOCK, no quoteSymbol).')

  /* 4) Create + Seed */
  console.log('> Creating DLMM pool…')
  let createOut = ''
  try {
    createOut = execSync(CREATE_POOL_CMD, { cwd: TOOLKIT_DIR, encoding: 'utf8' })
    process.stdout.write(createOut)
  } catch (e: any) {
    if (e?.stdout) process.stdout.write(e.stdout)
    if (e?.stderr) process.stderr.write(e.stderr)
    console.warn('create_pool a échoué (voir logs ci-dessus).')
  }

  console.log('> Seeding liquidity (single bin)…')
  try {
    const out = execSync(SEED_SINGLE_BIN_CMD, { cwd: TOOLKIT_DIR, encoding: 'utf8' })
    process.stdout.write(out)
  } catch (e: any) {
    if (e?.stdout) process.stdout.write(e.stdout)
    if (e?.stderr) process.stderr.write(e.stderr)
    console.warn('seed_liquidity a échoué.')
  }

  /* 5) Résolution adresse de pool */
  const parsed = parsePoolAddrFromLogs(createOut)
  await sleep(10_000)

  let lb = parsed || null
  if (!lb) {
    for (let i = 0; i < 6 && !lb; i++) {
      lb = await findLbPair(new Connection(RPC_URL, 'confirmed'), nomuMint, usdcMockMint)
      if (!lb) await sleep(5000)
    }
  }

  if (lb) {
    console.log('\n============================')
    console.log(' DLMM LBPair:', lb)
    console.log(' UI (devnet): https://devnet.meteora.ag/dlmm/' + lb)
    console.log(' Base mint :', nomuMint.toBase58())
    console.log(' Quote mint:', usdcMockMint.toBase58(), '(USDC_MOCK)')
    console.log('============================\n')
  } else {
    console.warn('\nLBPair introuvable pour le moment.')
    console.log('Base mint :', nomuMint.toBase58())
    console.log('Quote mint:', usdcMockMint.toBase58(), '(USDC_MOCK)\n')
  }

  console.log('✅ Done.')
}

main().catch((e) => {
  console.error('\nFatal error:\n', e)
  process.exit(1)
})
