import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { parseUnits } from 'viem';
import { PageHeader } from '@/ui/component';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { Button, Card, Input, InputNumber, message, Select } from 'antd';
import { findChain } from '@/utils/chain';
import {
  buildLiquidationShieldWorkflow,
  buildYieldHarvesterWorkflow,
  buildStopLossWorkflow,
  buildTwapWorkflow,
  scopeApproveNodeAmounts,
  MAX_UINT256,
  USDC_ADDRESS,
} from '../workflowTemplates';
import { listVerifiedChains, type ChainContracts, chainToViemChain } from '../chainRegistry';
import {
  WorkflowConsentModal,
  WorkflowConsentSummary,
} from '../components/WorkflowConsentModal';
import { ExecutionHistory } from '../components/ExecutionHistory';
import { DelegationSettings, type DelegationSettingsValue } from '../components/DelegationSettings';
import { useAaveHealthFactor } from '../hooks/useAaveHealthFactor';
import { applyRoleDelegation } from '../delegation/zodiacRoles';
import {
  buildTwapCreateTransaction,
  assertSafeReadyForComposableCow,
  getComposableCowDeployment,
  type Eip1193Provider,
} from '../delegation/cowTwap';
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
  sellAmount: string; // raw base units — replaces the old MAX_UINT256 default
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
  approveToken?: (
    stopLossParams?: StopLossParams,
    twapParams?: TwapParams
  ) => string | undefined;
}

const AUTOMATIONS: Record<AutomationType, AutomationConfig> = {
  'liquidation-shield': {
    label: 'Liquidation Shield (HF < 1.15)',
    approveToken: () => USDC_ADDRESS,
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
    approveToken: (params) => params?.tokenAddress,
    build: (address, stopLossParams, _twapParams) => {
      if (!stopLossParams) {
        throw new Error('Stop-loss requires token, threshold, and target token');
      }
      return buildStopLossWorkflow({
        address,
        tokenAddress: stopLossParams.tokenAddress,
        thresholdPrice: stopLossParams.thresholdPrice,
        targetToken: stopLossParams.targetToken,
        sellAmount: stopLossParams.sellAmount,
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
    label: 'TWAP (CoW Protocol)',
    needsForm: true,
    // Note: For real TWAP via ComposableCoW, approval is handled at the Safe level
    // through role delegation, not via individual ERC20 approvals
    approveToken: undefined,
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
      protocol: 'CoW Protocol',
      action: 'Time-weighted average price order via ComposableCoW',
      triggerCondition: twapParams
        ? `${twapParams.numParts} parts over ${twapParams.partDurationSeconds}s each`
        : 'TWAP schedule',
      chain: 'Ethereum',
      tokenSymbol: twapParams?.sellToken?.slice(0, 8) || 'sell token',
      maxAmount: twapParams?.totalSellAmount,
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

  // Delegation settings state
  const [showDelegationSettings, setShowDelegationSettings] = useState(false);
  const [delegationLoading, setDelegationLoading] = useState(false);
  const [roleDelegation, setRoleDelegation] = useState<DelegationSettingsValue | null>(null);

  // Consent modal state
  const [showConsent, setShowConsent] = useState(false);
  const [pendingType, setPendingType] = useState<AutomationType | null>(null);
  const [pendingWorkflow, setPendingWorkflow] = useState<{
    nodes: any[];
    edges: any[];
  } | null>(null);

  // Approval-scoping state — this is what got deleted in the regression.
  // pendingApproveToken/pendingApproveDecimals are resolved once, when the
  // consent modal opens, so handleConfirmCreate can convert the user's
  // human-typed amount into the correct raw base-unit string.
  const [rawAmount, setRawAmount] = useState('');
  const [allowUnlimited, setAllowUnlimited] = useState(false);
  const [pendingApproveToken, setPendingApproveToken] = useState<
    string | undefined
  >(undefined);
  const [pendingApproveDecimals, setPendingApproveDecimals] = useState<
    number | null
  >(null);

  // Stop-loss form state
  const [stopLossForm, setStopLossForm] = useState<StopLossParams>({
    tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
    thresholdPrice: 2000,
    targetToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    sellAmount: '1000000000000000000', // 1 WETH in wei — replaces the old MAX_UINT256 default
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
    const [keyStatus, list, delegation] = await Promise.all([
      wallet.getKeeperhubApiKeyStatus(),
      wallet.getKeeperhubWorkflows(account.address),
      wallet.getRoleDelegation(account.address),
    ]);
    setHasApiKey(keyStatus);
    setWorkflows(list);
    if (delegation) {
      setRoleDelegation({
        safeAddress: delegation.safeAddress,
        rolesModifierAddress: delegation.rolesModifierAddress,
        roleKey: delegation.roleKey,
        chainId: delegation.chainId,
      });
    } else {
      setRoleDelegation(null);
    }
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

        // Reset amount-scoping state for the new workflow, then resolve
        // which token (if any) needs an approval cap.
        setRawAmount('');
        setAllowUnlimited(false);
        setPendingApproveDecimals(null);
        const approveToken = AUTOMATIONS[type].approveToken?.(
          stopLossParams,
          twapParams
        );
        setPendingApproveToken(approveToken);
        if (approveToken) {
          try {
            const { decimals } = await wallet.getErc20DecimalsAndBalance({
              address: account.address,
              tokenAddress: approveToken,
              chainId: selectedChain?.chainId ?? 1,
            });
            setPendingApproveDecimals(decimals);
          } catch (decimalsError) {
            console.error('Failed to fetch token decimals:', decimalsError);
            // Leave pendingApproveDecimals null — the modal treats that as
            // "can't validate an amount yet" and keeps Confirm disabled
            // unless the user explicitly checks "allow unlimited".
          }
        }

        setShowConsent(true);
      } catch (e) {
        message.error((e as Error).message);
      }
    },
    [account?.address, wallet, selectedChain]
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
      !stopLossForm.thresholdPrice ||
      !stopLossForm.sellAmount
    ) {
      message.error(
        'Fill in token to watch, threshold price, target token, and amount to sell'
      );
      return;
    }
    setShowStopLossForm(false);
    handlePrepareAutomation('stop-loss', stopLossForm);
  }, [stopLossForm, handlePrepareAutomation]);

  const handleConfirmTwapForm = useCallback(async () => {
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

    if (!account?.address || !selectedChain) {
      message.error('No account or chain selected');
      return;
    }

    // Check if user has a Safe configured for real TWAP
    const roleDelegation = await wallet.getRoleDelegation(account.address);
    if (roleDelegation && roleDelegation.chainId === selectedChain.chainId) {
      try {
        // Check if Safe is ready for ComposableCoW
        const deployment = getComposableCowDeployment(roleDelegation.chainId);
        const readyCheck = await assertSafeReadyForComposableCow(
          roleDelegation.safeAddress,
          deployment,
          (address, slot) =>
            wallet.requestETHRpc(
              { method: 'eth_getStorageAt', params: [address, slot, 'latest'] },
              selectedChain.serverId
            )
        );

        if (readyCheck.ready) {
          // Use real TWAP path - create transaction directly, not a KeeperHub workflow
          try {
            // Build a viem chain descriptor from Rabby's own chain data —
            // no separate RPC URL lookup needed. The transport below
            // proxies through wallet.requestETHRpc (Rabby's real RPC
            // routing), not a URL string, so this doesn't hit the
            // "chain.rpcUrl doesn't exist" bug the previous version had.
            const chainConfig = findChain({ serverId: selectedChain.serverId });
            const viemChain = chainToViemChain(selectedChain, {
              name: 'Ether',
              symbol: (chainConfig as any)?.nativeTokenSymbol || 'ETH',
              decimals: (chainConfig as any)?.nativeTokenDecimals ?? 18,
            });
            const eip1193Provider: Eip1193Provider = {
              request: ({ method, params }: { method: string; params?: unknown }) =>
                wallet.requestETHRpc({ method, params }, selectedChain.serverId),
            };

            const tx = buildTwapCreateTransaction(
              {
                sellToken: twapForm.sellToken,
                buyToken: twapForm.buyToken,
                receiver: roleDelegation.safeAddress,
                totalSellAmount: twapForm.totalSellAmount,
                totalBuyAmountMin: twapForm.totalBuyAmountMin,
                numParts: twapForm.numParts,
                partDurationSeconds: twapForm.partDurationSeconds,
                appData: '0x0000000000000000000000000000000000000000000000000000000000000000', // Default appData (bytes32)
              },
              roleDelegation.chainId,
              { provider: eip1193Provider, viemChain }
            );

            // Send the transaction via Rabby's confirmation flow
            await wallet.sendRequest({
              method: 'eth_sendTransaction',
              params: [
                {
                  from: roleDelegation.safeAddress,
                  to: tx.to,
                  value: tx.value,
                  data: tx.data,
                },
              ],
            });

            message.success('TWAP order created on CoW Protocol');
            setShowTwapForm(false);
            return;
          } catch (e) {
            message.error(`Failed to create TWAP order: ${(e as Error).message}`);
            return;
          }
        } else {
          // Safe exists but not configured for ComposableCoW - show warning and fall back
          message.warning(
            `Safe not configured for ComposableCoW: ${readyCheck.reason}. Using fallback scheduled swap instead.`
          );
        }
      } catch (e) {
        console.error('Error checking Safe for ComposableCoW:', e);
        message.warning(
          `Could not verify Safe configuration: ${(e as Error).message}. Using fallback scheduled swap instead.`
        );
      }
    }

    // Fallback to KeeperHub workflow path
    setShowTwapForm(false);
    handlePrepareAutomation('twap', undefined, twapForm);
  }, [twapForm, account, selectedChain, wallet, handlePrepareAutomation]);

  const handleConfirmCreate = useCallback(async () => {
    if (!account?.address || !pendingWorkflow || !pendingType) return;

    try {
      let nodesToSubmit = pendingWorkflow.nodes;

      // Scope the approve() amount before anything gets submitted. This is
      // the safety mechanism that was deleted in a prior pass — restoring
      // it here rather than leaving fallback templates' hardcoded
      // MAX_UINT256 (or whatever KeeperHub's AI path returns) unscoped.
      if (pendingApproveToken) {
        if (allowUnlimited) {
          nodesToSubmit = scopeApproveNodeAmounts(nodesToSubmit, MAX_UINT256);
        } else {
          if (pendingApproveDecimals === null) {
            message.error(
              'Could not determine token decimals — cannot safely scope the ' +
                'approval amount. Try again, or check "allow unlimited" if you ' +
                'understand the risk.'
            );
            return;
          }
          let scopedAmount: string;
          try {
            scopedAmount = parseUnits(
              rawAmount as `${number}`,
              pendingApproveDecimals
            ).toString();
          } catch {
            message.error('Enter a valid amount');
            return;
          }
          nodesToSubmit = scopeApproveNodeAmounts(nodesToSubmit, scopedAmount);
        }
      }

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
    rawAmount,
    allowUnlimited,
    pendingApproveToken,
    pendingApproveDecimals,
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

      <Card size="small" className="mb-16" title="Execution mode">
        <div className="flex justify-between items-center">
          <span>
            {roleDelegation
              ? `Safe + Roles (configured: ${roleDelegation.safeAddress.slice(0, 8)}…)`
              : 'Direct (EOA)'}
          </span>
          <Button size="small" onClick={() => setShowDelegationSettings(!showDelegationSettings)}>
            {showDelegationSettings ? 'Hide' : 'Configure'}
          </Button>
        </div>
        {showDelegationSettings && (
          <div className="mt-16">
            <DelegationSettings
              value={roleDelegation}
              onSave={async (value) => {
                setDelegationLoading(true);
                try {
                  if (!account?.address) throw new Error('No account selected');
                  await wallet.setRoleDelegation(account.address, value);
                  setRoleDelegation(value);
                  setShowDelegationSettings(false);
                  message.success('Delegation settings saved');
                } catch (e) {
                  message.error(`Failed to save delegation: ${(e as Error).message}`);
                } finally {
                  setDelegationLoading(false);
                }
              }}
              onClear={async () => {
                setDelegationLoading(true);
                try {
                  if (!account?.address) throw new Error('No account selected');
                  await wallet.clearRoleDelegation(account.address);
                  setRoleDelegation(null);
                  setShowDelegationSettings(false);
                  message.success('Delegation cleared');
                } catch (e) {
                  message.error(`Failed to clear delegation: ${(e as Error).message}`);
                } finally {
                  setDelegationLoading(false);
                }
              }}
              saving={delegationLoading}
              wallet={wallet}
              accountAddress={account?.address}
              chainServerId={selectedChain?.serverId}
              chainId={selectedChain?.chainId}
            />
          </div>
        )}
      </Card>

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
            <Input
              placeholder="Amount to sell (raw base units) — replaces the old unlimited default"
              value={stopLossForm.sellAmount}
              onChange={(e) =>
                setStopLossForm((f) => ({ ...f, sellAmount: e.target.value }))
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
            pendingType === 'stop-loss' ? stopLossForm : undefined,
            pendingType === 'twap' ? twapForm : undefined
          )}
          onConfirm={handleConfirmCreate}
          onCancel={handleCancelConsent}
          loading={loading}
          showApprovalControls={Boolean(pendingApproveToken)}
          amount={rawAmount}
          onAmountChange={setRawAmount}
          allowUnlimited={allowUnlimited}
          onAllowUnlimitedChange={setAllowUnlimited}
          amountValid={
            pendingApproveDecimals !== null &&
            rawAmount.trim() !== '' &&
            !Number.isNaN(Number(rawAmount)) &&
            Number(rawAmount) > 0
          }
        />
      )}
    </div>
  );
};

export default SmartAutomations;
