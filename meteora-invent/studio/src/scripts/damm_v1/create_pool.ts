import { Connection, PublicKey } from '@solana/web3.js';
import { safeParseKeypairFromFile, parseConfigFromCli, createTokenMint } from '../../helpers';
import { Wallet } from '@coral-xyz/anchor';
import { createDammV1Pool } from '../../lib/damm_v1';
import { AlphaVaultConfig, DammV1Config } from '../../utils/types';
import { DEFAULT_COMMITMENT_LEVEL } from '../../utils/constants';
import { createAlphaVault } from '../../lib/alpha_vault';
import {
  createProgram,
  deriveCustomizablePermissionlessConstantProductPoolAddress,
} from '@meteora-ag/dynamic-amm-sdk/dist/cjs/src/amm/utils';

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

  let baseMint: PublicKey;
  if (!config.quoteMint) {
    throw new Error('Missing quoteMint in configuration');
  }
  const quoteMint = new PublicKey(config.quoteMint);

  if (config.createBaseToken) {
    baseMint = await createTokenMint(connection, wallet, {
      dryRun: config.dryRun,
      mintTokenAmount: config.createBaseToken.mintBaseTokenAmount,
      decimals: config.createBaseToken.baseDecimals,
      computeUnitPriceMicroLamports: config.computeUnitPriceMicroLamports,
    });
  } else {
    if (!config.baseMint) {
      throw new Error('Missing baseMint in configuration');
    }
    baseMint = new PublicKey(config.baseMint);
  }

  console.log(`- Using base token mint ${baseMint.toString()}`);
  console.log(`- Using quote token mint ${quoteMint.toString()}`);

  /// --------------------------------------------------------------------------
  if (config) {
    await createDammV1Pool(config, connection, wallet, baseMint, quoteMint);

    if (config.dammV1Config?.hasAlphaVault && config.alphaVault) {
      console.log('\n> Alpha vault is enabled, creating alpha vault automatically...');

      const poolAddress = deriveCustomizablePermissionlessConstantProductPoolAddress(
        baseMint,
        quoteMint,
        createProgram(connection as any).ammProgram.programId
      );

      const alphaVaultConfig: AlphaVaultConfig = {
        ...config,
        baseMint: baseMint.toString(),
        quoteMint: quoteMint.toString(),
      };

      await createAlphaVault(connection, wallet, alphaVaultConfig, poolAddress);

      console.log('\n>>> DAMM V1 pool and alpha vault created successfully! 🎉');
    }
  } else {
    throw new Error('Must provide DAMM V1 configuration');
  }
}

main();
