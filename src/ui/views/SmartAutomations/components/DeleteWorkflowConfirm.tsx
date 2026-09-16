import React from 'react';
import { Modal, Button, Alert } from 'antd';
import { DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

interface DeleteWorkflowConfirmProps {
  visible: boolean;
  workflowName: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export const DeleteWorkflowConfirm: React.FC<DeleteWorkflowConfirmProps> = ({
  visible,
  workflowName,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  return (
    <Modal
      title={
        <div className="flex items-center gap-8">
          <DeleteOutlined className="text-r-red-default" />
          <span>Delete Workflow</span>
        </div>
      }
      open={visible}
      onOk={onConfirm}
      onCancel={onCancel}
      confirmLoading={loading}
      okText="Delete"
      cancelText="Cancel"
      okButtonProps={{ danger: true }}
      width={480}
    >
      <div className="flex flex-col gap-16 py-8">
        <Alert
          message="This action cannot be undone"
          description="The workflow will be permanently deleted from your account and will stop executing immediately."
          type="warning"
          showIcon
          icon={<ExclamationCircleOutlined />}
        />

        <div>
          <div className="text-r-neutral-foot text-12 mb-4">Workflow to delete</div>
          <div className="text-r-neutral-title text-14 font-medium">
            {workflowName}
          </div>
        </div>

        <div className="text-r-neutral-foot text-12">
          Any pending executions will be cancelled. You will need to recreate this workflow
          if you want to use it again in the future.
        </div>
      </div>
    </Modal>
  );
};
