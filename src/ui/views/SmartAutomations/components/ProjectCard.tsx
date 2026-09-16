import React from 'react';
import { Card, Button, Switch, Popconfirm, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';

export interface WorkflowRow {
  workflowId: string;
  name: string;
  type: string;
  lastKnownStatus?: 'active' | 'paused' | 'error';
  createdAt: number;
}

interface ProjectCardProps {
  workflow: WorkflowRow;
  onEdit: (workflowId: string) => void;
  onDelete: (workflowId: string) => void;
  onToggleEnabled: (workflowId: string, enabled: boolean) => void;
  loading?: boolean;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  workflow,
  onEdit,
  onDelete,
  onToggleEnabled,
  loading = false,
}) => {
  const handleToggle = async (checked: boolean) => {
    await onToggleEnabled(workflow.workflowId, checked);
  };

  const handleDelete = async () => {
    await onDelete(workflow.workflowId);
  };

  const getStatusColor = () => {
    switch (workflow.lastKnownStatus) {
      case 'active':
        return 'text-r-green-success';
      case 'paused':
        return 'text-r-orange-orange';
      case 'error':
        return 'text-r-red-default';
      default:
        return 'text-r-neutral-foot';
    }
  };

  const getStatusText = () => {
    switch (workflow.lastKnownStatus) {
      case 'active':
        return 'Active';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  const isEnabled = workflow.lastKnownStatus !== 'paused';

  return (
    <Card
      className="border-r-neutral-line hover:border-r-neutral-foot transition-colors"
      loading={loading}
      actions={[
        <Button
          key="edit"
          type="text"
          icon={<EditOutlined />}
          onClick={() => onEdit(workflow.workflowId)}
        >
          Edit
        </Button>,
        <Switch
          key="toggle"
          checked={isEnabled}
          onChange={handleToggle}
          checkedChildren={<PlayCircleOutlined />}
          unCheckedChildren={<PauseCircleOutlined />}
        />,
        <Popconfirm
          key="delete"
          title="Delete this workflow?"
          description="This action cannot be undone. The workflow will be removed from your account."
          onConfirm={handleDelete}
          okText="Delete"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger icon={<DeleteOutlined />}>
            Delete
          </Button>
        </Popconfirm>,
      ]}
    >
      <div className="flex flex-col gap-8">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="text-r-neutral-title text-16 font-medium mb-4">
              {workflow.name}
            </div>
            <div className="text-r-neutral-foot text-12">
              {workflow.type}
            </div>
          </div>
          <div className={`text-12 font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </div>
        </div>
        <div className="text-r-neutral-foot text-12">
          Created {new Date(workflow.createdAt).toLocaleDateString()}
        </div>
      </div>
    </Card>
  );
};
