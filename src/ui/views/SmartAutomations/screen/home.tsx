import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/ui/component';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import { Button, message } from 'antd';
import { buildLiquidationShieldWorkflow } from '../workflowTemplates';

interface WorkflowRow {
  workflowId: string;
  type: string;
  lastKnownStatus?: string;
}

const EXTENSION_ORIGIN_ERROR = 'KEEPERHUB_EXTENSION_ORIGIN';

const SmartAutomations = () => {
  const wallet = useWallet();
  const account = useCurrentAccount();
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [originBlocked, setOriginBlocked] = useState(false);

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
      const { nodes, edges } = await buildLiquidationShieldWorkflow({
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
      const errorMessage = (e as Error).message;
      if (errorMessage.includes(EXTENSION_ORIGIN_ERROR)) {
        // KeeperHub blocks chrome-extension:// origins — show an inline notice
        // instead of a transient error toast so the user understands the limit.
        setOriginBlocked(true);
      } else if (errorMessage.includes('API key')) {
        message.error(
          'KeeperHub API key is not configured. Please check your settings.'
        );
      } else {
        message.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [account?.address, wallet, load]);

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

  if (originBlocked) {
    return (
      <div className="p-20">
        <PageHeader>Smart Automations</PageHeader>
        <p className="text-r-neutral-body mb-12">
          KeeperHub workflows cannot be created directly from the browser
          extension due to API origin restrictions.
        </p>
        <p className="text-r-neutral-body">
          Visit{' '}
          <a
            href="https://app.keeperhub.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-r-blue-default"
          >
            app.keeperhub.com
          </a>{' '}
          to create and manage your automations.
        </p>
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
