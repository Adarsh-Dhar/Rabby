/**
 * Safe deployment and Roles Modifier attachment for Smart Automations.
 *
 * This module provides functions to deploy a Safe, using the existing
 * @safe-global/protocol-kit dependency that Rabby already has for Gnosis
 * Safe multisig support.
 *
 * IMPORTANT: These functions build transactions but do NOT execute them.
 * The user must review and sign each transaction through Rabby's existing
 * transaction confirmation flow. This is deliberate — we should not silently
 * deploy contracts that will hold real funds.
 *
 * TWO THINGS THAT WERE WRONG IN AN EARLIER DRAFT, FIXED HERE:
 *
 * 1. `@safe-global/protocol-kit` has no named `Safe` export — checked
 *    against the actual installed v5.0.3 package. It exports `Safe` as
 *    the DEFAULT export only. `import { Safe } from ...` compiles to
 *    `undefined` at runtime in some bundling setups and fails outright in
 *    strict ESM ones; either way it's wrong.
 *
 * 2. `zodiac-roles-deployments` has no `deployments` export and no
 *    factory-address concept at all — checked against the actual
 *    installed v3.3.0 package, whose only exports are `fetchRole`,
 *    `fetchRolesMod`, `fetchRolesModConfig`, and some enums. It reads
 *    ALREADY-DEPLOYED Roles Modifier state from a subgraph; it cannot
 *    tell you where to deploy a NEW one. There is no factory/mastercopy
 *    address available from either installed package, so this file does
 *    NOT attempt to auto-deploy a Roles Modifier — see
 *    `getRolesModifierFactoryAddress` below for what that means in
 *    practice. Fabricating a mastercopy + ModuleProxyFactory address pair
 *    here would be exactly the kind of hand-copied, unverifiable address
 *    this whole feature was built to avoid.
 */

import Safe from '@safe-global/protocol-kit';
import { fetchRolesMod } from 'zodiac-roles-deployments';
import { encodeFunctionData, type Hex } from 'viem';

/**
 * Minimal shape of the EIP-1193 provider Rabby already exposes internally
 * (its injected/background provider). Passed in by the caller instead of
 * this module constructing its own RPC connection — an earlier draft
 * hardcoded `https://rpc.ankr.com/eth`, which is wrong for any chain other
 * than mainnet, ignores the user's actual RPC configuration/rate limits,
 * and routes prediction/deployment through a third party this module has
 * no relationship with.
 */
export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
}

/**
 * Predicts the counterfactual address of a Safe before deployment.
 * This allows the UI to show the user what address their Safe will have
 * before they commit to the deployment transaction.
 *
 * @param ownerAddress - The EOA that will be the sole owner of the Safe
 * @param provider - Rabby's own EIP-1193 provider for the target chain
 * @returns The predicted Safe address
 */
export async function predictSafeAddress(
  ownerAddress: string,
  provider: Eip1193Provider
): Promise<string> {
  const safeSdk = await Safe.init({
    predictedSafe: {
      safeAccountConfig: {
        owners: [ownerAddress],
        threshold: 1,
      },
    },
    provider: provider as any,
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
 * @param provider - Rabby's own EIP-1193 provider for the target chain
 * @returns The deployment transaction object
 */
export async function buildSafeDeploymentTransaction(
  ownerAddress: string,
  provider: Eip1193Provider
): Promise<{ to: string; value: string; data: string }> {
  const safeSdk = await Safe.init({
    predictedSafe: {
      safeAccountConfig: {
        owners: [ownerAddress],
        threshold: 1,
      },
    },
    provider: provider as any,
  });

  // NOTE: an earlier draft called this `getDeploymentTransaction`, which
  // does not exist on Safe v5's protocol-kit — confirmed against the
  // installed v5.0.3 type declarations. The real method is
  // `createSafeDeploymentTransaction`.
  const deploymentTransaction = await safeSdk.createSafeDeploymentTransaction();

  return {
    to: deploymentTransaction.to as string,
    value: deploymentTransaction.value.toString(),
    data: deploymentTransaction.data as string,
  };
}

/**
 * There is deliberately no `deployRolesModifier` / `getRolesModifierFactoryAddress`
 * function in this file.
 *
 * Deploying a NEW Zodiac Roles Modifier requires a ModuleProxyFactory
 * address plus a Roles Modifier mastercopy address to clone, for the
 * target chain. Neither `zodiac-roles-sdk` nor `zodiac-roles-deployments`
 * (the two packages this feature depends on) exposes either address —
 * verified above by listing their actual exports, not assumed. The only
 * place those addresses are authoritatively published is the Zodiac
 * monorepo / the Roles app itself (app.roles.gnosisguild.org), which this
 * codebase has no dependency on and no scraped copy of.
 *
 * Hand-copying a mastercopy + factory address into this file would be
 * exactly the kind of unverifiable, silently-wrong-on-redeploy address
 * this feature exists to avoid (see cowTwap.ts's docstring for the same
 * concern about ComposableCoW addresses). So: Safe deployment is
 * programmatic (above), Roles Modifier attachment is not — the user
 * deploys and attaches it themselves at app.roles.gnosisguild.org, then
 * pastes the resulting Roles Modifier address and role key back into
 * DelegationSettings.tsx's manual-setup fields. `isRolesModifierEnabled`
 * below lets the UI confirm that attachment actually happened on-chain
 * before treating it as complete.
 */

/**
 * Confirms a Roles Modifier the user says they attached is actually
 * enabled as a module on their Safe, by reading directly from the Safe
 * contract on-chain rather than trusting the pasted address blindly.
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
      args: [rolesModifierAddress as Hex],
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

/**
 * Cross-checks a pasted Roles Modifier address against the subgraph that
 * zodiac-roles-deployments actually wraps, as a second signal alongside
 * isRolesModifierEnabled (which only proves it's enabled as *a* module —
 * not that it's specifically a Roles Modifier and not some other module).
 * Returns null if the subgraph has no record of it yet (e.g. very recent
 * deployment, or an unindexed chain) rather than treating that as failure.
 */
export async function fetchKnownRolesModifier(
  chainId: number,
  rolesModifierAddress: string
) {
  try {
    return await fetchRolesMod({
      chainId: chainId as any,
      address: rolesModifierAddress.toLowerCase() as Hex,
    });
  } catch (e) {
    return null;
  }
}
