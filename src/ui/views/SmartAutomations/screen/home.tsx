import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/ui/component';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { Button, Card, message, Select, Row, Col } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { findChain } from '@/utils/chain';
import { listVerifiedChains, type ChainContracts } from '../chainRegistry';
import { ProjectCard, type WorkflowRow } from '../components/ProjectCard';
import { ProjectEditor } from '../components/ProjectEditor';
import { DelegationSettings, type DelegationSettingsValue } from '../components/DelegationSettings';
import { useAaveHealthFactor } from '../hooks/useAaveHealthFactor';
import type { MCPWorkflowNode, MCPWorkflowEdge } from 'background/service/keeperhubMCP';

const SmartAutomations = () => {
  const wallet = useWallet();
  const account = useCurrentAccount();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [selectedChain, setSelectedChain] = useState<ChainContracts | null>(null);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | undefined>(undefined);
  const [showEditor, setShowEditor] = useState(false);

  // Delegation settings state
  const [showDelegationSettings, setShowDelegationSettings] = useState(false);
  const [delegationLoading, setDelegationLoading] = useState(false);
  const [roleDelegation, setRoleDelegation] = useState<DelegationSettingsValue | null>(null);

  const healthFactorData = useAaveHealthFactor(account?.address);

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

  const handleEditWorkflow = useCallback((workflowId: string) => {
    setEditingWorkflowId(workflowId);
    setShowEditor(true);
  }, []);

  const handleCreateNew = useCallback(() => {
    setEditingWorkflowId(undefined);
    setShowEditor(true);
  }, []);

  const handleDeleteWorkflow = useCallback(async (workflowId: string) => {
    if (!account?.address) return;
    try {
      await wallet.deleteKeeperhubWorkflow(account.address, workflowId);
      await load();
    } catch (error) {
      message.error((error as Error).message);
    }
  }, [account?.address, wallet, load]);

  const handleToggleWorkflow = useCallback(async (workflowId: string, enabled: boolean) => {
    if (!account?.address) return;
    try {
      await wallet.updateKeeperhubWorkflow(account.address, workflowId, { enabled });
      await load();
    } catch (error) {
      message.error((error as Error).message);
    }
  }, [account?.address, wallet, load]);

  const handleSaveWorkflow = useCallback(async (params: {
    name: string;
    nodes: MCPWorkflowNode[];
    edges: MCPWorkflowEdge[];
  }) => {
    if (!account?.address) return;

    if (editingWorkflowId) {
      // Update existing workflow
      await wallet.updateKeeperhubWorkflow(account.address, editingWorkflowId, {
        name: params.name,
        nodes: params.nodes,
        edges: params.edges,
      });
    } else {
      // Create new workflow
      await wallet.createKeeperhubWorkflow({
        address: account.address,
        chainId: selectedChain?.chainId ?? 1,
        type: 'custom', // Chat-generated workflows are custom type
        name: params.name,
        nodes: params.nodes,
        edges: params.edges,
      });
    }

    await load();
    setShowEditor(false);
    setEditingWorkflowId(undefined);
  }, [account?.address, editingWorkflowId, selectedChain, wallet, load]);

  const handleCancelEditor = useCallback(() => {
    setShowEditor(false);
    setEditingWorkflowId(undefined);
  }, []);

  if (!hasApiKey) {
    return (
      <div className="p-20">
        <PageHeader>Automations</PageHeader>
        <p className="text-r-neutral-body">
          Connect a KeeperHub API key in Settings to enable automations for this
          account.
        </p>
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
      <PageHeader>
        <div className="flex items-center justify-between">
          <span>Automations</span>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreateNew}
          >
            New Automation
          </Button>
        </div>
      </PageHeader>

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
        </div>
      </Card>

      <div className="mb-16">
        <h3 className="text-r-neutral-title text-16 mb-12">Your Workflows</h3>
        {workflows.length === 0 ? (
          <div className="text-center text-r-neutral-foot py-32">
            <div className="text-14 mb-8">No workflows yet</div>
            <div className="text-12">
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
