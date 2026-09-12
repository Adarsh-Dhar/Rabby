import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/ui/component';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { Button, Card, Input, InputNumber, message } from 'antd';
import {
  buildLiquidationShieldWorkflow,
  buildYieldHarvesterWorkflow,
  buildStopLossWorkflow,
} from '../workflowTemplates';
import {
  WorkflowConsentModal,
  WorkflowConsentSummary,
} from '../components/WorkflowConsentModal';
import { ExecutionHistory } from '../components/ExecutionHistory';
import { useAaveHealthFactor } from '../hooks/useAaveHealthFactor';

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
    stopLossParams?: StopLossParams
  ) => Promise<{ nodes: any[]; edges: any[] }>;
  summary: (stopLossParams?: StopLossParams) => WorkflowConsentSummary;
  // Stop-loss needs a small form filled in before we can build the workflow.
  needsForm?: boolean;
}

const AUTOMATIONS: Record<AutomationType, AutomationConfig> = {
  'liquidation-shield': {
    label: 'Liquidation Shield (HF < 1.15)',
    build: (address) =>
      buildLiquidationShieldWorkflow({ address, healthFactorThreshold: 1.15 }),
    summary: () => ({
      protocol: 'Aave V3',
      action: 'Approve + repay debt',
      maxAmount: 'Full USDC debt balance (unlimited approval)',
      triggerCondition: 'Health Factor < 1.15',
      chain: 'Ethereum',
    }),
  },
  'yield-harvester': {
    label: 'Yield Harvester (Aave rewards)',
    build: (address) =>
      buildYieldHarvesterWorkflow({ address, protocols: ['aave-v3'] }),
    summary: () => ({
      protocol: 'Aave V3',
      action: 'Claim + compound rewards',
      maxAmount: 'All accrued rewards above gas threshold',
      triggerCondition: 'Rewards > gas-efficient threshold',
      chain: 'Ethereum',
    }),
  },
  'stop-loss': {
    label: 'Stop-Loss (Uniswap v3)',
    needsForm: true,
    build: (address, stopLossParams) => {
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
      action: 'Approve + swap to target token',
      maxAmount: 'Full position (unlimited approval)',
      triggerCondition: stopLossParams
        ? `Price of ${stopLossParams.tokenAddress.slice(0, 8)}… below ${
            stopLossParams.thresholdPrice
          }`
        : 'Price below threshold',
      chain: 'Ethereum',
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

  // Stop-loss form state
  const [stopLossForm, setStopLossForm] = useState<StopLossParams>({
    tokenAddress: '',
    thresholdPrice: 0,
    targetToken: '',
  });
  const [showStopLossForm, setShowStopLossForm] = useState(false);

  const healthFactorData = useAaveHealthFactor(account?.address);

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
        nodes: pendingWorkflow.nodes,
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
  }, [account?.address, pendingWorkflow, pendingType, wallet, load]);

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

      <Card size="small" className="mb-16" title="Aave V3 position">
        {healthFactorData.loading && <p>Loading position…</p>}
        {healthFactorData.error && (
          <p className="text-red-forbidden text-13">
            Couldn&apos;t load position: {healthFactorData.error}
          </p>
        )}
        {!healthFactorData.loading && !healthFactorData.error && (
          <div className="flex justify-between text-13">
            <span>
              Health Factor:{' '}
              {healthFactorData.healthFactor === 0
                ? '—'
                : healthFactorData.healthFactor?.toFixed(2)}
            </span>
            <span>
              Collateral: ${healthFactorData.totalCollateralUSD?.toFixed(2)}
            </span>
            <span>Debt: ${healthFactorData.totalDebtUSD?.toFixed(2)}</span>
          </div>
        )}
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
        />
      )}
    </div>
  );
};

export default SmartAutomations;
