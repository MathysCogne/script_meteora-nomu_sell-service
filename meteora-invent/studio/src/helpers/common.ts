import { SOL_TOKEN_DECIMALS } from '../utils/constants';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { Signer, PublicKey, Connection } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { AllocationByAmount, LockLiquidityAllocation } from '../utils/types';

export function getAmountInLamports(amount: number | string, decimals: number): BN {
  const amountD = new Decimal(amount);
  const amountLamports = amountD.mul(new Decimal(10 ** decimals));
  return new BN(amountLamports.toString());
}

export function getSigners(
  signerOrMultisig: Signer | PublicKey,
  multiSigners: Signer[]
): [PublicKey, Signer[]] {
  return signerOrMultisig instanceof PublicKey
    ? [signerOrMultisig, multiSigners]
    : [signerOrMultisig.publicKey, [signerOrMultisig]];
}

export async function getQuoteDecimals(
  connection: Connection,
  quoteMint?: string
): Promise<number> {
  if (quoteMint) {
    const quoteMintInfo = await connection.getAccountInfo(new PublicKey(quoteMint));
    if (!quoteMintInfo) {
      throw new Error(`Quote mint account not found: ${quoteMint}`);
    }
    const mintAccount = await getMint(
      connection,
      new PublicKey(quoteMint),
      connection.commitment,
      quoteMintInfo.owner
    );
    const decimals = mintAccount.decimals;
    return decimals;
  }
  return SOL_TOKEN_DECIMALS;
}

export function getDecimalizedAmount(amountLamport: BN, decimals: number): BN {
  return amountLamport.div(new BN(10 ** decimals));
}

export function fromAllocationsToAmount(
  lpAmount: BN,
  allocations: LockLiquidityAllocation[]
): AllocationByAmount[] {
  const sumPercentage = allocations.reduce((partialSum, a) => partialSum + a.percentage, 0);
  if (sumPercentage === 0) {
    throw Error('sumPercentage is zero');
  } else if (sumPercentage > 100) {
    throw Error('sumPercentage is greater than 100');
  }

  const amounts: AllocationByAmount[] = [];
  let sum = new BN(0);
  for (let i = 0; i < allocations.length - 1; i++) {
    const allocation = allocations[i];
    if (!allocation) {
      throw new Error(`Allocation at index ${i} is undefined`);
    }
    const amount = lpAmount.mul(new BN(allocation.percentage)).div(new BN(sumPercentage));
    sum = sum.add(amount);
    amounts.push({
      address: new PublicKey(allocation.address),
      amount,
      percentage: allocation.percentage,
    });
  }
  // the last wallet get remaining amount
  const lastAllocation = allocations[allocations.length - 1];
  if (!lastAllocation) {
    throw new Error(`Last allocation is undefined`);
  }
  amounts.push({
    address: new PublicKey(lastAllocation.address),
    amount: lpAmount.sub(sum),
    percentage: lastAllocation.percentage,
  });
  return amounts;
}

export function chunks<T>(array: T[], size: number): T[][] {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map((_, index) =>
    array.slice(index * size, (index + 1) * size)
  );
}
