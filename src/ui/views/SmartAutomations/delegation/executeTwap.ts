/**
 * TWAP execution logic extracted from home.tsx
 * This is automation-agnostic infrastructure for executing TWAP orders
 * through CoW Protocol's ComposableCoW.
 */

import {
  buildTwapCreateTransaction,
  assertSafeReadyForComposableCow,
  getComposableCowDeployment,
} from './cowTwap';

import type { Eip1193Provider } from './cowTwap';

export interface TwapExecutionParams {
  sellToken: string;
  buyToken: string;
  totalSellAmount: string;
  totalBuyAmountMin: string;
  numParts: number;
  partDurationSeconds: number;
  receiver: string; // Safe address
  chainId: number;
  viemChain: { id: number; name: string; nativeCurrency: any; rpcUrls: any };
  rpcProvider: Eip1193Provider;
  sendTransaction: (tx: {
    from: string;
    to: string;
    value: string;
    data: string;
  }) => Promise<string>;
}

export interface TwapExecutionResult {
  success: boolean;
  txHash?: string;
  orderId?: string;
  error?: string;
  usedFallback?: boolean;
  fallbackReason?: string;
}

/**
 * Executes a TWAP order via ComposableCoW if the Safe is configured,
 * otherwise returns a fallback result indicating the caller should use
 * the KeeperHub workflow path instead.
 *
 * @param params - TWAP execution parameters
 * @returns Execution result with transaction details or fallback information
 */
export async function executeRealTwap(
  params: TwapExecutionParams
): Promise<TwapExecutionResult> {
  const {
    sellToken,
    buyToken,
    totalSellAmount,
    totalBuyAmountMin,
    numParts,
    partDurationSeconds,
    receiver,
    chainId,
    viemChain,
    rpcProvider,
    sendTransaction,
  } = params;

  try {
    // Check if Safe is ready for ComposableCoW
    const deployment = getComposableCowDeployment(chainId);
    const readyCheck = await assertSafeReadyForComposableCow(
      receiver,
      deployment,
      (address, slot) =>
        rpcProvider.request({
          method: 'eth_getStorageAt',
          params: [address, slot, 'latest'],
        }) as Promise<string>
    );

    if (!readyCheck.ready) {
      return {
        success: false,
        usedFallback: true,
        fallbackReason:
          readyCheck.reason || 'Safe not configured for ComposableCoW',
      };
    }

    // Build the TWAP transaction
    const tx = buildTwapCreateTransaction(
      {
        sellToken,
        buyToken,
        receiver,
        totalSellAmount,
        totalBuyAmountMin,
        numParts,
        partDurationSeconds,
        appData:
          '0x0000000000000000000000000000000000000000000000000000000000000000', // Default appData (bytes32)
      },
      chainId,
      { provider: rpcProvider, viemChain }
    );

    // Send the transaction
    const txHash = await sendTransaction({
      from: receiver,
      to: tx.to,
      value: tx.value,
      data: tx.data,
    });

    return {
      success: true,
      txHash,
      orderId: tx.orderId,
    };
  } catch (error) {
    return {
      success: false,
      usedFallback: true,
      fallbackReason: `Could not execute TWAP: ${(error as Error).message}`,
      error: (error as Error).message,
    };
  }
}
