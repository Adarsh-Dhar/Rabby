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
 * NOTE: This is a simplified implementation. The full zodiac-roles-sdk
 * integration would use the SDK's domain-specific builders and planApplyRole
 * to generate the exact calldata. For now, this provides the structure
 * and can be extended with the full SDK integration later.
 */

import { encodeFunctionData } from 'viem';

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
      1, // Stable rate
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
      ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'] as `0x${string}[]`, // USDC placeholder
      BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'),
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
 * Builds the complete apply-role transaction for a given permission set.
 * This returns the actual transaction that the user needs to sign to
 * apply the role to their Roles Modifier.
 *
 * @param roleKey - The bytes32 role key
 * @param permissions - The permission targets
 * @param rolesModifierAddress - The Roles Modifier address
 * @param chainId - The chain ID
 * @returns The apply-role transaction object
 */
export async function buildApplyRoleTransaction(
  roleKey: string,
  permissions: PermissionTarget[],
  rolesModifierAddress: string,
  chainId: number
): Promise<{ to: string; value: string; data: string }> {
  // TODO: Implement actual applyRole encoding using the zodiac-roles-sdk
  // The SDK's planApplyRole function generates the exact calldata needed
  // For now, return a placeholder structure that shows the intended flow

  const targets = permissions.map((p) => p.address);
  const values = permissions.map((p) => p.value);
  const calldatas = permissions.map((p) => p.data);

  // This would be replaced with actual zodiac-roles-sdk planApplyRole call:
  // const { calldata } = await planApplyRole({
  //   key: roleKey,
  //   targets: { address: targets, value: values, data: calldatas },
  // }, { chainId, address: rolesModifierAddress });

  return {
    to: rolesModifierAddress,
    value: '0',
    data: '0x', // Placeholder - would be actual calldata from planApplyRole
  };
}

