import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/ui/component';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { Button, Card, Input, InputNumber, message, Select } from 'antd';
import {
  buildLiquidationShieldWorkflow,
  buildYieldHarvesterWorkflow,
  buildStopLossWorkflow,
  buildTwapWorkflow,
} from '../workflowTemplates';
import { listVerifiedChains, type ChainContracts } from '../chainRegistry';
import {
  WorkflowConsentModal,
  WorkflowConsentSummary,
} from '../components/WorkflowConsentModal';
import { ExecutionHistory } from '../components/ExecutionHistory';
import { useAaveHealthFactor } from '../hooks/useAaveHealthFactor';
import { applyRoleDelegation } from '../delegation/zodiacRoles';
import {
  useAaveForkPosition,
  useLidoPosition,
  useCowOpenOrders,
  SPARK_POOL_ADDRESS,
} from '../hooks/usePositions';

interface WorkflowRow {
  workflowId: string;
  type: string;
  lastKnownStatus?: string;
}

type AutomationType = 'liquidation-shield' | 'yield-harvester' | 'stop-loss' | 'twap';

interface StopLossParams {
  tokenAddress: string;
  thresholdPrice: number;
  targetToken: string;
}

interface TwapParams {
  sellToken: string;
  buyToken: string;
  totalSellAmount: string;
  totalBuyAmountMin: string;
  numParts: number;
  partDurationSeconds: number;
}

// Everything needed to render a card/button, build the workflow, and show
// the right consent summary for that workflow type.
interface AutomationConfig {
  label: string;
  build: (
    address: string,
    stopLossParams?: StopLossParams,
    twapParams?: TwapParams
  ) => Promise<{ nodes: any[]; edges: any[] }>;
  summary: (stopLossParams?: StopLossParams, twapParams?: TwapParams) => WorkflowConsentSummary;
  // Stop-loss and TWAP need small forms filled in before we can build the workflow.
  needsForm?: boolean;
  approveToken?: (params?: StopLossParams | TwapParams) => string;
}

const AUTOMATIONS: Record<AutomationType, AutomationConfig> = {
  'liquidation-shield': {
    label: 'Liquidation Shield (HF < 1.15)',
    build: (address) =>
      buildLiquidationShieldWorkflow({
        address,
        healthFactorThreshold: 1.15,
      }),
    summary: () => ({
      protocol: 'Aave V3',
      action: 'Web3 contract-based debt repayment',
      triggerCondition: 'Health Factor < 1.15',
      chain: 'Ethereum',
    }),
  },
  'yield-harvester': {
    label: 'Yield Harvester (claim to wallet)',
    // No approveToken: this only calls claimRewards(to: yourAddress) — it
    // pays rewards out to you, it doesn't spend an allowance, so there's
    // nothing to scope here. (It doesn't re-supply the claimed rewards —
    // it's a claim-to-wallet workflow, not compounding.)
    build: (address) =>
      buildYieldHarvesterWorkflow({ address, protocols: ['aave-v3'] }),
    summary: () => ({
      protocol: 'Aave V3',
      action: 'Web3 contract-based reward claiming',
      maxAmount: 'All accrued rewards above gas threshold',
      triggerCondition: 'Rewards > gas-efficient threshold',
      chain: 'Ethereum',
    }),
  },
  'stop-loss': {
    label: 'Stop-Loss (Uniswap v3)',
    needsForm: true,
    build: (address, stopLossParams, _twapParams) => {
      if (!stopLossParams) {
        throw new Error('Stop-loss requires token, threshold, and target token');
      }
      return buildStopLossWorkflow({
        address,
        tokenAddress: stopLossParams.tokenAddress,
        thresholdPrice: stopLossParams.thresholdPrice,
        targetToken: stopLossParams.targetToken,
      });
    },
    summary: (stopLossParams) => ({
      protocol: 'Uniswap V3',
      action: 'Web3 contract-based stop-loss swap',
      triggerCondition: stopLossParams
        ? `Price of ${stopLossParams.tokenAddress.slice(0, 8)}… below ${
            stopLossParams.thresholdPrice
          }`
        : 'Price below threshold',
      chain: 'Ethereum',
    }),
  },
  'twap': {
    label: 'TWAP (Uniswap v3)',
    needsForm: true,
    build: (address, _stopLossParams, twapParams) => {
      if (!twapParams) {
        throw new Error('TWAP requires sell token, buy token, amount, parts, and duration');
      }
      return buildTwapWorkflow({
        address,
        sellToken: twapParams.sellToken,
        buyToken: twapParams.buyToken,
        totalSellAmount: twapParams.totalSellAmount,
        totalBuyAmountMin: twapParams.totalBuyAmountMin,
        numParts: twapParams.numParts,
        partDurationSeconds: twapParams.partDurationSeconds,
      });
    },
    summary: (stopLossParams, twapParams) => ({
      protocol: 'Uniswap V3',
      action: 'AI-generated TWAP swap',
      triggerCondition: twapParams
        ? `${twapParams.numParts} parts over ${twapParams.partDurationSeconds}s each`
        : 'TWAP schedule',
      chain: 'Ethereum',
      tokenSymbol: twapParams?.sellToken?.slice(0, 8) || 'sell token',
    }),
  },
};

const SmartAutomations = () => {
  const wallet = useWallet();
  const account = useCurrentAccount();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string | null>(
    null
  );
  const [selectedChain, setSelectedChain] = useState<ChainContracts | null>(null);

  // Consent modal state
  const [showConsent, setShowConsent] = useState(false);
  const [pendingType, setPendingType] = useState<AutomationType | null>(null);
  const [pendingWorkflow, setPendingWorkflow] = useState<{
    nodes: any[];
    edges: any[];
  } | null>(null);

  // Stop-loss form state
  const [stopLossForm, setStopLossForm] = useState<StopLossParams>({
    tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    thresholdPrice: 2000,
    targetToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  });
  const [showStopLossForm, setShowStopLossForm] = useState(false);

  // TWAP form state
  const [twapForm, setTwapForm] = useState<TwapParams>({
    sellToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    buyToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    totalSellAmount: '1000000000000000000', // 1 WETH in wei
    totalBuyAmountMin: '2000000000', // 2000 USDC (assuming 1 ETH = $2000)
    numParts: 10,
    partDurationSeconds: 3600,
  });
  const [showTwapForm, setShowTwapForm] = useState(false);

  const healthFactorData = useAaveHealthFactor(account?.address);
  const sparkData = useAaveForkPosition(
    account?.address,
    SPARK_POOL_ADDRESS,
    1
  );
  const lidoData = useLidoPosition(account?.address);
  const cowData = useCowOpenOrders(account?.address);

  const load = useCallback(async () => {
    if (!account?.address) return;
    const [keyStatus, list] = await Promise.all([
      wallet.getKeeperhubApiKeyStatus(),
      wallet.getKeeperhubWorkflows(account.address),
    ]);
    setHasApiKey(keyStatus);
    setWorkflows(list);
  }, [wallet, account?.address]);

  useEffect(() => {
    load();
  }, [load]);

  // Initialize selected chain with the first verified chain
  useEffect(() => {
    const verifiedChains = listVerifiedChains();
    if (verifiedChains.length > 0 && !selectedChain) {
      setSelectedChain(verifiedChains[0]);
    }
  }, [selectedChain]);

  const handlePrepareAutomation = useCallback(
    async (type: AutomationType, stopLossParams?: StopLossParams, twapParams?: TwapParams) => {
      if (!account?.address) return;
      try {
        const built = await AUTOMATIONS[type].build(
          account.address,
          stopLossParams,
          twapParams
        );
        setPendingType(type);
        setPendingWorkflow(built);
        setShowConsent(true);
      } catch (e) {
        message.error((e as Error).message);
      }
    },
    [account?.address]
  );

  const handleAutomationButtonClick = useCallback(
    (type: AutomationType) => {
      if (AUTOMATIONS[type].needsForm) {
        if (type === 'stop-loss') {
          setShowStopLossForm(true);
        } else if (type === 'twap') {
          setShowTwapForm(true);
        }
        return;
      }
      handlePrepareAutomation(type);
    },
    [handlePrepareAutomation]
  );

  const handleConfirmStopLossForm = useCallback(() => {
    if (
      !stopLossForm.tokenAddress ||
      !stopLossForm.targetToken ||
      !stopLossForm.thresholdPrice
    ) {
      message.error('Fill in token to watch, threshold price, and target token');
      return;
    }
    setShowStopLossForm(false);
    handlePrepareAutomation('stop-loss', stopLossForm);
  }, [stopLossForm, handlePrepareAutomation]);

  const handleConfirmTwapForm = useCallback(() => {
    if (
      !twapForm.sellToken ||
      !twapForm.buyToken ||
      !twapForm.totalSellAmount ||
      !twapForm.totalBuyAmountMin ||
      !twapForm.numParts ||
      !twapForm.partDurationSeconds
    ) {
      message.error('Fill in sell token, buy token, amounts, parts, and duration');
      return;
    }
    setShowTwapForm(false);
    handlePrepareAutomation('twap', undefined, twapForm);
  }, [twapForm, handlePrepareAutomation]);

  const handleConfirmCreate = useCallback(async () => {
    if (!account?.address || !pendingWorkflow || !pendingType) return;

    try {
      let nodesToSubmit = pendingWorkflow.nodes;
      // Approval amount handling removed - AI generation handles proper action types
      // The KeeperHub AI generates workflows with correct protocol-specific action types

      // If the user has configured a Safe + Zodiac Roles Modifier, route
      // execution through the role instead of executing directly — see
      // DelegationSettings.tsx / delegation/zodiacRoles.ts. This runs after
      // scopeApproveNodeAmounts so the role wraps the already-capped amount.
      try {
        const roleDelegation = await wallet.getRoleDelegation(account.address);
        if (roleDelegation) {
          nodesToSubmit = applyRoleDelegation(nodesToSubmit as any, roleDelegation) as any;
        }
      } catch (delegationError) {
        console.error('Failed to get role delegation:', delegationError);
        // Continue without role delegation if it fails
      }

      setLoading(true);
      try {
        await wallet.createKeeperhubWorkflow({
          address: account.address,
          chainId: selectedChain?.chainId ?? 1,
          type: pendingType,
          name: `${AUTOMATIONS[pendingType].label} - ${account.address.slice(
            0,
            6
          )}`,
          nodes: nodesToSubmit,
          edges: pendingWorkflow.edges,
        });
        message.success('Automation created');
        setShowConsent(false);
        setPendingType(null);
        setPendingWorkflow(null);
        await load();
      } catch (e) {
        const errorMessage = (e as Error).message;
        if (errorMessage.includes('API key')) {
          message.error(
            'KeeperHub API key is not configured. Please check your settings.'
          );
        } else {
          message.error(errorMessage);
        }
      } finally {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error in handleConfirmCreate:', error);
      message.error('Failed to create automation. Please try again.');
    }
  }, [
    account?.address,
    pendingWorkflow,
    pendingType,
    wallet,
    load,
    stopLossForm,
    twapForm,
    selectedChain,
  ]);

  const handleCancelConsent = useCallback(() => {
    setShowConsent(false);
    setPendingType(null);
    setPendingWorkflow(null);
  }, []);

  const handleCancelTwapForm = useCallback(() => {
    setShowTwapForm(false);
  }, []);

  const isHealthFactorSafe = useMemo(() => {
    const hf = healthFactorData.healthFactor;
    // No debt shows up as an enormous/zero-division healthFactor from Aave;
    // treat "safe" the same as "no debt to protect".
    return hf === null ? false : hf === 0 || hf > 3;
  }, [healthFactorData.healthFactor]);

  if (!hasApiKey) {
    return (
      <div className="p-20">
        <PageHeader>Smart Automations</PageHeader>
        <p className="text-r-neutral-body">
          Connect a KeeperHub API key in Settings to enable automations for this
          account.
        </p>
      </div>
    );
  }

  return (
    <div className="p-20">
      <PageHeader>Smart Automations</PageHeader>

      <Card size="small" className="mb-16" title={`Discovery — ${selectedChain?.label || 'Select a chain'}`}>
        <div className="flex flex-col gap-8 text-13">
          <div className="flex justify-between items-center">
            <span>Chain</span>
            <Select
              value={selectedChain?.label}
              onChange={(value) => {
                const chain = listVerifiedChains().find((c) => c.label === value);
                if (chain) setSelectedChain(chain);
              }}
              style={{ width: 200 }}
            >
              {listVerifiedChains().map((chain) => (
                <Select.Option key={chain.label} value={chain.label}>
                  {chain.label}
                </Select.Option>
              ))}
            </Select>
          </div>

          {selectedChain?.aaveV3Pool && (
            <div className="flex justify-between">
              <span>Aave V3</span>
              {healthFactorData.loading && <span>Loading…</span>}
              {healthFactorData.error && (
                <span className="text-red-forbidden">Error</span>
              )}
              {!healthFactorData.loading && !healthFactorData.error && (
                <span>
                  HF{' '}
                  {healthFactorData.healthFactor === 0
                    ? '—'
                    : healthFactorData.healthFactor?.toFixed(2)}{' '}
                  · Debt ${healthFactorData.totalDebtUSD?.toFixed(2)}
                </span>
              )}
            </div>
          )}

          {selectedChain?.sparkPool && (
            <div className="flex justify-between">
              <span>Spark</span>
              {sparkData.loading && <span>Loading…</span>}
              {sparkData.error && <span className="text-red-forbidden">Error</span>}
              {!sparkData.loading && !sparkData.error && (
                <span>
                  HF{' '}
                  {sparkData.healthFactor === 0
                    ? '—'
                    : sparkData.healthFactor?.toFixed(2)}{' '}
                  · Debt ${sparkData.totalDebtUSD?.toFixed(2)}
                </span>
              )}
            </div>
          )}

          {selectedChain?.lidoStEth && (
            <div className="flex justify-between">
              <span>Lido</span>
              {lidoData.loading && <span>Loading…</span>}
              {lidoData.error && <span className="text-red-forbidden">Error</span>}
              {!lidoData.loading && !lidoData.error && (
                <span>{lidoData.stEthBalance?.toFixed(4)} stETH</span>
              )}
            </div>
          )}

          <div className="flex justify-between">
            <span>CoW Swap</span>
            {cowData.loading && <span>Loading…</span>}
            {cowData.error && <span className="text-red-forbidden">Error</span>}
            {!cowData.loading && !cowData.error && (
              <span>{cowData.openOrderCount ?? 0} open orders</span>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-8">
        {(Object.keys(AUTOMATIONS) as AutomationType[]).map((type) => {
          const disabled = type === 'liquidation-shield' && isHealthFactorSafe;
          return (
            <div key={type}>
              <Button
                type="primary"
                disabled={disabled}
                onClick={() => handleAutomationButtonClick(type)}
              >
                {AUTOMATIONS[type].label}
              </Button>
              {disabled && (
                <p className="text-r-neutral-foot text-12 mt-4">
                  Health Factor already looks safe — no debt or HF above 3.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {showStopLossForm && (
        <Card size="small" className="mt-16" title="Stop-loss settings">
          <div className="flex flex-col gap-8">
            <Input
              placeholder="Token address to watch"
              value={stopLossForm.tokenAddress}
              onChange={(e) =>
                setStopLossForm((f) => ({
                  ...f,
                  tokenAddress: e.target.value,
                }))
              }
            />
            <InputNumber
              className="w-full"
              placeholder="Threshold price (USD)"
              value={stopLossForm.thresholdPrice || undefined}
              onChange={(v) =>
                setStopLossForm((f) => ({
                  ...f,
                  thresholdPrice: typeof v === 'number' ? v : 0,
                }))
              }
            />
            <Input
              placeholder="Target token address (e.g. USDC)"
              value={stopLossForm.targetToken}
              onChange={(e) =>
                setStopLossForm((f) => ({ ...f, targetToken: e.target.value }))
              }
            />
            <div className="flex gap-8">
              <Button type="primary" onClick={handleConfirmStopLossForm}>
                Continue
              </Button>
              <Button onClick={() => setShowStopLossForm(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {showTwapForm && (
        <Card size="small" className="mt-16" title="TWAP settings">
          <div className="flex flex-col gap-8">
            <Input
              placeholder="Sell token address"
              value={twapForm.sellToken}
              onChange={(e) =>
                setTwapForm((f) => ({
                  ...f,
                  sellToken: e.target.value,
                }))
              }
            />
            <Input
              placeholder="Buy token address"
              value={twapForm.buyToken}
              onChange={(e) =>
                setTwapForm((f) => ({ ...f, buyToken: e.target.value }))
              }
            />
            <Input
              placeholder="Total sell amount (in wei/base units)"
              value={twapForm.totalSellAmount}
              onChange={(e) =>
                setTwapForm((f) => ({ ...f, totalSellAmount: e.target.value }))
              }
            />
            <Input
              placeholder="Minimum total buy amount (in wei/base units)"
              value={twapForm.totalBuyAmountMin}
              onChange={(e) =>
                setTwapForm((f) => ({ ...f, totalBuyAmountMin: e.target.value }))
              }
            />
            <InputNumber
              className="w-full"
              placeholder="Number of parts"
              value={twapForm.numParts}
              onChange={(v) =>
                setTwapForm((f) => ({
                  ...f,
                  numParts: typeof v === 'number' ? v : 10,
                }))
              }
            />
            <InputNumber
              className="w-full"
              placeholder="Duration per part (seconds)"
              value={twapForm.partDurationSeconds}
              onChange={(v) =>
                setTwapForm((f) => ({
                  ...f,
                  partDurationSeconds: typeof v === 'number' ? v : 3600,
                }))
              }
            />
            <div className="flex gap-8">
              <Button type="primary" onClick={handleConfirmTwapForm}>
                Continue
              </Button>
              <Button onClick={handleCancelTwapForm}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-16">
        {workflows.map((w) => (
          <div key={w.workflowId} className="border-b py-8">
            <div
              className="flex justify-between cursor-pointer"
              onClick={() =>
                setExpandedWorkflowId((id) =>
                  id === w.workflowId ? null : w.workflowId
                )
              }
            >
              <span>{w.type}</span>
              <span>{w.lastKnownStatus || 'unknown'}</span>
            </div>
            {expandedWorkflowId === w.workflowId && account?.address && (
              <ExecutionHistory
                address={account.address}
                workflowId={w.workflowId}
              />
            )}
          </div>
        ))}
      </div>

      {pendingType && (
        <WorkflowConsentModal
          visible={showConsent}
          workflowType={AUTOMATIONS[pendingType].label}
          summary={AUTOMATIONS[pendingType].summary(
            pendingType === 'stop-loss' ? stopLossForm : pendingType === 'twap' ? twapForm : undefined,
            pendingType === 'stop-loss' ? undefined : pendingType === 'twap' ? twapForm : undefined
          )}
          onConfirm={handleConfirmCreate}
          onCancel={handleCancelConsent}
          loading={loading}
        />
      )}
    </div>
  );
};

export default SmartAutomations;
