import React, { useState, useCallback, useEffect } from 'react';
import { Button, message, Tabs, Spin } from 'antd';
import { ReactComponent as RcIconClose } from 'ui/assets/component/close-cc.svg';
import { ReactComponent as RcIconCheck } from 'ui/assets/check.svg';
import ThemeIcon from '@/ui/component/ThemeMode/ThemeIcon';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import type { MCPWorkflowNode, MCPWorkflowEdge } from 'background/service/keeperhubMCP';
import { ChatPane } from './ChatPane';
import { FormPane } from './FormPane';
import { WorkflowConsentModal, type WorkflowConsentSummary } from '../WorkflowConsentModal';
import { scopeApproveNodeAmounts, MAX_UINT256 } from '../../workflowTemplates';
import { applyRoleDelegation } from '../../delegation/zodiacRoles';

interface ProjectEditorProps {
  workflowId?: string; // undefined = new project
  initialName?: string;
  initialNodes?: MCPWorkflowNode[];
  initialEdges?: MCPWorkflowEdge[];
  onSave: (params: {
    name: string;
    nodes: MCPWorkflowNode[];
    edges: MCPWorkflowEdge[];
  }) => Promise<void>;
  onCancel: () => void;
  chainId: number;
}

type EditorMode = 'chat' | 'form';

interface DraftDefinition {
  name: string;
  nodes: MCPWorkflowNode[];
  edges: MCPWorkflowEdge[];
}

interface Fingerprint {
  name: string;
  nodesHash: string;
  edgesHash: string;
}

export const ProjectEditor: React.FC<ProjectEditorProps> = ({
  workflowId,
  initialName = '',
  initialNodes = [],
  initialEdges = [],
  onSave,
  onCancel,
  chainId,
}) => {
  const wallet = useWallet();
  const account = useCurrentAccount();
  const [mode, setMode] = useState<EditorMode>('chat');
  const [draftDefinition, setDraftDefinition] = useState<DraftDefinition>({
    name: initialName,
    nodes: initialNodes,
    edges: initialEdges,
  });
  const [liveFingerprint, setLiveFingerprint] = useState<Fingerprint | null>(null);
  const [pendingProposal, setPendingProposal] = useState<DraftDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [showConsent, setShowConsent] = useState(false);

  // Approval-scoping state
  const [rawAmount, setRawAmount] = useState('');
  const [allowUnlimited, setAllowUnlimited] = useState(false);
  const [pendingApproveToken, setPendingApproveToken] = useState<string | undefined>(undefined);
  const [pendingApproveDecimals, setPendingApproveDecimals] = useState<number | null>(null);

  // Compute fingerprint of a definition
  const computeFingerprint = useCallback((def: DraftDefinition): Fingerprint => {
    const nodesHash = JSON.stringify(def.nodes);
    const edgesHash = JSON.stringify(def.edges);
    return {
      name: def.name,
      nodesHash,
      edgesHash,
    };
  }, []);

  // Initialize fingerprint when component mounts or initial data changes
  useEffect(() => {
    if (initialName || initialNodes.length > 0 || initialEdges.length > 0) {
      setLiveFingerprint(computeFingerprint({
        name: initialName,
        nodes: initialNodes,
        edges: initialEdges,
      }));
    }
  }, [initialName, initialNodes, initialEdges, computeFingerprint]);

  const handleChatProposal = useCallback(async (proposal: DraftDefinition) => {
    setPendingProposal(proposal);
    setDraftDefinition(proposal);
  }, []);

  const handleApplyProposal = useCallback(() => {
    if (pendingProposal) {
      setDraftDefinition(pendingProposal);
      setPendingProposal(null);
    }
  }, [pendingProposal]);

  const handleRejectProposal = useCallback(() => {
    setPendingProposal(null);
  }, []);

  const handleFormChange = useCallback((changes: Partial<DraftDefinition>) => {
    setDraftDefinition((prev) => ({
      ...prev,
      ...changes,
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!account?.address) return;

    try {
      setLoading(true);

      // Check for unrecognized node shapes
      const unrecognizedNodes = draftDefinition.nodes.filter((node) => {
        const config = node.data?.config;
        if (!config) return true;
        // Only recognize known action types
        const knownActionTypes = ['web3/read-contract', 'web3/write-contract', 'Condition'];
        if (config.actionType && !knownActionTypes.includes(config.actionType)) {
          return true;
        }
        return false;
      });

      if (unrecognizedNodes.length > 0) {
        message.error(
          `Workflow contains ${unrecognizedNodes.length} unrecognized node type(s). ` +
          'Please use only supported node types (web3/read-contract, web3/write-contract, Condition).'
        );
        return;
      }

      // Scope approve amounts
      let nodesToSubmit = draftDefinition.nodes;
      if (pendingApproveToken) {
        if (allowUnlimited) {
          nodesToSubmit = scopeApproveNodeAmounts(nodesToSubmit, MAX_UINT256);
        } else {
          if (pendingApproveDecimals === null) {
            message.error(
              'Could not determine token decimals — cannot safely scope the approval amount. ' +
              'Try again, or check "allow unlimited" if you understand the risk.'
            );
            return;
          }
          // Parse and scope the amount
          const { parseUnits } = await import('viem');
          let scopedAmount: string;
          try {
            scopedAmount = parseUnits(rawAmount as `${number}`, pendingApproveDecimals).toString();
          } catch {
            message.error('Enter a valid amount');
            return;
          }
          nodesToSubmit = scopeApproveNodeAmounts(nodesToSubmit, scopedAmount);
        }
      }

      // Apply role delegation if configured
      try {
        const roleDelegation = await wallet.getRoleDelegation(account.address);
        if (roleDelegation) {
          nodesToSubmit = applyRoleDelegation(nodesToSubmit as any, roleDelegation) as any;
        }
      } catch (delegationError) {
        console.error('Failed to get role delegation:', delegationError);
        // Continue without role delegation if it fails
      }

      // Check if workflow changed underneath
      if (liveFingerprint) {
        const currentFingerprint = computeFingerprint(draftDefinition);
        if (
          currentFingerprint.name !== liveFingerprint.name ||
          currentFingerprint.nodesHash !== liveFingerprint.nodesHash ||
          currentFingerprint.edgesHash !== liveFingerprint.edgesHash
        ) {
          message.warning(
            'Workflow was modified by another session. Please refresh and try again.'
          );
          return;
        }
      }

      await onSave({
        name: draftDefinition.name,
        nodes: nodesToSubmit,
        edges: draftDefinition.edges,
      });

      message.success('Workflow saved successfully');
      setShowConsent(false);
    } catch (error) {
      console.error('Error saving workflow:', error);
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [
    account?.address,
    draftDefinition,
    pendingApproveToken,
    allowUnlimited,
    pendingApproveDecimals,
    rawAmount,
    liveFingerprint,
    computeFingerprint,
    onSave,
    wallet,
  ]);

  const handleConfirmSave = useCallback(() => {
    // Check if there are any approve nodes that need scoping
    const approveNodes = draftDefinition.nodes.filter((node) => {
      const config = node.data?.config;
      return config?.functionName === 'approve' && config?.actionType === 'web3/write-contract';
    });

    if (approveNodes.length > 0) {
      // Find the token address from the first approve node
      const firstApprove = approveNodes[0];
      const config = firstApprove.data?.config;
      let approveToken: string | undefined;
      try {
        const args = JSON.parse(config?.functionArgs || '[]');
        approveToken = args[0] as string;
      } catch {
        // Could not parse args
      }

      setPendingApproveToken(approveToken);
      if (approveToken) {
        // Fetch token decimals
        wallet.getErc20DecimalsAndBalance({
          address: account?.address || '',
          tokenAddress: approveToken,
          chainId,
        }).then(({ decimals }) => {
          setPendingApproveDecimals(decimals);
        }).catch(() => {
          setPendingApproveDecimals(null);
        });
      }
    }

    setShowConsent(true);
  }, [draftDefinition, account?.address, chainId, wallet]);

  const handleCancelConsent = useCallback(() => {
    setShowConsent(false);
    setPendingApproveToken(undefined);
    setPendingApproveDecimals(null);
    setRawAmount('');
    setAllowUnlimited(false);
  }, []);

  // Build consent summary from actual nodes
  const buildConsentSummary = useCallback((): WorkflowConsentSummary => {
    const nodes = draftDefinition.nodes;
    const actions = nodes.filter((n) => n.type === 'action');
    const triggers = nodes.filter((n) => n.type === 'trigger');

    // Determine protocol from contract addresses
    const contractAddresses = new Set<string>();
    actions.forEach((node) => {
      const address = node.data?.config?.contractAddress;
      if (address) contractAddresses.add(address);
    });

    // Map known addresses to protocols
    const protocolMap: Record<string, string> = {
      '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2': 'Aave V3',
      '0xE592427A0AEce92De3Edee1F18E0157C05861564': 'Uniswap V3',
    };

    const protocols = Array.from(contractAddresses)
      .map((addr) => protocolMap[addr] || addr.slice(0, 8))
      .join(', ');

    const triggerTypes = triggers.map((t) => t.data?.config?.triggerType || 'Manual').join(', ');
    const actionTypes = actions.map((a) => a.data?.label || a.data?.type).join(', ');

    return {
      protocol: protocols || 'Multiple protocols',
      action: actionTypes || 'Contract interactions',
      triggerCondition: triggerTypes || 'Manual trigger',
      chain: chainId === 1 ? 'Ethereum' : `Chain ${chainId}`,
    };
  }, [draftDefinition, chainId]);

  const consentSummary = buildConsentSummary();

  if (loading && !draftDefinition.name) {
    return (
      <div className="flex items-center justify-center h-400">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-16 py-12 border-b border-r-neutral-line">
        <div className="flex items-center gap-12">
          <h2 className="text-r-neutral-title text-18 font-medium">
            {workflowId ? 'Edit Workflow' : 'New Workflow'}
          </h2>
        </div>
        <div className="flex items-center gap-8">
          <Button
            type="primary"
            icon={<ThemeIcon src={RcIconCheck} className="w-14 h-14" />}
            onClick={handleConfirmSave}
            disabled={!draftDefinition.name || draftDefinition.nodes.length === 0}
          >
            Save
          </Button>
          <Button icon={<ThemeIcon src={RcIconClose} className="w-14 h-14" />} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Tabs
          className="flex h-full min-h-0 w-full flex-col"
          activeKey={mode}
          onChange={setMode}
          items={[
            {
              key: 'chat',
              label: 'Chat Builder',
              children: (
                <ChatPane
                  workflowId={workflowId}
                  chainId={chainId}
                  messages={chatMessages}
                  onMessagesChange={setChatMessages}
                  onProposal={handleChatProposal}
                  draftDefinition={draftDefinition}
                  pendingProposal={pendingProposal}
                  onApplyProposal={handleApplyProposal}
                  onRejectProposal={handleRejectProposal}
                />
              ),
            },
            {
              key: 'form',
              label: 'Form Editor',
              children: (
                <FormPane
                  definition={draftDefinition}
                  onChange={handleFormChange}
                />
              ),
            },
          ]}
        />
      </div>

      {/* Consent Modal */}
      <WorkflowConsentModal
        visible={showConsent}
        workflowType={draftDefinition.name || 'Workflow'}
        summary={consentSummary}
        onConfirm={handleSave}
        onCancel={handleCancelConsent}
        loading={loading}
        showApprovalControls={pendingApproveToken !== undefined}
        amount={rawAmount}
        onAmountChange={setRawAmount}
        allowUnlimited={allowUnlimited}
        onAllowUnlimitedChange={setAllowUnlimited}
        amountValid={rawAmount.length > 0 && !isNaN(Number(rawAmount))}
      />
    </div>
  );
};
