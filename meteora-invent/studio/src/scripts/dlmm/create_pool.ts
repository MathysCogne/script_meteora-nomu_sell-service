import { Connection, PublicKey } from '@solana/web3.js';
import { safeParseKeypairFromFile, parseConfigFromCli, createTokenMint } from '../../helpers';
import { Wallet } from '@coral-xyz/anchor';
import { createPermissionlessDlmmPool } from '../../lib/dlmm';
import { AlphaVaultConfig, DlmmConfig } from '../../utils/types';
import { DEFAULT_COMMITMENT_LEVEL, DLMM_PROGRAM_IDS } from '../../utils/constants';
import { deriveCustomizablePermissionlessLbPair } from '@meteora-ag/dlmm';
import { createAlphaVault } from '../../lib/alpha_vault';

async function main() {
  const config: DlmmConfig = (await parseConfigFromCli()) as DlmmConfig;

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

  // If we want to create a new token mint
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
  if (config.dlmmConfig) {
    await createPermissionlessDlmmPool(config, connection, wallet, baseMint, quoteMint);

    if (config.dlmmConfig.hasAlphaVault && config.alphaVault) {
      console.log('\n> Alpha vault is enabled, creating alpha vault automatically...');

      const dlmmProgramId = new PublicKey(DLMM_PROGRAM_IDS['mainnet-beta']);
      const [poolKey] = deriveCustomizablePermissionlessLbPair(baseMint, quoteMint, dlmmProgramId);

      const alphaVaultConfig: AlphaVaultConfig = {
        ...config,
        baseMint: baseMint.toString(),
        quoteMint: quoteMint.toString(),
      };

      await createAlphaVault(connection, wallet, alphaVaultConfig, poolKey);

      console.log('\n>>> DLMM pool and alpha vault created successfully! 🎉');
    }
  } else {
    throw new Error('Must provide DLMM configuration');
  }
}

main();
