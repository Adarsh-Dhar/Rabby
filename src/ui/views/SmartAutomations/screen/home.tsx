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

      <div className="bg-r-neutral-card rounded-8 p-16 mb-16">
        <div className="text-r-neutral-title text-14 font-medium mb-12">
          Execution mode
        </div>
        <div className="flex justify-between items-center">
          <span className="text-r-neutral-body text-13">
            {roleDelegation
              ? `Safe + Roles (configured: ${roleDelegation.safeAddress.slice(
                  0,
                  8
                )}…)`
              : 'Direct (EOA)'}
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

      <div className="bg-r-neutral-card rounded-8 p-16 mb-16">
        <div className="text-r-neutral-title text-14 font-medium mb-12">
          Discovery — {selectedChain?.label || 'Select a chain'}
        </div>
        <div className="flex flex-col gap-12 text-13">
          <div className="flex justify-between items-center">
            <span className="text-r-neutral-body">Chain</span>
            <Select
              value={selectedChain?.label}
              onChange={(value) => {
                const chain = listVerifiedChains().find(
                  (c) => c.label === value
                );
                if (chain) setSelectedChain(chain);
              }}
              className="w-48"
              size="small"
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
              <span className="text-r-neutral-body">Aave V3</span>
              {healthFactorData.loading && (
                <span className="text-r-neutral-foot">Loading…</span>
              )}
              {healthFactorData.error && (
                <span className="text-r-red-default">Error</span>
              )}
              {!healthFactorData.loading && !healthFactorData.error && (
                <span className="text-r-neutral-body">
                  HF{' '}
                  {healthFactorData.healthFactor === 0
                    ? '—'
                    : healthFactorData.healthFactor?.toFixed(2)}{' '}
                  · Debt ${healthFactorData.totalDebtUSD?.toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mb-16">
        <h3 className="text-r-neutral-title text-16 font-medium mb-12">
          Your Workflows
        </h3>
        {workflows.length === 0 ? (
          <div className="text-center text-r-neutral-foot py-32">
            <img
              className="w-[100px] mx-auto mb-16"
              src="/images/nodata-tx.png"
              alt="no workflows"
            />
            <div className="text-14 mb-8 text-r-neutral-body">
              No workflows yet
            </div>
            <div className="text-12 text-r-neutral-foot">
              Create your first automation to get started
            </div>
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
