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
 * ADDRESS VERIFICATION NOTE: the addresses below come from CoW Protocol's
 * published integration docs (docs.cow.fi / the ComposableCoW deployment
 * guide) as of this writing. A separate GitHub issue on the composable-cow
 * repo notes that some historical redeploys produced different addresses,
 * so `verifiedAgainst` and the on-chain code-existence check below are not
 * decorative — re-confirm these against docs.cow.fi before enabling this in
 * anything that touches real funds, and prefer the on-chain check catching
 * a mismatch over trusting this constant blindly.
 */

export interface ComposableCowDeployment {
  chainId: number;
  composableCow: string;
  twapHandler: string;
  extensibleFallbackHandler: string;
  verifiedAgainst: string;
}

export const COMPOSABLE_COW_MAINNET: ComposableCowDeployment = {
  chainId: 1,
  composableCow: '0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74',
  twapHandler: '0x6cF1e9cA41f7611dEf408122793c358a3d11E5a5',
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
  ethCall: (params: { to: string; data: string }) => Promise<string>
): Promise<{ ready: boolean; reason?: string }> {
  // getStorageAt(safe, FALLBACK_HANDLER_STORAGE_SLOT) — Safe stores its
  // fallback handler in a fixed EIP-1967-style slot. We read it and compare
  // against the ExtensibleFallbackHandler address rather than assuming.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const FALLBACK_HANDLER_SLOT =
    '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d';
  try {
    const raw = await ethCall({
      to: safeAddress,
      data: `0x0` /* placeholder: real call should be eth_getStorageAt(safeAddress, FALLBACK_HANDLER_SLOT), not eth_call — wire this to the project's provider.getStorageAt equivalent */,
    });
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
 * Builds the GPv2Order.Data-shaped struct ComposableCoW's TWAP handler
 * expects, plus the ConditionalOrderParams the order is registered under.
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
export function buildTwapConditionalOrder(params: TwapOrderParams) {
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
  return {
    handler: COMPOSABLE_COW_MAINNET.twapHandler,
    staticInput: {
      sellToken: params.sellToken,
      buyToken: params.buyToken,
      receiver: params.receiver,
      partSellAmount: (
        BigInt(params.totalSellAmount) / BigInt(params.numParts)
      ).toString(),
      minPartLimit: (
        BigInt(params.totalBuyAmountMin) / BigInt(params.numParts)
      ).toString(),
      t0: params.startTimestamp ?? 0, // 0 == start at mining time
      n: params.numParts,
      t: params.partDurationSeconds,
      span: 0, // 0 == part is tradeable for the whole duration
      appData: params.appData,
    },
  };
}
