import { WhitelistMode } from '@meteora-ag/alpha-vault';
import { WhitelistModeConfig } from '../../utils/types';
import { PublicKey } from '@solana/web3.js';
import { ALPHA_VAULT_PROGRAM_IDS } from '../../utils/constants';

export function getAlphaVaultWhitelistMode(mode: WhitelistModeConfig): WhitelistMode {
  if (mode == WhitelistModeConfig.Permissionless) {
    return WhitelistMode.Permissionless;
  } else if (mode == WhitelistModeConfig.PermissionedWithAuthority) {
    return WhitelistMode.PermissionWithAuthority;
  } else if (mode == WhitelistModeConfig.PermissionedWithMerkleProof) {
    return WhitelistMode.PermissionWithMerkleProof;
  } else {
    throw new Error(`Unsupported alpha vault whitelist mode: ${mode}`);
  }
}

export function getClusterFromProgramId(alphaVaultProgramId: PublicKey): string {
  let cluster = 'mainnet-beta';
  switch (alphaVaultProgramId.toString()) {
    case ALPHA_VAULT_PROGRAM_IDS['mainnet-beta']:
      cluster = 'mainnet-beta';
      break;
    case ALPHA_VAULT_PROGRAM_IDS['devnet']:
      cluster = 'devnet';
      break;
    case ALPHA_VAULT_PROGRAM_IDS['localhost']:
      cluster = 'localhost';
      break;
    default:
      throw new Error(`Invalid alpha vault program id ${alphaVaultProgramId}`);
  }

  return cluster;
}
