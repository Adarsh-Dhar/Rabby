/**
 * Multi-chain contract registry for Smart Automations.
 *
 * WHY THIS EXISTS: workflowTemplates.ts, usePositions.ts, and home.tsx were
 * all hardcoding `network: '1'` / `chainId: 1`. That's not a real multi-chain
 * gap you can patch by find-and-replace — every address below moves real
 * funds (approve/repay/swap targets), so a wrong entry here is a fund-loss
 * bug, not a cosmetic one. This file is the ONE place those addresses live,
 * so extending to a new chain means adding a verified row here, not hunting
 * through workflow builders.
 *
 * RULE FOR ADDING A CHAIN: only add an entry once you (a human) have checked
 * the address against the protocol's own docs or a block explorer's
 * "verified contract" page, ideally two independent sources. Do not add an
 * address because it "looks right" or was pattern-matched from mainnet.
 * `verified: false` entries are refused at runtime (see assertChainVerified)
 * so a half-filled-in row can't silently ship.
 */

export type SupportedChainKey = 'ethereum' | 'base' | 'arbitrum';

export interface ChainContracts {
  chainId: number;
  /** Numeric chainId as the string form KeeperHub's `network` field expects. */
  network: string;
  label: string;
  /** Rabby's internal chain serverId (e.g. 'eth', 'base') for RPC calls */
  serverId: string;
  aaveV3Pool?: string;
  sparkPool?: string;
  lidoStEth?: string;
  usdc?: string;
  uniswapV3Router?: string;
  /** Set once a human has verified every address above against a primary source. */
  verified: boolean;
  verifiedAgainst?: string;
}

export const CHAIN_REGISTRY: Record<SupportedChainKey, ChainContracts> = {
  ethereum: {
    chainId: 1,
    network: '1',
    label: 'Ethereum Mainnet',
    serverId: 'eth',
    aaveV3Pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    sparkPool: '0xC13e21B648A5Ee794902342038FF3aDAB66BE987',
    lidoStEth: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    uniswapV3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    verified: true,
    verifiedAgainst:
      'Etherscan verified-source pages, cross-checked against Aave/Spark/Lido official docs',
  },
  base: {
    chainId: 8453,
    network: '8453',
    label: 'Base',
    serverId: 'base',
    aaveV3Pool: '0xA238Dd80c45528fE416F5A48935Ad7213c52e3d4', // VERIFY: cross-check against @bgd-labs/aave-address-book
    usdc: '0x833589fCD6eDb6E08f4c72532eF7C0Fa09EB7B44', // VERIFY: cross-check against Circle's official contract list
    uniswapV3Router: '0x3fC91A3afd70395Cd4963868e85F0694D1c7597B', // VERIFY: cross-check against Uniswap official docs
    verified: false,
    verifiedAgainst: undefined, // Must verify all addresses against official protocol docs before setting verified: true
  },
  arbitrum: {
    chainId: 42161,
    network: '42161',
    label: 'Arbitrum One',
    serverId: 'arbitrum',
    aaveV3Pool: '0x794a61358D6845594F94dc1DB02A252b5b1651F9', // VERIFY: cross-check against @bgd-labs/aave-address-book
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // VERIFY: cross-check against Circle's official contract list
    uniswapV3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564', // VERIFY: confirm CREATE2 deployment on Arbitrum
    verified: false,
    verifiedAgainst: undefined, // Must verify all addresses against official protocol docs before setting verified: true
  },
};

export class UnverifiedChainError extends Error {
  constructor(chain: string) {
    super(
      `Chain "${chain}" is not marked verified in chainRegistry.ts. Refusing to build` +
        ` a workflow against it — add real, verified contract addresses first.`
    );
    this.name = 'UnverifiedChainError';
  }
}

/** Every workflow builder should call this before reading chain contracts. */
export function getChainContracts(chain: SupportedChainKey): ChainContracts {
  const entry = CHAIN_REGISTRY[chain];
  if (!entry || !entry.verified) {
    throw new UnverifiedChainError(chain);
  }
  return entry;
}

export function listVerifiedChains(): ChainContracts[] {
  return Object.values(CHAIN_REGISTRY).filter((c) => c.verified);
}

/**
 * Adapter to convert Rabby's chain data to viem's Chain shape for cowTwap.ts.
 * This builds a minimal viem Chain object from what Rabby already has.
 *
 * `nativeCurrency` must be passed in by the caller from Rabby's own chain
 * data (`findChain(...).nativeTokenSymbol` / `.nativeTokenDecimals`) rather
 * than hardcoded here — an earlier version hardcoded `symbol: 'ETH'`
 * unconditionally, which happens to be correct for the 3 chains currently
 * in CHAIN_REGISTRY (all ETH-native) but would silently mislabel the first
 * non-ETH chain added later.
 *
 * `rpcUrls` is populated with an empty list deliberately: the transport
 * used with this chain object is viem's `custom()` (proxied through
 * Rabby's own `wallet.requestETHRpc`), which never consults
 * `chain.rpcUrls` — see cowTwap.ts's `ensureAdapterForChain` for why a
 * plain RPC URL string isn't used here.
 */
export function chainToViemChain(
  chain: ChainContracts,
  nativeCurrency: { name: string; symbol: string; decimals: number }
): {
  id: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { default: { http: string[] } };
} {
  return {
    id: chain.chainId,
    name: chain.label,
    nativeCurrency,
    rpcUrls: {
      default: {
        http: [],
      },
    },
  };
}
