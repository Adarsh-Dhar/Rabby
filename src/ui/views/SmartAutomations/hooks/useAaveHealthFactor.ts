import { useEffect, useState } from 'react';
import { useWallet } from '@/ui/utils';

// Ethereum mainnet Aave V3 Pool address
const AAVE_V3_POOL_ADDRESS = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

interface HealthFactorData {
  healthFactor: number | null;
  totalCollateralUSD: number | null;
  totalDebtUSD: number | null;
  loading: boolean;
  error: string | null;
}

export const useAaveHealthFactor = (address?: string): HealthFactorData => {
  const wallet = useWallet();
  const [data, setData] = useState<HealthFactorData>({
    healthFactor: null,
    totalCollateralUSD: null,
    totalDebtUSD: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!address) return;

    const loadHealthFactor = async () => {
      setData((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await wallet.getAaveUserAccountData({
          address,
          chainId: 1,
          poolAddress: AAVE_V3_POOL_ADDRESS,
        });

        // Convert from 18 decimals to normal numbers
        const healthFactor = Number(result.healthFactor) / 1e18;
        const totalCollateralUSD = Number(result.totalCollateralBase) / 1e18;
        const totalDebtUSD = Number(result.totalDebtBase) / 1e18;

        setData({
          healthFactor,
          totalCollateralUSD,
          totalDebtUSD,
          loading: false,
          error: null,
        });
      } catch (error) {
        setData({
          healthFactor: null,
          totalCollateralUSD: null,
          totalDebtUSD: null,
          loading: false,
          error: (error as Error).message,
        });
      }
    };

    loadHealthFactor();
  }, [address, wallet]);

  return data;
};
