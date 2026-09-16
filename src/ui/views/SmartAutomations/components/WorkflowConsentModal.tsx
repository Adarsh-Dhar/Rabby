import React from 'react';
import { Modal, Button, Input, Checkbox, Alert, Divider } from 'antd';

export interface WorkflowConsentSummary {
  protocol: string;
  action: string;
  triggerCondition: string;
  chain: string;
  tokenSymbol?: string;
  maxAmount?: string;
}

export interface WorkflowDiff {
  field: string;
  before: string;
  after: string;
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
  // Diff support for showing what changed in an edit
  diffs?: WorkflowDiff[];
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
  diffs,
}) => {
  const confirmDisabled =
    showApprovalControls && !allowUnlimited && !amountValid;

  const title = diffs && diffs.length > 0 ? `Update ${workflowType}` : `Create ${workflowType}`;
  const okText = diffs && diffs.length > 0 ? 'Update Automation' : 'Create Automation';

  return (
    <Modal
      title={title}
      open={visible}
      onOk={onConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      okText={okText}
      cancelText="Cancel"
      okButtonProps={{ disabled: confirmDisabled }}
      width={560}
    >
      <div className="flex flex-col gap-12 py-8">
        {/* Show diffs if this is an edit */}
        {diffs && diffs.length > 0 && (
          <>
            <div className="bg-r-blue-light bg-opacity-5 p-12 rounded-8">
              <div className="text-r-neutral-foot text-12 mb-8">Changes</div>
              {diffs.map((diff, idx) => (
                <div key={idx} className="mb-8 last:mb-0">
                  <div className="text-r-neutral-foot text-12 mb-4">{diff.field}</div>
                  <div className="flex items-center gap-8">
                    <span className="text-r-red-default line-through text-14">
                      {diff.before}
                    </span>
                    <span className="text-r-neutral-foot">→</span>
                    <span className="text-r-green-success text-14">
                      {diff.after}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Divider />
          </>
        )}

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
