import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/ui/component';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { Button, Input, message } from 'antd';
import { buildLiquidationShieldWorkflow } from '../workflowTemplates';

interface WorkflowRow {
  workflowId: string;
  type: string;
  lastKnownStatus?: string;
}

const SmartAutomations = () => {
  const wallet = useWallet();
  const account = useCurrentAccount();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

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

  const handleCreateLiquidationShield = useCallback(async () => {
    if (!account?.address) return;
    setLoading(true);
    try {
      const { nodes, edges } = buildLiquidationShieldWorkflow({
        address: account.address,
        healthFactorThreshold: 1.15,
      });
      await wallet.createKeeperhubWorkflow({
        address: account.address,
        chainId: 1,
        type: 'liquidation-shield',
        name: `Liquidation Shield - ${account.address.slice(0, 6)}`,
        nodes,
        edges,
      });
      message.success('Liquidation shield created');
      await load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [account?.address, wallet, load]);

  const handleSaveApiKey = useCallback(async () => {
    const trimmedKey = apiKeyInput.trim();
    if (!trimmedKey) {
      message.error('Please enter an API key');
      return;
    }
    setSavingKey(true);
    try {
      await wallet.setKeeperhubApiKey(trimmedKey);
      message.success('API key saved successfully');
      setApiKeyInput('');
      await load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSavingKey(false);
    }
  }, [apiKeyInput, wallet, load]);

  if (!hasApiKey) {
    return (
      <div className="p-20">
        <PageHeader>Smart Automations</PageHeader>
        <p className="text-r-neutral-body mb-4">
          Connect a KeeperHub API key to enable automations for this account.
        </p>
        <div className="max-w-md">
          <Input.Password
            placeholder="Enter KeeperHub API key"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            onPressEnter={handleSaveApiKey}
            className="mb-4"
          />
          <Button
            type="primary"
            loading={savingKey}
            onClick={handleSaveApiKey}
            block
          >
            Connect API Key
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-20">
      <PageHeader>Smart Automations</PageHeader>
      <Button
        type="primary"
        loading={loading}
        onClick={handleCreateLiquidationShield}
      >
        Create Liquidation Shield (HF &lt; 1.15)
      </Button>
      <div className="mt-16">
        {workflows.map((w) => (
          <div key={w.workflowId} className="flex justify-between py-8">
            <span>{w.type}</span>
            <span>{w.lastKnownStatus || 'unknown'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SmartAutomations;
