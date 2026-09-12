import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import { PageHeader } from '@/ui/component';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { Button, Card, Input, InputNumber, message } from 'antd';
import {
  buildLiquidationShieldWorkflow,
  buildYieldHarvesterWorkflow,
  buildStopLossWorkflow,
  scopeApproveNodeAmounts,
  USDC_ADDRESS,
  MAX_UINT256,
} from '../workflowTemplates';
import {
  WorkflowConsentModal,
  WorkflowConsentSummary,
} from '../components/WorkflowConsentModal';
import { ExecutionHistory } from '../components/ExecutionHistory';
import { useAaveHealthFactor } from '../hooks/useAaveHealthFactor';
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

type AutomationType = 'liquidation-shield' | 'yield-harvester' | 'stop-loss';

interface StopLossParams {
  tokenAddress: string;
  thresholdPrice: number;
  targetToken: string;
}

// Everything needed to render a card/button, build the workflow, and show
// the right consent summary for that workflow type.
interface AutomationConfig {
  label: string;
  build: (
    address: string,
    stopLossParams?: StopLossParams,
    approveAmount?: string
  ) => Promise<{ nodes: any[]; edges: any[] }>;
  summary: (stopLossParams?: StopLossParams) => WorkflowConsentSummary;
  // Stop-loss needs a small form filled in before we can build the workflow.
  needsForm?: boolean;
  // Token being approved for this automation's approve node, if any. Used to
  // drive the scoped-amount control in the consent modal — omit for
  // automations (like yield-harvester) that don't spend the user's tokens.
  approveToken?: (stopLossParams?: StopLossParams) => string | undefined;
}

const AUTOMATIONS: Record<AutomationType, AutomationConfig> = {
  'liquidation-shield': {
    label: 'Liquidation Shield (HF < 1.15)',
    build: (address, _stopLossParams, approveAmount) =>
      buildLiquidationShieldWorkflow({
        address,
        healthFactorThreshold: 1.15,
        approveAmount,
      }),
    approveToken: () => USDC_ADDRESS,
    summary: () => ({
      protocol: 'Aave V3',
      action: 'Approve + repay debt',
      maxAmount: 'Full USDC debt balance (unlimited approval)',
      triggerCondition: 'Health Factor < 1.15',
      chain: 'Ethereum',
      tokenSymbol: 'USDC',
    }),
  },
  'yield-harvester': {
    label: 'Yield Harvester (Aave rewards)',
    // No approveToken: this only calls claimRewards(to: yourAddress) — it
    // pays rewards out to you, it doesn't spend an allowance, so there's
    // nothing to scope here. (It also doesn't currently re-supply/compound
    // the claimed rewards despite the label — see workflowTemplates.ts.)
    build: (address) =>
      buildYieldHarvesterWorkflow({ address, protocols: ['aave-v3'] }),
    summary: () => ({
      protocol: 'Aave V3',
      action: 'Claim rewards to your wallet',
      maxAmount: 'All accrued rewards above gas threshold',
      triggerCondition: 'Rewards > gas-efficient threshold',
      chain: 'Ethereum',
    }),
  },
  'stop-loss': {
    label: 'Stop-Loss (Uniswap v3)',
    needsForm: true,
    approveToken: (stopLossParams) => stopLossParams?.tokenAddress,
    build: (address, stopLossParams, approveAmount) => {
      if (!stopLossParams) {
        throw new Error('Stop-loss requires token, threshold, and target token');
      }
      return buildStopLossWorkflow({
        address,
        tokenAddress: stopLossParams.tokenAddress,
        thresholdPrice: stopLossParams.thresholdPrice,
        targetToken: stopLossParams.targetToken,
        approveAmount,
      });
    },
    summary: (stopLossParams) => ({
      protocol: 'Uniswap V3',
      action: 'Approve + swap to target token',
      maxAmount: 'Full position (unlimited approval)',
      triggerCondition: stopLossParams
        ? `Price of ${stopLossParams.tokenAddress.slice(0, 8)}… below ${
            stopLossParams.thresholdPrice
          }`
        : 'Price below threshold',
      chain: 'Ethereum',
      tokenSymbol: 'the watched token',
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

  // Consent modal state
  const [showConsent, setShowConsent] = useState(false);
  const [pendingType, setPendingType] = useState<AutomationType | null>(null);
  const [pendingWorkflow, setPendingWorkflow] = useState<{
    nodes: any[];
    edges: any[];
  } | null>(null);

  // Scoped-approval state for the consent modal. `decimals` is fetched for
  // whichever token the pending automation approves, so the human-entered
  // amount can be converted to the raw base-unit string the approve node
  // needs. Defaults to unlimited=true is intentionally NOT the default —
  // the person has to actively opt into unlimited approval.
  const [approveDecimals, setApproveDecimals] = useState<number | null>(null);
  const [approveAmountInput, setApproveAmountInput] = useState('');
  const [unlimitedApproval, setUnlimitedApproval] = useState(false);
  const [approveAmountError, setApproveAmountError] = useState<string | null>(
    null
  );

  // Stop-loss form state
  const [stopLossForm, setStopLossForm] = useState<StopLossParams>({
    tokenAddress: '',
    thresholdPrice: 0,
    targetToken: '',
  });
  const [showStopLossForm, setShowStopLossForm] = useState(false);

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

  // Once a workflow is staged for consent, look up the decimals of whatever
  // token its approve node would spend, so the amount input in the modal can
  // work in human units instead of raw base units.
  useEffect(() => {
    if (!pendingType || !account?.address) return;
    const tokenAddress = AUTOMATIONS[pendingType].approveToken?.(
      pendingType === 'stop-loss' ? stopLossForm : undefined
    );
    if (!tokenAddress) {
      setApproveDecimals(null);
      return;
    }
    let cancelled = false;
    wallet
      .getErc20DecimalsAndBalance({
        address: account.address,
        tokenAddress,
        chainId: 1,
      })
      .then((res) => {
        if (!cancelled) setApproveDecimals(res.decimals);
      })
      .catch(() => {
        // If decimals can't be read (bad address, RPC error), fall back to
        // requiring the unlimited checkbox rather than guessing a decimals
        // value — guessing here could silently under- or over-scope by
        // orders of magnitude.
        if (!cancelled) setApproveDecimals(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pendingType, account?.address, wallet, stopLossForm]);

  useEffect(() => {
    if (!approveAmountInput || unlimitedApproval) {
      setApproveAmountError(null);
      return;
    }
    const n = Number(approveAmountInput);
    if (!Number.isFinite(n) || n <= 0) {
      setApproveAmountError('Enter a positive amount');
    } else {
      setApproveAmountError(null);
    }
  }, [approveAmountInput, unlimitedApproval]);

  const handlePrepareAutomation = useCallback(
    async (type: AutomationType, stopLossParams?: StopLossParams) => {
      if (!account?.address) return;
      try {
        const built = await AUTOMATIONS[type].build(
          account.address,
          stopLossParams
        );
        setPendingType(type);
        setPendingWorkflow(built);
        setApproveAmountInput('');
        setUnlimitedApproval(false);
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
        setShowStopLossForm(true);
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

  const handleConfirmCreate = useCallback(async () => {
    if (!account?.address || !pendingWorkflow || !pendingType) return;

    const approveToken = AUTOMATIONS[pendingType].approveToken?.(
      pendingType === 'stop-loss' ? stopLossForm : undefined
    );

    let nodesToSubmit = pendingWorkflow.nodes;
    if (approveToken) {
      if (!unlimitedApproval) {
        if (approveDecimals === null) {
          message.error(
            "Couldn't verify this token's decimals — check the address or use unlimited approval."
          );
          return;
        }
        if (!approveAmountInput || approveAmountError) {
          message.error('Enter a valid approval amount, or allow unlimited approval.');
          return;
        }
      }
      const rawAmount = unlimitedApproval
        ? MAX_UINT256
        : parseUnits(approveAmountInput, approveDecimals!).toString();
      nodesToSubmit = scopeApproveNodeAmounts(pendingWorkflow.nodes, rawAmount);
    }

    setLoading(true);
    try {
      await wallet.createKeeperhubWorkflow({
        address: account.address,
        chainId: 1,
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
  }, [
    account?.address,
    pendingWorkflow,
    pendingType,
    wallet,
    load,
    stopLossForm,
    unlimitedApproval,
    approveDecimals,
    approveAmountInput,
    approveAmountError,
  ]);

  const handleCancelConsent = useCallback(() => {
    setShowConsent(false);
    setPendingType(null);
    setPendingWorkflow(null);
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

      <Card size="small" className="mb-16" title="Discovery — Ethereum mainnet">
        <div className="flex flex-col gap-8 text-13">
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
          <div className="flex justify-between">
            <span>Lido</span>
            {lidoData.loading && <span>Loading…</span>}
            {lidoData.error && <span className="text-red-forbidden">Error</span>}
            {!lidoData.loading && !lidoData.error && (
              <span>{lidoData.stEthBalance?.toFixed(4)} stETH</span>
            )}
          </div>
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
            pendingType === 'stop-loss' ? stopLossForm : undefined
          )}
          onConfirm={handleConfirmCreate}
          onCancel={handleCancelConsent}
          loading={loading}
          amount={approveAmountInput}
          onAmountChange={setApproveAmountInput}
          unlimited={unlimitedApproval}
          onUnlimitedChange={setUnlimitedApproval}
          amountError={approveAmountError}
        />
      )}
    </div>
  );
};

export default SmartAutomations;
