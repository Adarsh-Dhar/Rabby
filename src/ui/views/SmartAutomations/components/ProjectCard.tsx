import React from 'react';
import { Button, Switch, Popconfirm, Tooltip } from 'antd';
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

const TYPE_LABELS: Record<string, string> = {
  'health-factor': 'Health Factor',
  twap: 'TWAP / DCA',
  dca: 'DCA',
};

const formatType = (type: string) =>
  TYPE_LABELS[type] ||
  type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

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

  const status = workflow.lastKnownStatus ?? 'paused';

  const statusStyles: Record<
    string,
    { dot: string; text: string; label: string }
  > = {
    active: {
      dot: 'bg-r-green-default',
      text: 'text-r-green-default',
      label: 'Active',
    },
    paused: {
      dot: 'bg-r-orange-default',
      text: 'text-r-orange-default',
      label: 'Paused',
    },
    error: {
      dot: 'bg-r-red-default',
      text: 'text-r-red-default',
      label: 'Error',
    },
  };

  const statusStyle = statusStyles[status] ?? statusStyles.paused;
  const isEnabled = status !== 'paused';

  return (
    <div
      className={`group relative flex flex-col h-full rounded-[10px] border border-solid border-rabby-neutral-line bg-r-neutral-card1 p-16 transition-all hover:border-rabby-blue-default hover:shadow-[0_8px_24px_0_rgba(0,0,0,0.08)] ${
        loading ? 'opacity-60 pointer-events-none' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-8 mb-10">
        <div className="min-w-0 flex-1">
          <div className="text-r-neutral-title1 text-15 font-medium truncate">
            {workflow.name}
          </div>
          <div className="mt-4 inline-flex items-center rounded-[4px] bg-r-neutral-card2 px-6 py-2 text-11 font-medium text-r-neutral-body">
            {formatType(workflow.type)}
          </div>
        </div>
        <div
          className={`flex shrink-0 items-center gap-4 text-12 font-medium ${statusStyle.text}`}
        >
          <span className={`w-6 h-6 rounded-full ${statusStyle.dot}`} />
          {statusStyle.label}
        </div>
      </div>

      {workflow.description ? (
        <div className="text-r-neutral-body text-12 leading-[18px] mb-14 line-clamp-2 min-h-[36px]">
          {workflow.description}
        </div>
      ) : (
        <div className="text-r-neutral-foot text-12 italic mb-14 min-h-[36px]">
          No description
        </div>
      )}

      <div className="mt-auto flex items-center justify-between border-0 border-t border-solid border-rabby-neutral-line pt-12">
        <div className="text-r-neutral-foot text-11">
          {new Date(workflow.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>
        <div className="flex items-center gap-6">
          <Tooltip title={isEnabled ? 'Pause' : 'Resume'}>
            <Switch size="small" checked={isEnabled} onChange={handleToggle} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<ThemeIcon src={RcIconEdit} className="w-14 h-14" />}
              onClick={() => onEdit(workflow.workflowId)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this workflow? This action cannot be undone."
            onConfirm={handleDelete}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Delete">
              <Button
                type="text"
                size="small"
                danger
                icon={<ThemeIcon src={RcIconDelete} className="w-14 h-14" />}
              />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
};
