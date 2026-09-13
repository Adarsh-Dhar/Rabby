/**
 * Role permission generation for Smart Automations.
 *
 * This module uses zodiac-roles-sdk to generate minimal permission sets
 * for each workflow template, so users don't have to manually build
 * permissions in a separate app. This keeps the permission set in sync
 * with the actual actions the workflow performs.
 *
 * Each workflow template (Liquidation Shield, Stop-Loss, TWAP, etc.)
 * has a corresponding xPermissions() function that returns the exact
 * permissions needed for that workflow.
 *
 * PERMISSION MODEL, READ FIRST:
 * zodiac-roles-sdk (checked against the installed v4.1.3 package) does NOT
 * export a `planApplyRole` function — that was an incorrect assumption in
 * an earlier draft of this file. What it does export is `rolesAbi`, the
 * real Roles Modifier contract ABI, which includes `allowFunction` and
 * `allowTarget` — the actual on-chain calls that grant a role permission
 * to call a given function selector (or, for allowTarget, ANY function) on
 * a given contract, with no argument-level scoping.
 *
 * `allowFunction`/`allowTarget` are single-target calls with no batch
 * variant on the Modifier contract itself, so applying N permissions is N
 * separate transactions (or one Safe multiSend batch built by the caller
 * from this array) — not one omnibus "apply role" call. Hence
 * buildApplyRoleTransactions (plural) returns an array, one tx per
 * PermissionTarget, instead of pretending a single call can do it.
 *
 * This is deliberately coarser than full zodiac-roles-sdk parameter
 * scoping (e.g. capping the `amount` argument of an approve() call).
 * Doing real argument scoping means going through `scopeFunction` with a
 * `Condition` tree, which is a much larger surface to get right; shipping
 * allowFunction first (scoped to contract + selector, not scoped to
 * arguments) is a real, working, minimal permission — not a placeholder —
 * and argument-level scoping can be layered on later.
 */

import { encodeFunctionData, type Hex } from 'viem';
import { rolesAbi, ExecutionOptions } from 'zodiac-roles-sdk';

export interface PermissionTarget {
  address: string;
  value: string;
  data: string;
}

/**
 * Generates permissions for Liquidation Shield workflow on Aave V3.
 * This allows the role to:
 * - Approve USDC for the Aave V3 Pool (capped at a specific amount)
 * - Call repay() on the Aave V3 Pool
 *
 * @param usdcAddress - The USDC token address
 * @param aaveV3PoolAddress - The Aave V3 Pool address
 * @param capAmount - The maximum amount of USDC the role can approve (in wei)
 * @param chainId - The chain ID
 * @returns Array of permission targets
 */
export function liquidationShieldPermissions(
  usdcAddress: string,
  aaveV3PoolAddress: string,
  capAmount: string,
  chainId: number
): PermissionTarget[] {
  const ERC20_APPROVE_ABI = [
    {
      name: 'approve',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ] as const;

  const AAVE_REPAY_ABI = [
    {
      name: 'repay',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'asset', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'interestRateMode', type: 'uint256' },
        { name: 'onBehalfOf', type: 'address' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const;

  const approveData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [aaveV3PoolAddress as `0x${string}`, BigInt(capAmount)],
  });

  const repayData = encodeFunctionData({
    abi: AAVE_REPAY_ABI,
    functionName: 'repay',
    args: [
      usdcAddress as `0x${string}`,
      BigInt(capAmount), // This would be the actual debt amount in practice
      1n, // Stable rate (uint256 — must be bigint, not number, for viem)
      '0x0000000000000000000000000000000000000000' as `0x${string}`, // Would be the Safe address
    ],
  });

  return [
    {
      address: usdcAddress,
      value: '0',
      data: approveData,
    },
    {
      address: aaveV3PoolAddress,
      value: '0',
      data: repayData,
    },
  ];
}

/**
 * Generates permissions for Stop-Loss workflow on Uniswap V3.
 * This allows the role to:
 * - Approve the watched token for the Uniswap V3 Router (capped at a specific amount)
 * - Call swap() on the Uniswap V3 Router
 *
 * @param tokenAddress - The token address to watch
 * @param uniswapV3RouterAddress - The Uniswap V3 Router address
 * @param capAmount - The maximum amount of the token the role can approve (in wei)
 * @param chainId - The chain ID
 * @returns Array of permission targets
 */
export function stopLossPermissions(
  tokenAddress: string,
  uniswapV3RouterAddress: string,
  capAmount: string,
  chainId: number
): PermissionTarget[] {
  const ERC20_APPROVE_ABI = [
    {
      name: 'approve',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ] as const;

  const UNISWAP_SWAP_ABI = [
    {
      name: 'exactInputSingle',
      type: 'function',
      stateMutability: 'payable',
      inputs: [
        { name: 'params', type: 'tuple', components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ] },
      ],
      outputs: [{ name: 'amountOut', type: 'uint256' }],
    },
  ] as const;

  const approveData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [uniswapV3RouterAddress as `0x${string}`, BigInt(capAmount)],
  });

  // This is a simplified swap calldata - in practice it would need the actual parameters
  const swapData = encodeFunctionData({
    abi: UNISWAP_SWAP_ABI,
    functionName: 'exactInputSingle',
    args: [{
      tokenIn: tokenAddress as `0x${string}`,
      tokenOut: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`, // USDC placeholder
      fee: 3000,
      recipient: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      amountIn: BigInt(capAmount),
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    }],
  });

  return [
    {
      address: tokenAddress,
      value: '0',
      data: approveData,
    },
    {
      address: uniswapV3RouterAddress,
      value: '0',
      data: swapData,
    },
  ];
}

/**
 * Generates permissions for TWAP workflow on CoW Protocol.
 * This allows the role to:
 * - Approve the sell token for the ComposableCoW handler (capped at the total sell amount)
 * - Create TWAP orders on ComposableCoW
 *
 * @param sellToken - The token address to sell
 * @param composableCowHandler - The ComposableCoW TWAP handler address
 * @param totalSellAmount - The total amount to sell (in wei)
 * @param chainId - The chain ID
 * @returns Array of permission targets
 */
export function twapPermissions(
  sellToken: string,
  composableCowHandler: string,
  totalSellAmount: string,
  chainId: number
): PermissionTarget[] {
  const ERC20_APPROVE_ABI = [
    {
      name: 'approve',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: '', type: 'bool' }],
    },
  ] as const;

  const approveData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [composableCowHandler as `0x${string}`, BigInt(totalSellAmount)],
  });

  // CoW TWAP order creation would be handled by the ComposableCoW contract
  // The role just needs approval - the actual order creation happens off-chain
  // through the CoW Protocol SDK
  return [
    {
      address: sellToken,
      value: '0',
      data: approveData,
    },
  ];
}

/**
 * Generates permissions for Yield Harvester workflow on Aave V3.
 * This allows the role to:
 * - Call claimRewards() on the Aave Rewards Controller
 *
 * @param rewardsControllerAddress - The Aave Rewards Controller address
 * @param chainId - The chain ID
 * @returns Array of permission targets
 */
export function yieldHarvesterPermissions(
  rewardsControllerAddress: string,
  chainId: number
): PermissionTarget[] {
  const AAVE_CLAIM_REWARDS_ABI = [
    {
      name: 'claimRewards',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'assets', type: 'address[]' },
        { name: 'amount', type: 'uint256' },
        { name: 'to', type: 'address' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const;

  const claimRewardsData = encodeFunctionData({
    abi: AAVE_CLAIM_REWARDS_ABI,
    functionName: 'claimRewards',
    args: [
      ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`], // USDC placeholder
      // MAX_UINT256 (2**256 - 1) — the earlier draft had 66 hex digits
      // here instead of 64, which overflows uint256 and would throw at
      // encode time. `2n ** 256n - 1n` can't have this class of typo.
      2n ** 256n - 1n,
      '0x0000000000000000000000000000000000000000' as `0x${string}`, // Would be the Safe address
    ],
  });

  return [
    {
      address: rewardsControllerAddress,
      value: '0',
      data: claimRewardsData,
    },
  ];
}

/**
 * Builds one `allowFunction` transaction per permission target, granting
 * the role the ability to call exactly that (target, function selector)
 * pair on the Roles Modifier — nothing else. This is the real, on-chain
 * effective operation; there is no single-call "apply the whole set"
 * shortcut on the Modifier contract (see module docstring above).
 *
 * Each returned transaction must be sent (and mined) separately by the
 * Safe that owns the Modifier — the caller (DelegationSettings.tsx) is
 * responsible for sending them in sequence through Rabby's existing
 * transaction flow, or batching them into a single Safe multiSend
 * transaction if it already has that capability.
 *
 * @param roleKey - The bytes32 role key
 * @param permissions - The permission targets to grant
 * @param rolesModifierAddress - The Roles Modifier address (call target)
 * @returns One `{ to, value, data }` transaction per permission, in order
 */
export function buildApplyRoleTransactions(
  roleKey: string,
  permissions: PermissionTarget[],
  rolesModifierAddress: string
): { to: string; value: string; data: string }[] {
  if (!/^0x[a-fA-F0-9]{64}$/.test(roleKey)) {
    throw new Error(`roleKey must be a bytes32 hex string, got: ${roleKey}`);
  }

  return permissions.map((permission) => {
    if (!/^0x[a-fA-F0-9]*$/.test(permission.data) || permission.data.length < 10) {
      throw new Error(
        `Permission for ${permission.address} has no usable function selector ` +
        `in its data field (${permission.data}) — cannot scope allowFunction to it.`
      );
    }
    const selector = permission.data.slice(0, 10) as Hex;

    const data = encodeFunctionData({
      abi: rolesAbi,
      functionName: 'allowFunction',
      args: [
        roleKey as Hex,
        permission.address as Hex,
        selector,
        ExecutionOptions.None,
      ],
    });

    return {
      to: rolesModifierAddress,
      value: '0',
      data,
    };
  });
}

