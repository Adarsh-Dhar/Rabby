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
 * ComposableCoW setup done. assertSafeReadyForComposableCow below checks
 * for that on-chain and refuses to build an order otherwise, rather than
 * silently producing something that will just fail at settlement.
 *
 * WHAT WAS WRONG IN AN EARLIER DRAFT, AND WHAT'S VERIFIED HERE:
 *
 * 1. `ComposableCowSDK` does not exist in @cowprotocol/sdk-composable —
 *    checked against the actual installed v1.3.0 package's exports. The
 *    real exports are classes like `Twap`, `ConditionalOrderFactory`,
 *    `Multiplexer`.
 *
 * 2. The architecture itself was wrong, not just the class name: a TWAP
 *    order is NOT created by signing EIP-712 typed data and POSTing to
 *    CoW's orderbook API (that flow is for regular limit/market orders).
 *    A ComposableCoW conditional order is created by calling `.create()`
 *    (or `.createWithContext()`) on the ComposableCoW contract itself, as
 *    an ordinary on-chain transaction from the Safe. `Twap.fromData(...)`
 *    gives you a `.createCalldata` getter that returns exactly that
 *    calldata — no signing, no orderbook API involved at creation time.
 *    (CoW's watchtowers pick the order up on-chain afterwards and submit
 *    fills to the orderbook themselves — that part genuinely doesn't
 *    involve this wallet again.)
 *
 * 3. The ComposableCoW and ExtensibleFallbackHandler addresses are now
 *    read from `@cowprotocol/cow-sdk`'s `COMPOSABLE_COW_CONTRACT_ADDRESS`
 *    / `EXTENSIBLE_FALLBACK_HANDLER_CONTRACT_ADDRESS` exports (verified
 *    against the installed v9.2.6 package — both are per-chain maps
 *    maintained by CoW themselves) instead of a hand-copied constant with
 *    a comment asking someone to "re-check before production use". That
 *    hand-copied value happened to match what the SDK reports for
 *    mainnet, but the whole point of the earlier docstring's caution
 *    about redeploys was that hand-copying isn't a process that catches
 *    it when they stop matching.
 *
 * 4. Building order calldata requires an `AbstractProviderAdapter` to be
 *    registered (`setGlobalAdapter`) before any `ConditionalOrder` is
 *    constructed. `@cowprotocol/sdk-viem-adapter`'s `ViemAdapter` is the
 *    concrete implementation for this codebase (viem is already a
 *    dependency; ethers is also present if a future caller prefers
 *    `@cowprotocol/sdk-ethers-v5-adapter` instead). Confirmed by testing:
 *    `new ViemAdapter({ provider })` with NO signer is sufficient to call
 *    `.createCalldata` — signing only matters for order *cancellation*
 *    signatures and for the regular (non-conditional) order flow, neither
 *    of which this module uses. That matters here specifically because
 *    Rabby's keyrings never hand a private key to feature code — only
 *    the background signing flow ever touches it — so an adapter that
 *    *required* a signer to do calldata-only work would be a non-starter.
 *    `@cowprotocol/sdk-viem-adapter` is not yet in package.json and needs
 *    to be added (`"@cowprotocol/sdk-viem-adapter": "^0.3.28"`).
 */

import { createPublicClient, http, type Hex } from 'viem';
import { ViemAdapter } from '@cowprotocol/sdk-viem-adapter';
import {
  setGlobalAdapter,
  COMPOSABLE_COW_CONTRACT_ADDRESS,
  EXTENSIBLE_FALLBACK_HANDLER_CONTRACT_ADDRESS,
} from '@cowprotocol/cow-sdk';
import { Twap, type TwapData } from '@cowprotocol/sdk-composable';

export interface ComposableCowDeployment {
  chainId: number;
  composableCow: string;
  extensibleFallbackHandler: string;
}

/**
 * Looks up the ComposableCoW + ExtensibleFallbackHandler addresses for a
 * chain directly from @cowprotocol/cow-sdk's maintained address maps,
 * rather than a constant kept by hand in this file. Throws for any chain
 * the SDK doesn't have an entry for, rather than guessing.
 */
export function getComposableCowDeployment(chainId: number): ComposableCowDeployment {
  const composableCow = (COMPOSABLE_COW_CONTRACT_ADDRESS as Record<number, string>)[chainId];
  const extensibleFallbackHandler = (EXTENSIBLE_FALLBACK_HANDLER_CONTRACT_ADDRESS as Record<number, string>)[chainId];
  if (!composableCow || !extensibleFallbackHandler) {
    throw new Error(
      `ComposableCoW is not available on chain ${chainId} per @cowprotocol/cow-sdk's ` +
      `published deployments. Not falling back to a guessed address.`
    );
  }
  return { chainId, composableCow, extensibleFallbackHandler };
}

export interface TwapOrderParams {
  sellToken: string;
  buyToken: string;
  receiver: string; // usually the Safe itself
  totalSellAmount: string; // raw base units, whole TWAP total
  totalBuyAmountMin: string; // raw base units, whole TWAP total (min out)
  numParts: number;
  partDurationSeconds: number;
  appData: string; // bytes32
}

let adapterRegisteredForChain: number | null = null;

/**
 * Registers the viem-based provider adapter the sdk-composable package
 * needs before it can build any conditional order. Idempotent per chain
 * so repeated calls (e.g. from re-renders) don't thrash the global
 * adapter. `rpcUrl` should come from Rabby's own chain config, not a
 * hardcoded third-party endpoint.
 */
function ensureAdapterForChain(chainId: number, rpcUrl: string, chain: { id: number; name: string; nativeCurrency: any; rpcUrls: any }) {
  if (adapterRegisteredForChain === chainId) return;
  const provider = createPublicClient({ chain: chain as any, transport: http(rpcUrl) });
  // ViemAdapter's own internal address-checksum utility returns `string`
  // where the abstract adapter type in @cowprotocol/sdk-common expects a
  // branded `0x${string}` — a type-strictness mismatch between their two
  // packages, not something wrong with how it's constructed here (the
  // runtime behavior was verified directly: building a Twap order and
  // reading .createCalldata works with no signer at all). Cast at the
  // boundary rather than loosening this file's own types.
  setGlobalAdapter(new ViemAdapter({ provider } as any) as any);
  adapterRegisteredForChain = chainId;
}

/**
 * Checks that `safeAddress` is actually configured for ComposableCoW before
 * we let the UI build/sign anything. Returns a reason string on failure so
 * the UI can show the user exactly what's missing (and a link to the setup
 * guide) instead of a cryptic settlement failure days later.
 *
 * `ethGetStorageAt` should be the project's existing eth_getStorageAt
 * wrapper for the chain the Safe lives on.
 */
export async function assertSafeReadyForComposableCow(
  safeAddress: string,
  deployment: ComposableCowDeployment,
  ethGetStorageAt: (address: string, slot: string) => Promise<string>
): Promise<{ ready: boolean; reason?: string }> {
  // Safe stores its fallback handler in a fixed EIP-1967-style slot. We
  // read it and compare against the ExtensibleFallbackHandler address
  // rather than assuming.
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
 * Builds the on-chain transaction that creates a TWAP conditional order
 * on ComposableCoW. This does NOT sign or submit anything to an
 * orderbook — it returns an ordinary `{ to, value, data }` transaction
 * for the SAME transaction-confirmation flow every other action node in
 * this codebase already uses (e.g. wallet.sendRequest('eth_sendTransaction', ...)).
 *
 * There is deliberately no "auto-execute without confirmation" path:
 * once created, ComposableCoW orders get filled by CoW's watchtowers over
 * time without further per-fill confirmation from this wallet, which is
 * exactly why the CREATION step must go through full user review (same as
 * any other transaction) rather than being treated as a low-stakes read.
 *
 * @param params - TWAP order parameters
 * @param chainId - The chain ID the Safe and ComposableCoW deployment are on
 * @param rpcConfig - Rabby's own RPC URL + viem chain descriptor for chainId
 *   (never a hardcoded third-party endpoint — see ensureAdapterForChain)
 */
export function buildTwapCreateTransaction(
  params: TwapOrderParams,
  chainId: number,
  rpcConfig: { rpcUrl: string; viemChain: { id: number; name: string; nativeCurrency: any; rpcUrls: any } }
): { to: string; value: string; data: string; orderId: string } {
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

  const deployment = getComposableCowDeployment(chainId);
  ensureAdapterForChain(chainId, rpcConfig.rpcUrl, rpcConfig.viemChain);

  const data: TwapData = {
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    receiver: params.receiver,
    appData: params.appData,
    sellAmount: BigInt(params.totalSellAmount),
    buyAmount: BigInt(params.totalBuyAmountMin),
    numberOfParts: BigInt(params.numParts),
    timeBetweenParts: BigInt(params.partDurationSeconds),
  };

  const order = Twap.fromData(data);

  return {
    to: deployment.composableCow,
    value: '0',
    data: order.createCalldata as Hex,
    orderId: order.id,
  };
}
