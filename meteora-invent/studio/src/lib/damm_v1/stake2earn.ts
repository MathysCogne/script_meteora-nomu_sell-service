import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js';
import { Stake2EarnFarmConfig, LockLiquidityAllocation } from '../../utils/types';
import { DEFAULT_SEND_TX_MAX_RETRIES, STAKE2EARN_PROGRAM_IDS } from '../../utils/constants';
import StakeForFee, { deriveFeeVault } from '@meteora-ag/m3m3';
import BN from 'bn.js';
import {
  fromAllocationsToAmount,
  modifyComputeUnitPriceIx,
  runSimulateTransaction,
} from '../../helpers';
import AmmImpl from '@meteora-ag/dynamic-amm-sdk';
import { SEEDS } from '@meteora-ag/dynamic-amm-sdk/dist/cjs/src/amm/constants';
import {
  deriveCustomizablePermissionlessConstantProductPoolAddress,
  createProgram,
  getAssociatedTokenAccount,
} from '@meteora-ag/dynamic-amm-sdk/dist/cjs/src/amm/utils';

/**
 * Create a DammV1 pool with Stake2Earn
 * @param connection - The connection to the cluster
 * @param payer - The payer for the transaction
 * @param poolKey - The key of the pool
 * @param stakeMint
 * @param config
 * @param dryRun
 * @param computeUnitPriceMicroLamports
 * @param opts
 * @returns
 */
export async function createDammV1Stake2EarnPool(
  connection: Connection,
  payer: Keypair,
  poolKey: PublicKey,
  stakeMint: PublicKey,
  config: Stake2EarnFarmConfig,
  dryRun: boolean,
  computeUnitPriceMicroLamports: number,
  opts?: {
    m3m3ProgramId: PublicKey;
  }
): Promise<void> {
  const m3m3ProgramId =
    opts?.m3m3ProgramId ?? new PublicKey(STAKE2EARN_PROGRAM_IDS['mainnet-beta']);
  const m3m3VaultPubkey = deriveFeeVault(poolKey, m3m3ProgramId);
  console.log(`- M3M3 fee vault ${m3m3VaultPubkey}`);

  // Check if the stake2earn vault already exists
  const m3m3VaultAccount = await connection.getAccountInfo(m3m3VaultPubkey, connection.commitment);

  if (m3m3VaultAccount) {
    console.log(`>>> M3M3 farm is already existed. Skip creating new farm.`);
    return;
  }

  console.log(`>> Creating M3M3 fee farm...`);
  const topListLength = config.topListLength;
  const unstakeLockDuration = new BN(config.unstakeLockDurationSecs);
  const secondsToFullUnlock = new BN(config.secondsToFullUnlock);
  const startFeeDistributeTimestamp = new BN(config.startFeeDistributeTimestamp);

  console.log(`- Using topListLength: ${topListLength}`);
  console.log(`- Using unstakeLockDuration ${unstakeLockDuration}`);
  console.log(`- Using secondsToFullUnlock ${secondsToFullUnlock}`);
  console.log(`- Using startFeeDistributeTimestamp ${startFeeDistributeTimestamp}`);

  // stake2earn farm didn't exist
  const createTx = await StakeForFee.createFeeVault(
    connection,
    poolKey,
    stakeMint,
    payer.publicKey,
    {
      topListLength,
      unstakeLockDuration,
      secondsToFullUnlock,
      startFeeDistributeTimestamp,
      padding: [],
    }
  );

  modifyComputeUnitPriceIx(createTx, computeUnitPriceMicroLamports);

  if (dryRun) {
    console.log(`> Simulating create m3m3 farm tx...`);
    await runSimulateTransaction(connection, [payer], payer.publicKey, [createTx]);
  } else {
    console.log(`>> Sending create m3m3 farm transaction...`);
    const txHash = await sendAndConfirmTransaction(connection, createTx, [payer], {
      commitment: connection.commitment,
      maxRetries: DEFAULT_SEND_TX_MAX_RETRIES,
    }).catch((err: any) => {
      console.error(err);
      throw err;
    });
    console.log(`>>> M3M3 farm initialized successfully with tx hash: ${txHash}`);
  }
}

/**
 * Lock liquidity for a DammV1 pool with Stake2Earn
 * @param connection - The connection to the cluster
 * @param payer - The payer for the transaction
 * @param baseMint - The mint for the base token
 * @param quoteMint - The mint for the quote token
 * @param allocations - The allocations for the liquidity
 * @param dryRun - Whether to simulate the transaction
 * @param computeUnitPriceMicroLamports - The compute unit price for the transaction
 * @param opts - The options for the transaction
 * @returns The pool address
 */
export async function lockLiquidityStake2Earn(
  connection: Connection,
  payer: Keypair,
  baseMint: PublicKey,
  quoteMint: PublicKey,
  allocations: LockLiquidityAllocation[],
  dryRun: boolean,
  computeUnitPriceMicroLamports: number,
  opts?: {
    m3m3ProgramId: PublicKey;
  }
): Promise<void> {
  const m3m3ProgramId =
    opts?.m3m3ProgramId ?? new PublicKey(STAKE2EARN_PROGRAM_IDS['mainnet-beta']);

  const poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
    baseMint,
    quoteMint,
    createProgram(connection as any).ammProgram.programId
  );
  console.log(`- Pool address: ${poolKey}`);

  const stake2EarnVaultPubkey = deriveFeeVault(poolKey, m3m3ProgramId);
  console.log(`- Stake2Earn fee vault ${stake2EarnVaultPubkey}`);

  if (allocations.length === 0) {
    throw new Error('Missing allocations in lockLiquidity configuration');
  }

  const allocationContainsFeeFarmAddress = allocations.some((allocation) =>
    new PublicKey(allocation.address).equals(stake2EarnVaultPubkey)
  );
  if (!allocationContainsFeeFarmAddress) {
    throw new Error('Lock liquidity allocations does not contain Stake2Earn fee farm address');
  }

  const [lpMint] = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.LP_MINT), poolKey.toBuffer()],
    createProgram(connection as any).ammProgram.programId
  );
  const payerPoolLp = getAssociatedTokenAccount(lpMint, payer.publicKey);
  const payerPoolLpBalance = (
    await connection.getTokenAccountBalance(payerPoolLp, connection.commitment)
  ).value.amount;
  console.log('- payerPoolLpBalance %s', payerPoolLpBalance.toString());

  const allocationByAmounts = fromAllocationsToAmount(new BN(payerPoolLpBalance), allocations);

  const pool = await AmmImpl.create(connection as any, poolKey);

  for (const allocation of allocationByAmounts) {
    console.log('\n> Lock liquidity %s', allocation.address.toString());
    const tx = await pool.lockLiquidity(allocation.address, allocation.amount, payer.publicKey);
    modifyComputeUnitPriceIx(tx as any, computeUnitPriceMicroLamports);

    if (dryRun) {
      console.log(
        `\n> Simulating lock liquidity tx for address ${allocation.address} with amount = ${allocation.amount}... / percentage = ${allocation.percentage}`
      );
      await runSimulateTransaction(connection, [payer], payer.publicKey, [tx as any]);
    } else {
      const txHash = await sendAndConfirmTransaction(connection, tx as any, [payer], {
        commitment: connection.commitment,
        maxRetries: DEFAULT_SEND_TX_MAX_RETRIES,
      }).catch((err) => {
        console.error(err);
        throw err;
      });

      console.log(
        `>>> Lock liquidity successfully with tx hash: ${txHash} for address ${allocation.address} with amount ${allocation.amount}`
      );
    }
  }
}
