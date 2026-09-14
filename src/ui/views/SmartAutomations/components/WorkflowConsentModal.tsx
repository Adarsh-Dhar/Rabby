import React from 'react';
import { Modal, Button, Input, Checkbox, Alert } from 'antd';

export interface WorkflowConsentSummary {
  protocol: string;
  action: string;
  triggerCondition: string;
  chain: string;
}

interface WorkflowConsentModalProps {
  visible: boolean;
  workflowType: string;
  summary: WorkflowConsentSummary;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export const WorkflowConsentModal: React.FC<WorkflowConsentModalProps> = ({
  visible,
  workflowType,
  summary,
  onConfirm,
  onCancel,
  loading,
}) => {

  return (
    <Modal
      title={`Create ${workflowType}`}
      open={visible}
      onOk={onConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="Create Automation"
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
