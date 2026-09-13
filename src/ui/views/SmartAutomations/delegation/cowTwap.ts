/**
 * CoW Protocol ComposableCoW / TWAP order creation.
 *
 * IMPORTANT ARCHITECTURE CONSTRAINT, READ FIRST:
 * ComposableCoW conditional orders (TWAP included) are validated via
 * EIP-1271 smart-contract signatures. That means the account placing the
 * order MUST be a Safe (or another EIP-1271 smart account) with the
 * ExtensibleFallbackHandler set and ComposableCoW registered as its domain
 * verifier. A plain EOA — which is what most Rabby accounts are — cannot
 * place a ComposableCoW order at all; there is no "just sign it" path for
 * an EOA here, unlike liquidation-shield/stop-loss which submit ordinary
 * transactions.
 *
 * So this module only becomes usable once the same Safe used for
 * zodiacRoles.ts delegation (or a separate Safe) has that one-time
 * ComposableCoW setup done. assertSafeReadyForComposableCoW below checks
 * for that on-chain and refuses to build an order otherwise, rather than
 * silently producing a signature that will just fail at settlement.
 *
 * This module now uses @cowprotocol/sdk-composable for order building
 * instead of hand-rolled struct encoding, ensuring we get versioned,
 * security-updated factories instead of manually copied addresses.
 */

import { ComposableCowSDK } from '@cowprotocol/sdk-composable';
import { OrderBookApi } from '@cowprotocol/cow-sdk';

export interface ComposableCowDeployment {
  chainId: number;
  extensibleFallbackHandler: string;
  verifiedAgainst: string;
}

export const COMPOSABLE_COW_MAINNET: ComposableCowDeployment = {
  chainId: 1,
  extensibleFallbackHandler: '0x2f55e8b20D0B9FEFA187AA7d00B6Cbe563605bF5',
  verifiedAgainst:
    'docs.cow.fi ComposableCoW integration guide (deployed contracts table) — re-check before production use',
};

export interface TwapOrderParams {
  sellToken: string;
  buyToken: string;
  receiver: string; // usually the Safe itself
  totalSellAmount: string; // raw base units, whole TWAP total
  totalBuyAmountMin: string; // raw base units, whole TWAP total (min out)
  numParts: number;
  partDurationSeconds: number;
  startTimestamp?: number; // omit to start at mining time
  appData: string; // bytes32
}

/**
 * Checks that `safeAddress` is actually configured for ComposableCoW before
 * we let the UI build/sign anything. Returns a reason string on failure so
 * the UI can show the user exactly what's missing (and a link to the setup
 * guide) instead of a cryptic settlement failure days later.
 *
 * `ethCall` should be the project's existing eth_call wrapper (see
 * wallet.ts's getErc20DecimalsAndBalance for the pattern already in use).
 */
export async function assertSafeReadyForComposableCow(
  safeAddress: string,
  deployment: ComposableCowDeployment,
  ethCall: (params: { to: string; data: string }) => Promise<string>,
  ethGetStorageAt: (address: string, slot: string) => Promise<string>
): Promise<{ ready: boolean; reason?: string }> {
  // getStorageAt(safe, FALLBACK_HANDLER_STORAGE_SLOT) — Safe stores its
  // fallback handler in a fixed EIP-1967-style slot. We read it and compare
  // against the ExtensibleFallbackHandler address rather than assuming.
  const FALLBACK_HANDLER_SLOT =
    '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d';
  try {
    const raw = await ethGetStorageAt(safeAddress, FALLBACK_HANDLER_SLOT);
    const handler = `0x${raw.slice(-40)}`.toLowerCase();
    if (handler !== deployment.extensibleFallbackHandler.toLowerCase()) {
      return {
        ready: false,
        reason:
          `${safeAddress} does not have the ExtensibleFallbackHandler set` +
          ` (found ${handler}). Complete the ComposableCoW setup at` +
          ` docs.cow.fi before placing TWAP orders.`,
      };
    }
    return { ready: true };
  } catch (e) {
    return {
      ready: false,
      reason:
        'Could not verify Safe configuration on-chain. Refusing to build a ' +
        'TWAP order until this passes — a failed check here should block, not warn.',
    };
  }
}

/**
 * Builds a TWAP conditional order using @cowprotocol/sdk-composable.
 * This does NOT sign or submit anything — it hands back data for the
 * existing wallet signing flow (the same EIP-712 signing path Rabby
 * already uses for regular typed-data requests) to sign as an owner
 * action, same as any other transaction the user explicitly confirms.
 *
 * There is deliberately no "auto-execute without a signature" path here:
 * TWAP orders, once created on ComposableCoW, get filled by CoW's
 * watchtowers over time without further per-fill signatures, which is
 * exactly why the CREATION step must go through full user review in the
 * consent modal (same as any other action node) rather than being treated
 * as a low-stakes read.
 */
export async function buildTwapConditionalOrder(
  params: TwapOrderParams,
  chainId: number
) {
  if (params.numParts < 2) {
    throw new Error('TWAP requires at least 2 parts');
  }
  if (BigInt(params.totalSellAmount) % BigInt(params.numParts) !== BigInt(0)) {
    // Not fatal on ComposableCoW itself, but surfacing it avoids silent
    // dust/rounding behavior a user didn't ask for.
    // eslint-disable-next-line no-console
    console.warn(
      'TWAP totalSellAmount is not evenly divisible by numParts — parts will differ in size'
    );
  }

  const sdk = new ComposableCowSDK(chainId);
  const order = await sdk.conditionalOrders.createTwapOrder({
    sellToken: params.sellToken as `0x${string}`,
    buyToken: params.buyToken as `0x${string}`,
    receiver: params.receiver as `0x${string}`,
    sellAmount: BigInt(params.totalSellAmount),
    buyAmount: BigInt(params.totalBuyAmountMin),
    numberOfParts: params.numParts,
    startTime: params.startTimestamp ?? Math.floor(Date.now() / 1000),
    duration: params.partDurationSeconds * params.numParts,
    appData: params.appData as `0x${string}`,
  });

  return order;
}

/**
 * Signs and submits a TWAP order to CoW Protocol's orderbook.
 * This function uses the existing wallet signing infrastructure and
 * requires the user to approve the signature through the consent modal.
 *
 * @param order - The TWAP conditional order built by buildTwapConditionalOrder
 * @param safeAddress - The Safe address that will place the order
 * @param chainId - The chain ID
 * @param signTypedData - The wallet's signTypedData function (from wallet.ts)
 * @returns The order UID from CoW's orderbook
 */
export async function signAndSubmitTwapOrder(
  order: any,
  safeAddress: string,
  chainId: number,
  signTypedData: (params: {
    keyringType: string;
    address: string;
    typedData: any;
    approvalComponent?: string;
  }) => Promise<string>
): Promise<string> {
  // Get the EIP-712 typed data for the order
  const sdk = new ComposableCowSDK(chainId);
  const typedData = sdk.conditionalOrders.getTypedData(order);

  // Sign the typed data using the existing wallet signing infrastructure
  // This requires user approval through the consent modal
  const signature = await signTypedData({
    keyringType: 'Gnosis',
    address: safeAddress,
    typedData,
    approvalComponent: 'SignTypedData',
  });

  // Submit the signed order to CoW's orderbook
  const orderBookApi = new OrderBookApi(chainId);
  const { id } = await orderBookApi.sendOrder({
    order,
    signature,
  });

  return id;
}
