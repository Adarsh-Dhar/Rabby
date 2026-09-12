import { useEffect, useState } from 'react';
import { useWallet } from '@/ui/utils';

// Ethereum mainnet pool addresses. Verified against Etherscan / Spark docs —
// do NOT copy these to another chain without re-verifying the address for
// that chain; Aave/Spark deploy separate Pool contracts per network.
export const SPARK_POOL_ADDRESS = '0xC13e21B648A5Ee794902342038FF3aDAB66BE987';
export const LIDO_STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';

interface AaveForkPositionData {
  healthFactor: number | null;
  totalCollateralUSD: number | null;
  totalDebtUSD: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * Generic reader for any Aave V3 fork's Pool.getUserAccountData(address) —
 * Spark uses the same interface as Aave V3, just a different Pool address.
 * Reuses the existing wallet.getAaveUserAccountData background method, which
 * already takes poolAddress/chainId as parameters.
 */
export const useAaveForkPosition = (
  address: string | undefined,
  poolAddress: string,
  chainId = 1
): AaveForkPositionData => {
  const wallet = useWallet();
  const [data, setData] = useState<AaveForkPositionData>({
    healthFactor: null,
    totalCollateralUSD: null,
    totalDebtUSD: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    const load = async () => {
      setData((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await wallet.getAaveUserAccountData({
          address,
          chainId,
          poolAddress,
        });
        if (cancelled) return;
        setData({
          healthFactor: Number(result.healthFactor) / 1e18,
          totalCollateralUSD: Number(result.totalCollateralBase) / 1e18,
          totalDebtUSD: Number(result.totalDebtBase) / 1e18,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        setData({
          healthFactor: null,
          totalCollateralUSD: null,
          totalDebtUSD: null,
          loading: false,
          error: (error as Error).message,
        });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [address, poolAddress, chainId, wallet]);

  return data;
};

interface LidoPositionData {
  stEthBalance: number | null;
  loading: boolean;
  error: string | null;
}

/** Reads the connected address's stETH balance (Ethereum mainnet only). */
export const useLidoPosition = (address: string | undefined): LidoPositionData => {
  const wallet = useWallet();
  const [data, setData] = useState<LidoPositionData>({
    stEthBalance: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    const load = async () => {
      setData((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await wallet.getErc20DecimalsAndBalance({
          address,
          tokenAddress: LIDO_STETH_ADDRESS,
          chainId: 1,
        });
        if (cancelled) return;
        setData({
          stEthBalance: Number(result.balance) / 10 ** Number(result.decimals),
          loading: false,
          error: null,
        });
      } catch (error) {
        if (cancelled) return;
        setData({ stEthBalance: null, loading: false, error: (error as Error).message });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [address, wallet]);

  return data;
};

interface CowOpenOrdersData {
  openOrderCount: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * Reads open CoW Protocol orders for the address via CoW's public orderbook
 * API — this is a read-only GET against a public REST endpoint, no API key,
 * no wallet interaction. This does NOT create or manage orders; it only
 * surfaces whether the account has any live CoW orders for the Discovery view.
 */
export const useCowOpenOrders = (address: string | undefined): CowOpenOrdersData => {
  const [data, setData] = useState<CowOpenOrdersData>({
    openOrderCount: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    const load = async () => {
      setData((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(
          `https://api.cow.fi/mainnet/api/v1/account/${address}/orders?offset=0&limit=50`
        );
        if (!res.ok) {
          throw new Error(`CoW API returned ${res.status}`);
        }
        const orders = (await res.json()) as Array<{ status: string }>;
        if (cancelled) return;
        const openCount = orders.filter((o) => o.status === 'open').length;
        setData({ openOrderCount: openCount, loading: false, error: null });
      } catch (error) {
        if (cancelled) return;
        setData({ openOrderCount: null, loading: false, error: (error as Error).message });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return data;
};
