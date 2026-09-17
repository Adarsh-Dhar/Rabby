import { useEffect, useState } from 'react';

interface HealthFactorState {
  loading: boolean;
  error: string | null;
  healthFactor: number;
  totalDebtUSD: number;
}

/**
 * Stub of `useAaveHealthFactor`. Simulates a short fetch then resolves to a
 * demo position so the Discovery card's color-coded health factor is visible.
 */
export const useAaveHealthFactor = (address?: string): HealthFactorState => {
  const [state, setState] = useState<HealthFactorState>({
    loading: true,
    error: null,
    healthFactor: 0,
    totalDebtUSD: 0,
  });

  useEffect(() => {
    if (!address) return;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      setState({
        loading: false,
        error: null,
        healthFactor: 1.42,
        totalDebtUSD: 12450.87,
      });
    }, 600);
    return () => clearTimeout(t);
  }, [address]);

  return state;
};

export default useAaveHealthFactor;
