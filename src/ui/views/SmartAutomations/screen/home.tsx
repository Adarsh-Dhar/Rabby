import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/ui/component';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { Button, message, Select, Row, Col } from 'antd';
import { ReactComponent as RcIconPlus } from 'ui/assets/plus.svg';
import ThemeIcon from '@/ui/component/ThemeMode/ThemeIcon';
import { listVerifiedChains } from '../chainRegistry';
import type { ChainContracts } from '../chainRegistry';
import { ProjectCard } from '../components/ProjectCard';
import type { WorkflowRow } from '../components/ProjectCard';
import { ProjectEditor } from '../components/ProjectEditor';
import { DelegationSettings } from '../components/DelegationSettings';
import type { DelegationSettingsValue } from '../components/DelegationSettings';
import { useAaveHealthFactor } from '../hooks/useAaveHealthFactor';

const SmartAutomations = () => {
  const wallet = useWallet();
  const account = useCurrentAccount();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([
    {
      workflowId: 'demo-health-factor',
      name: 'Protect Aave position',
      description: 'Repay debt when health factor drops below 1.25',
      type: 'health-factor',
      lastKnownStatus: 'active',
      createdAt: Date.now() - 86400000 * 4,
    },
    {
      workflowId: 'demo-dca',
      name: 'Weekly ETH buy',
      description: 'Swap 50 USDC for ETH every Monday',
      type: 'twap',
      lastKnownStatus: 'paused',
      createdAt: Date.now() - 86400000 * 9,
    },
  ]);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [selectedChain, setSelectedChain] = useState<ChainContracts | null>(
    null
  );
  const [editingWorkflowId, setEditingWorkflowId] = useState<
    string | undefined
  >(undefined);
  const [showEditor, setShowEditor] = useState(false);

  // Delegation settings state
  const [showDelegationSettings, setShowDelegationSettings] = useState(false);
  const [delegationLoading, setDelegationLoading] = useState(false);
  const [
    roleDelegation,
    setRoleDelegation,
  ] = useState<DelegationSettingsValue | null>(null);

  const healthFactorData = useAaveHealthFactor(account?.address);

  const load = useCallback(async () => {
    if (!account?.address) return;
    try {
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
    } catch (error) {
      console.error('Failed to load automations data:', error);
      // Set hasApiKey to false on error to prevent UI from breaking
      setHasApiKey(false);
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

  const handleEditWorkflow = useCallback((workflowId: string) => {
    setEditingWorkflowId(workflowId);
    setShowEditor(true);
  }, []);

  const handleCreateNew = useCallback(() => {
    setEditingWorkflowId(undefined);
    setShowEditor(true);
  }, []);

  const handleDeleteWorkflow = useCallback(
    async (workflowId: string) => {
      if (!account?.address) return;
      try {
        await wallet.deleteKeeperhubWorkflow(account.address, workflowId);
        await load();
      } catch (error) {
        message.error((error as Error).message);
      }
    },
    [account?.address, wallet, load]
  );

  const handleToggleWorkflow = useCallback(
    async (workflowId: string, enabled: boolean) => {
      if (!account?.address) return;
      try {
        await wallet.updateKeeperhubWorkflow(account.address, workflowId, {
          enabled,
        });
        await load();
      } catch (error) {
        message.error((error as Error).message);
      }
    },
    [account?.address, wallet, load]
  );

  const handleSaveWorkflow = useCallback(
    async (params: {
      name: string;
      description?: string;
      nodes: any[];
      edges: any[];
    }) => {
      if (!account?.address) return;

      if (editingWorkflowId) {
        // Update existing workflow
        await wallet.updateKeeperhubWorkflow(
          account.address,
          editingWorkflowId,
          {
            name: params.name,
            description: params.description,
            nodes: params.nodes,
            edges: params.edges,
          }
        );
      } else {
        // Create new workflow
        await wallet.createKeeperhubWorkflow({
          address: account.address,
          chainId: selectedChain?.chainId ?? 1,
          type: 'twap', // Use a supported workflow type
          name: params.name,
          description: params.description,
          nodes: params.nodes,
          edges: params.edges,
        });
      }

      await load();
      setShowEditor(false);
      setEditingWorkflowId(undefined);
    },
    [account?.address, editingWorkflowId, selectedChain, wallet, load]
  );

  const handleCancelEditor = useCallback(() => {
    setShowEditor(false);
    setEditingWorkflowId(undefined);
  }, []);

  if (!hasApiKey) {
    return (
      <div className="p-20">
        <PageHeader canBack={false}>Automations</PageHeader>
        <div className="text-r-neutral-body text-14 mt-16">
          Connect a KeeperHub API key in Settings to enable automations for this
          account.
        </div>
      </div>
    );
  }

  if (showEditor) {
    const editingWorkflow = editingWorkflowId
      ? workflows.find((w) => w.workflowId === editingWorkflowId)
      : undefined;

    return (
      <ProjectEditor
        workflowId={editingWorkflowId}
        initialName={editingWorkflow?.name}
        initialDescription={editingWorkflow?.description}
        initialNodes={[]} // Would need to fetch full workflow details from API
        initialEdges={[]}
        onSave={handleSaveWorkflow}
        onCancel={handleCancelEditor}
        chainId={selectedChain?.chainId ?? 1}
      />
    );
  }

  return (
    <div className="p-20">
      <PageHeader
        canBack={false}
        className="mb-12"
        rightSlot={
          <Button
            type="primary"
            size="large"
            icon={<ThemeIcon src={RcIconPlus} className="w-12 h-12" />}
            onClick={handleCreateNew}
          >
            New Automation
          </Button>
        }
      >
        Automations
      </PageHeader>

      <div className="bg-r-neutral-card1 rounded-[10px] border border-solid border-rabby-neutral-line p-16 mb-16">
        <div className="flex items-center justify-between mb-12">
          <div className="text-r-neutral-title1 text-14 font-medium">
            Execution mode
          </div>
          <span
            className={`inline-flex items-center gap-4 rounded-full px-8 py-2 text-11 font-medium ${
              roleDelegation
                ? 'bg-r-green-light text-r-green-default'
                : 'bg-r-neutral-card2 text-r-neutral-body'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full ${
                roleDelegation ? 'bg-r-green-default' : 'bg-r-neutral-foot'
              }`}
            />
            {roleDelegation ? 'Safe + Roles' : 'Direct (EOA)'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-r-neutral-body text-13 truncate mr-8">
            {roleDelegation
              ? `Safe ${roleDelegation.safeAddress.slice(
                  0,
                  8
                )}…${roleDelegation.safeAddress.slice(-4)}`
              : 'Transactions are signed directly by this account'}
          </span>
          <Button
            size="small"
            onClick={() => setShowDelegationSettings(!showDelegationSettings)}
          >
            {showDelegationSettings ? 'Hide' : 'Configure'}
          </Button>
        </div>
        {showDelegationSettings && (
          <div className="mt-12">
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
                  message.error(
                    `Failed to save delegation: ${(e as Error).message}`
                  );
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
                  message.error(
                    `Failed to clear delegation: ${(e as Error).message}`
                  );
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
      </div>

      <div className="bg-r-neutral-card1 rounded-[10px] border border-solid border-rabby-neutral-line p-16 mb-16">
        <div className="flex items-center justify-between mb-12">
          <div className="text-r-neutral-title1 text-14 font-medium">
            Discovery
          </div>
          <Select
            value={selectedChain?.label}
            onChange={(value) => {
              const chain = listVerifiedChains().find(
                (c) => c.label === value
              );
              if (chain) setSelectedChain(chain);
            }}
            className="w-[140px]"
            size="small"
            placeholder="Select a chain"
          >
            {listVerifiedChains().map((chain) => (
              <Select.Option key={chain.label} value={chain.label}>
                {chain.label}
              </Select.Option>
            ))}
          </Select>
        </div>

        {selectedChain?.aaveV3Pool ? (
          <div className="flex items-center justify-between rounded-8 bg-r-neutral-card2 px-12 py-10">
            <span className="text-r-neutral-body text-13 font-medium">
              Aave V3 position
            </span>
            {healthFactorData.loading && (
              <span className="text-r-neutral-foot text-13">Loading…</span>
            )}
            {healthFactorData.error && (
              <span className="text-r-red-default text-13">
                Failed to load
              </span>
            )}
            {!healthFactorData.loading && !healthFactorData.error && (
              <div className="flex items-center gap-10 text-13">
                <span
                  className={`font-medium ${
                    !healthFactorData.healthFactor
                      ? 'text-r-neutral-foot'
                      : healthFactorData.healthFactor < 1.25
                      ? 'text-r-red-default'
                      : healthFactorData.healthFactor < 1.5
                      ? 'text-r-orange-default'
                      : 'text-r-green-default'
                  }`}
                >
                  HF{' '}
                  {!healthFactorData.healthFactor
                    ? '—'
                    : healthFactorData.healthFactor.toFixed(2)}
                </span>
                <span className="text-r-neutral-foot">·</span>
                <span className="text-r-neutral-body">
                  Debt ${healthFactorData.totalDebtUSD?.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-r-neutral-foot text-13">
            No supported lending markets on this chain.
          </div>
        )}
      </div>

      <div className="mb-16">
        <div className="flex items-center gap-8 mb-12">
          <h3 className="text-r-neutral-title1 text-16 font-medium m-0">
            Your Workflows
          </h3>
          {workflows.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-20 px-6 rounded-full bg-r-neutral-card2 text-r-neutral-body text-12 font-medium">
              {workflows.length}
            </span>
          )}
        </div>
        {workflows.length === 0 ? (
          <div className="flex flex-col items-center text-center rounded-[10px] border border-dashed border-rabby-neutral-line py-40 px-20">
            <img
              className="w-[100px] mb-16"
              src="/images/nodata-tx.png"
              alt="no workflows"
            />
            <div className="text-14 mb-8 text-r-neutral-body font-medium">
              No workflows yet
            </div>
            <div className="text-12 text-r-neutral-foot mb-16">
              Create your first automation to get started
            </div>
            <Button type="primary" onClick={handleCreateNew}>
              New Automation
            </Button>
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            {workflows.map((workflow) => (
              <Col key={workflow.workflowId} xs={24} sm={12} md={8} lg={6}>
                <ProjectCard
                  workflow={workflow}
                  onEdit={handleEditWorkflow}
                  onDelete={handleDeleteWorkflow}
                  onToggleEnabled={handleToggleWorkflow}
                />
              </Col>
            ))}
          </Row>
        )}
      </div>
    </div>
  );
};

export default SmartAutomations;
