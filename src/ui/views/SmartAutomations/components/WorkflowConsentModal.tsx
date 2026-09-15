import React from 'react';
import { Modal, Button, Input, Checkbox, Alert } from 'antd';

export interface WorkflowConsentSummary {
  protocol: string;
  action: string;
  triggerCondition: string;
  chain: string;
  tokenSymbol?: string;
  maxAmount?: string;
}

interface WorkflowConsentModalProps {
  visible: boolean;
  workflowType: string;
  summary: WorkflowConsentSummary;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  // Approval-scoping controls. Omit `showApprovalControls` (or pass false)
  // for workflows that don't spend an allowance at all (e.g. Yield
  // Harvester, which only claims rewards to the user) — showing an amount
  // input for a workflow with nothing to approve would be actively
  // misleading, not just unnecessary.
  showApprovalControls?: boolean;
  amount?: string;
  onAmountChange?: (value: string) => void;
  allowUnlimited?: boolean;
  onAllowUnlimitedChange?: (value: boolean) => void;
  amountValid?: boolean;
}

export const WorkflowConsentModal: React.FC<WorkflowConsentModalProps> = ({
  visible,
  workflowType,
  summary,
  onConfirm,
  onCancel,
  loading,
  showApprovalControls = false,
  amount = '',
  onAmountChange,
  allowUnlimited = false,
  onAllowUnlimitedChange,
  amountValid = false,
}) => {
  const confirmDisabled =
    showApprovalControls && !allowUnlimited && !amountValid;

  return (
    <Modal
      title={`Create ${workflowType}`}
      open={visible}
      onOk={onConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="Create Automation"
      cancelText="Cancel"
      okButtonProps={{ disabled: confirmDisabled }}
    >
      <div className="flex flex-col gap-12 py-8">
        <div>
          <div className="text-r-neutral-foot text-12 mb-4">Protocol</div>
          <div className="text-r-neutral-title text-14">{summary.protocol}</div>
        </div>
        <div>
          <div className="text-r-neutral-foot text-12 mb-4">Action</div>
          <div className="text-r-neutral-title text-14">{summary.action}</div>
        </div>
        <div>
          <div className="text-r-neutral-foot text-12 mb-4">Trigger Condition</div>
          <div className="text-r-neutral-title text-14">
            {summary.triggerCondition}
          </div>
        </div>
        <div>
          <div className="text-r-neutral-foot text-12 mb-4">Chain</div>
          <div className="text-r-neutral-title text-14">{summary.chain}</div>
        </div>

        {showApprovalControls && (
          <div className="border-t border-r-neutral-line pt-12 mt-4">
            <div className="text-r-neutral-foot text-12 mb-4">
              Approval amount{summary.tokenSymbol ? ` (${summary.tokenSymbol})` : ''}
            </div>
            <Input
              placeholder="Amount this automation is allowed to spend"
              value={amount}
              disabled={allowUnlimited}
              onChange={(e) => onAmountChange?.(e.target.value)}
            />
            <div className="mt-8">
              <Checkbox
                checked={allowUnlimited}
                onChange={(e) => onAllowUnlimitedChange?.(e.target.checked)}
              >
                Allow unlimited approval (not recommended)
              </Checkbox>
            </div>
            {allowUnlimited && (
              <Alert
                type="warning"
                showIcon
                className="mt-8"
                message="This automation will be able to spend without a cap"
                description="Once this executes without you present to review it, an unlimited approval means a bug in the workflow — or a bad response from KeeperHub's remote generation service — has no ceiling on what it can move. Prefer setting an explicit amount above unless you have a specific reason not to."
              />
            )}
            {!allowUnlimited && !amountValid && (
              <div className="text-r-red-default text-12 mt-4">
                Enter a valid amount to continue, or check "allow unlimited" above.
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
