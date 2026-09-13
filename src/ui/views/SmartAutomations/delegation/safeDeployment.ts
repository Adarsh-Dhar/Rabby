/**
 * Safe deployment and Roles Modifier attachment for Smart Automations.
 *
 * This module provides functions to deploy a Safe and attach a Zodiac Roles
 * Modifier, using the existing @safe-global/protocol-kit dependency that
 * Rabby already has for Gnosis Safe multisig support.
 *
 * IMPORTANT: These functions build transactions but do NOT execute them.
 * The user must review and sign each transaction through Rabby's existing
 * transaction confirmation flow. This is deliberate — we should not silently
 * deploy contracts that will hold real funds.
 */

import { Safe } from '@safe-global/protocol-kit';
import { deployments } from 'zodiac-roles-deployments';
import { encodeFunctionData } from 'viem';

/**
 * Predicts the counterfactual address of a Safe before deployment.
 * This allows the UI to show the user what address their Safe will have
 * before they commit to the deployment transaction.
 *
 * @param ownerAddress - The EOA that will be the sole owner of the Safe
 * @param chainId - The chain ID where the Safe will be deployed
 * @returns The predicted Safe address
 */
export async function predictSafeAddress(
  ownerAddress: string,
  chainId: number
): Promise<string> {
  const safeSdk = await Safe.init({
    predictedSafe: {
      owners: [ownerAddress],
      threshold: 1,
    },
    provider: `https://rpc.ankr.com/eth`, // TODO: Use project's provider wrapper
  });

  const address = await safeSdk.getAddress();
  return address;
}

/**
 * Builds a transaction to deploy a single-owner Safe.
 * The transaction is returned as an object with to, value, and data fields
 * that can be signed through Rabby's existing transaction confirmation flow.
 *
 * @param ownerAddress - The EOA that will be the sole owner of the Safe
 * @param chainId - The chain ID where the Safe will be deployed
 * @returns The deployment transaction object
 */
export async function buildSafeDeploymentTransaction(
  ownerAddress: string,
  chainId: number
): Promise<{ to: string; value: string; data: string }> {
  const safeSdk = await Safe.init({
    predictedSafe: {
      owners: [ownerAddress],
      threshold: 1,
    },
    provider: `https://rpc.ankr.com/eth`, // TODO: Use project's provider wrapper
  });

  const deploymentTransaction = await safeSdk.getDeploymentTransaction();

  return {
    to: deploymentTransaction.to as string,
    value: deploymentTransaction.value.toString(),
    data: deploymentTransaction.data as string,
  };
}

/**
 * Gets the verified Roles Modifier factory address for a given chain.
 * Uses zodiac-roles-deployments to avoid hand-copied addresses.
 *
 * @param chainId - The chain ID
 * @returns The Roles Modifier factory address, or null if not available
 */
export function getRolesModifierFactoryAddress(chainId: number): string | null {
  const chainKey = chainId.toString();
  const deployment = deployments[chainKey as keyof typeof deployments];
  return deployment?.factoryAddress || null;
}

/**
 * Builds a transaction to attach a Zodiac Roles Modifier to a Safe.
 * This transaction calls the Safe's enableModule function with the
 * Roles Modifier address.
 *
 * @param safeAddress - The address of the deployed Safe
 * @param chainId - The chain ID
 * @returns The enableModule transaction object
 */
export async function buildAttachRolesModifierTransaction(
  safeAddress: string,
  chainId: number
): Promise<{ to: string; value: string; data: string }> {
  const factoryAddress = getRolesModifierFactoryAddress(chainId);
  if (!factoryAddress) {
    throw new Error(
      `Roles Modifier factory address not available for chain ${chainId}. ` +
      'Check zodiac-roles-deployments for supported chains.'
    );
  }

  const SAFE_ENABLE_MODULE_ABI = [
    {
      name: 'enableModule',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'module', type: 'address' }],
      outputs: [],
    },
  ] as const;

  const enableModuleData = encodeFunctionData({
    abi: SAFE_ENABLE_MODULE_ABI,
    functionName: 'enableModule',
    args: [factoryAddress as `0x${string}`],
  });

  return {
    to: safeAddress,
    value: '0',
    data: enableModuleData,
  };
}

/**
 * Checks if a Roles Modifier is already attached to a Safe.
 *
 * @param safeAddress - The address of the Safe
 * @param rolesModifierAddress - The address of the Roles Modifier
 * @param ethCall - The project's eth_call wrapper
 * @returns Whether the Roles Modifier is enabled
 */
export async function isRolesModifierEnabled(
  safeAddress: string,
  rolesModifierAddress: string,
  ethCall: (params: { to: string; data: string }) => Promise<string>
): Promise<boolean> {
  try {
    const SAFE_IS_MODULE_ENABLED_ABI = [
      {
        name: 'isModuleEnabled',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'module', type: 'address' }],
        outputs: [{ name: '', type: 'bool' }],
      },
    ] as const;

    const isModuleEnabledData = encodeFunctionData({
      abi: SAFE_IS_MODULE_ENABLED_ABI,
      functionName: 'isModuleEnabled',
      args: [rolesModifierAddress as `0x${string}`],
    });

    const result = await ethCall({
      to: safeAddress,
      data: isModuleEnabledData,
    });
    // Booleans in Ethereum are uint256: 0x0...0 = false, 0x0...1 = true
    return result === '0x0000000000000000000000000000000000000000000000000000000000000001';
  } catch (e) {
    return false;
  }
}
