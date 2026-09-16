import React, { useState, useCallback } from 'react';
import { Input, Button, Card, Alert, Spin, Divider, Tag } from 'antd';
import { SendOutlined, CheckOutlined, CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import { useWallet } from '@/ui/utils';
import { useCurrentAccount } from '@/ui/hooks/backgroundState/useAccount';
import type { MCPWorkflowNode, MCPWorkflowEdge } from 'background/service/keeperhubMCP';
import type { DraftDefinition } from './index';

const { TextArea } = Input;

interface ChatPaneProps {
  workflowId?: string;
  chainId: number;
  messages: { role: 'user' | 'model'; text: string }[];
  onMessagesChange: (messages: { role: 'user' | 'model'; text: string }[]) => void;
  onProposal: (proposal: DraftDefinition) => void;
  draftDefinition: DraftDefinition;
  pendingProposal: DraftDefinition | null;
  onApplyProposal: () => void;
  onRejectProposal: () => void;
}

export const ChatPane: React.FC<ChatPaneProps> = ({
  workflowId,
  chainId,
  messages,
  onMessagesChange,
  onProposal,
  draftDefinition,
  pendingProposal,
  onApplyProposal,
  onRejectProposal,
}) => {
  const wallet = useWallet();
  const account = useCurrentAccount();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    const newMessages = [...messages, { role: 'user' as const, text: userMessage }];
    onMessagesChange(newMessages);

    try {
      setLoading(true);

      if (!account?.address) {
        throw new Error('No account selected');
      }

      const result = await wallet.proposeWorkflowFromChat({
        address: account.address,
        chainId,
        workflowId,
        messages: newMessages,
      });

      // Add model response to chat
      onMessagesChange([
        ...newMessages,
        { role: 'model' as const, text: result.summary },
      ]);

      // Propose the workflow definition
      onProposal({
        name: result.name,
        description: result.description,
        nodes: result.nodes,
        edges: result.edges,
      });
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);

      // Add error as a model message so the user sees it in context
      onMessagesChange([
        ...newMessages,
        { role: 'model' as const, text: `Error: ${errorMessage}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, workflowId, chainId, wallet, account, onMessagesChange, onProposal]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const renderDiff = useCallback(() => {
    if (!pendingProposal) return null;

    const changes: { field: string; before: string; after: string }[] = [];

    // Check name change
    if (pendingProposal.name !== draftDefinition.name) {
      changes.push({
        field: 'Name',
        before: draftDefinition.name || '(empty)',
        after: pendingProposal.name,
      });
    }

    // Check nodes change
    if (JSON.stringify(pendingProposal.nodes) !== JSON.stringify(draftDefinition.nodes)) {
      changes.push({
        field: 'Nodes',
        before: `${draftDefinition.nodes.length} nodes`,
        after: `${pendingProposal.nodes.length} nodes`,
      });
    }

    // Check edges change
    if (JSON.stringify(pendingProposal.edges) !== JSON.stringify(draftDefinition.edges)) {
      changes.push({
        field: 'Edges',
        before: `${draftDefinition.edges.length} edges`,
        after: `${pendingProposal.edges.length} edges`,
      });
    }

    if (changes.length === 0) {
      return (
        <Alert
          message="No changes detected"
          description="The proposed workflow is identical to the current definition."
          type="info"
          showIcon
        />
      );
    }

    return (
      <Card title="Proposed Changes" size="small" className="mb-16">
        {changes.map((change, idx) => (
          <div key={idx} className="mb-8 last:mb-0">
            <div className="text-r-neutral-foot text-12 mb-4">{change.field}</div>
            <div className="flex items-center gap-8">
              <span className="text-r-red-default line-through text-14">
                {change.before}
              </span>
              <span className="text-r-neutral-foot">→</span>
              <span className="text-r-green-success text-14">
                {change.after}
              </span>
            </div>
          </div>
        ))}
      </Card>
    );
  }, [pendingProposal, draftDefinition]);

  return (
    <div className="flex flex-col h-full p-16 gap-16">
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-center text-r-neutral-foot py-32">
            <div className="text-16 mb-8">Start building your workflow</div>
            <div className="text-14">
              Describe what you want to automate, and I'll help you create it.
              <br />
              For example: "Create a liquidation shield for my Aave position"
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-16 ${
              msg.role === 'user' ? 'text-right' : 'text-left'
            }`}
          >
            <div
              className={`inline-block max-w-[80%] p-12 rounded-8 ${
                msg.role === 'user'
                  ? 'bg-r-blue-light bg-opacity-10 text-r-blue-title'
                  : 'bg-r-neutral-card text-r-neutral-title'
              }`}
            >
              <div className="text-14">{msg.text}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-left mb-16">
            <div className="inline-block p-12 rounded-8 bg-r-neutral-card">
              <Spin indicator={<LoadingOutlined spin />} size="small" />
              <span className="ml-8 text-r-neutral-foot text-14">
                Generating workflow...
              </span>
            </div>
          </div>
        )}

        {error && (
          <Alert
            message="Generation failed"
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
            className="mb-16"
          />
        )}
      </div>

      {/* Pending Proposal */}
      {pendingProposal && (
        <div className="border-t border-r-neutral-line pt-16">
          {renderDiff()}

          <div className="flex gap-8 mt-16">
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={onApplyProposal}
            >
              Apply Changes
            </Button>
            <Button
              icon={<CloseOutlined />}
              onClick={onRejectProposal}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-r-neutral-line pt-16">
        <div className="flex gap-8">
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Describe your workflow..."
            autoSize={{ minRows: 2, maxRows: 4 }}
            disabled={loading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!input.trim() || loading}
          >
            Generate
          </Button>
        </div>
        <div className="text-r-neutral-foot text-12 mt-8">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
};
