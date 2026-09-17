import React from 'react';
import { Card, Button, Switch, Popconfirm } from 'antd';
import { ReactComponent as RcIconEdit } from 'ui/assets/edit-pen-cc.svg';
import { ReactComponent as RcIconDelete } from 'ui/assets/address/delete.svg';
import ThemeIcon from '@/ui/component/ThemeMode/ThemeIcon';

export interface WorkflowRow {
  workflowId: string;
  name: string;
  description?: string;
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
      className="h-full border-r-neutral-line hover:border-r-neutral-foot transition-colors"
      bodyStyle={{ padding: 16 }}
      loading={loading}
    >
      <div className="flex flex-col gap-16 h-full">
        <div className="flex justify-between items-start gap-12">
          <div className="flex-1 min-w-0">
            <div className="text-r-neutral-title text-16 font-medium mb-4 truncate">
              {workflow.name}
            </div>
            {workflow.description && (
              <div className="text-r-neutral-body text-12 mb-2 truncate">
                {workflow.description}
              </div>
            )}
            <div className="text-r-neutral-foot text-12">{workflow.type}</div>
          </div>
          <div
            className={`shrink-0 rounded-4 px-8 py-4 text-12 font-medium ${getStatusColor()}`}
          >
            {getStatusText()}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-r-neutral-foot text-12">
            Created {new Date(workflow.createdAt).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-8">
            <Button
              type="text"
              size="small"
              icon={<ThemeIcon src={RcIconEdit} className="w-14 h-14" />}
              onClick={() => onEdit(workflow.workflowId)}
            />
            <Switch size="small" checked={isEnabled} onChange={handleToggle} />
            <Popconfirm
              title="Delete this workflow? This action cannot be undone. The workflow will be removed from your account."
              onConfirm={handleDelete}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<ThemeIcon src={RcIconDelete} className="w-14 h-14" />}
              />
            </Popconfirm>
          </div>
        </div>
      </div>
    </Card>
  );
};
