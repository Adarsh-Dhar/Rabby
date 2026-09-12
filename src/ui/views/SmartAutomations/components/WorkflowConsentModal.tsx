import React from 'react';
import { Modal, Button, Input, Checkbox, Alert } from 'antd';

export interface WorkflowConsentSummary {
  protocol: string;
  action: string;
  // Human-readable description shown when unlimited approval is selected,
  // e.g. "Full USDC debt balance (unlimited approval)".
  maxAmount: string;
  triggerCondition: string;
  chain: string;
  // Symbol shown next to the amount input, e.g. "USDC". Omit to hide the
  // scoped-amount control entirely (used for automations with no approve
  // step, like the yield harvester).
  tokenSymbol?: string;
}

interface WorkflowConsentModalProps {
  visible: boolean;
  workflowType: string;
  summary: WorkflowConsentSummary;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  // Scoped-amount controls. Only rendered when summary.tokenSymbol is set.
  amount: string;
  onAmountChange: (value: string) => void;
  unlimited: boolean;
  onUnlimitedChange: (value: boolean) => void;
  amountError?: string | null;
}

export const WorkflowConsentModal: React.FC<WorkflowConsentModalProps> = ({
  visible,
  workflowType,
  summary,
  onConfirm,
  onCancel,
  loading,
  amount,
  onAmountChange,
  unlimited,
  onUnlimitedChange,
  amountError,
}) => {
  const showAmountControl = Boolean(summary.tokenSymbol);
  const confirmDisabled = showAmountControl && !unlimited && (!amount || Boolean(amountError));

  return (
    <Modal
      title={`Create ${workflowType}`}
      open={visible}
      onOk={onConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="Create Automation"
      okButtonProps={{ disabled: confirmDisabled }}
      cancelText="Cancel"
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

        {showAmountControl ? (
          <div>
            <div className="text-r-neutral-foot text-12 mb-4">
              Approval amount
            </div>
            <Input
              placeholder={`Amount in ${summary.tokenSymbol}`}
              value={amount}
              disabled={unlimited}
              onChange={(e) => onAmountChange(e.target.value)}
              suffix={summary.tokenSymbol}
              status={amountError ? 'error' : undefined}
            />
            {amountError && (
              <div className="text-red-forbidden text-12 mt-4">
                {amountError}
              </div>
            )}
            <Checkbox
              className="mt-8"
              checked={unlimited}
              onChange={(e) => onUnlimitedChange(e.target.checked)}
            >
              Allow unlimited approval (not recommended)
            </Checkbox>
            <Alert
              className="mt-8"
              type="warning"
              showIcon
              message={
                unlimited
                  ? `This lets the automation spend any amount of your ${summary.tokenSymbol}, indefinitely, until you revoke it.`
                  : `The automation can only spend up to the amount above. It cannot spend more even if the trigger condition fires multiple times before you revoke it.`
              }
            />
          </div>
        ) : (
          <div>
            <div className="text-r-neutral-foot text-12 mb-4">Max Amount</div>
            <div className="text-r-neutral-title text-14">{summary.maxAmount}</div>
          </div>
        )}

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
      </div>
    </Modal>
  );
};
