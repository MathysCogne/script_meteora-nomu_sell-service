import { Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { DammV1Config } from '../../utils/types';
import { DEFAULT_COMMITMENT_LEVEL } from '../../utils/constants';
import { safeParseKeypairFromFile, parseConfigFromCli } from '../../helpers';
import {
  createProgram,
  deriveCustomizablePermissionlessConstantProductPoolAddress,
} from '@meteora-ag/dynamic-amm-sdk/dist/cjs/src/amm/utils';
import { createDammV1Stake2EarnPool } from '../../lib/damm_v1/stake2earn';

async function main() {
  const config = (await parseConfigFromCli()) as DammV1Config;

  console.log(`> Using keypair file path ${config.keypairFilePath}`);
  const keypair = await safeParseKeypairFromFile(config.keypairFilePath);

  console.log('\n> Initializing with general configuration...');
  console.log(`- Using RPC URL ${config.rpcUrl}`);
  console.log(`- Dry run = ${config.dryRun}`);
  console.log(`- Using payer ${keypair.publicKey} to execute commands`);

  const connection = new Connection(config.rpcUrl, DEFAULT_COMMITMENT_LEVEL);
  const wallet = new Wallet(keypair);

  if (!config.baseMint) {
    throw new Error('Missing baseMint in configuration');
  }
  const baseMint = new PublicKey(config.baseMint);
  if (!config.quoteMint) {
    throw new Error('Missing quoteMint in configuration');
  }
  const quoteMint = new PublicKey(config.quoteMint);
  const ammProgram = createProgram(connection as any).ammProgram;
  const poolKey = deriveCustomizablePermissionlessConstantProductPoolAddress(
    baseMint,
    quoteMint,
    ammProgram.programId
  );

  const poolAccount = await connection.getAccountInfo(poolKey, {
    commitment: 'confirmed',
  });

  if (!poolAccount) {
    throw new Error(`Pool ${poolKey} didn't exist. Please create it first.`);
  }

  console.log(`- Using base token mint ${baseMint.toString()}`);
  console.log(`- Using quote token mint ${quoteMint.toString()}`);
  console.log(`- Pool key ${poolKey}`);

  if (!config.stake2EarnFarm) {
    throw new Error('Missing M3M3 configuration');
  }

  await createDammV1Stake2EarnPool(
    connection,
    wallet.payer,
    poolKey,
    baseMint,
    config.stake2EarnFarm,
    config.dryRun,
    config.computeUnitPriceMicroLamports
  );
}

main();
