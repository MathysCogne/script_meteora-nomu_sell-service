import { Connection, PublicKey } from '@solana/web3.js';
import { safeParseKeypairFromFile, parseConfigFromCli } from '../../helpers';
import { DammV1Config } from '../../utils/types';
import { DEFAULT_COMMITMENT_LEVEL } from '../../utils/constants';
import { lockLiquidityStake2Earn } from '../../lib/damm_v1/stake2earn';

async function main() {
  const config = (await parseConfigFromCli()) as DammV1Config;

  console.log(`> Using keypair file path ${config.keypairFilePath}`);
  const keypair = await safeParseKeypairFromFile(config.keypairFilePath);

  console.log('\n> Initializing with general configuration...');
  console.log(`- Using RPC URL ${config.rpcUrl}`);
  console.log(`- Dry run = ${config.dryRun}`);
  console.log(`- Using payer ${keypair.publicKey} to execute commands`);

  const connection = new Connection(config.rpcUrl, DEFAULT_COMMITMENT_LEVEL);

  if (!config.baseMint) {
    throw new Error('Missing baseMint in configuration');
  }
  const baseMint = new PublicKey(config.baseMint);
  if (!config.quoteMint) {
    throw new Error('Missing quoteMint in configuration');
  }
  const quoteMint = new PublicKey(config.quoteMint);

  console.log(`- Using base token mint ${baseMint.toString()}`);
  console.log(`- Using quote token mint ${quoteMint.toString()}`);

  if (!config.dammV1LockLiquidity) {
    throw new Error('Missing lockLiquidity configuration');
  }

  await lockLiquidityStake2Earn(
    connection,
    keypair,
    baseMint,
    quoteMint,
    config.dammV1LockLiquidity.allocations,
    config.dryRun,
    config.computeUnitPriceMicroLamports
  );
}

main();
