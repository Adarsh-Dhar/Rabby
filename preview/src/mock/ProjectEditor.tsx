import React, { useState } from 'react';
import { Button, Input } from 'antd';

/**
 * Stub editor. The real ProjectEditor pulls in the delegation/viem/cow-sdk
 * stack, which is irrelevant to previewing the home screen's layout, so this
 * offers just enough of a form to exercise the save/cancel round-trip.
 */
export const ProjectEditor: React.FC<{
  workflowId?: string;
  initialName?: string;
  initialDescription?: string;
  initialNodes?: any[];
  initialEdges?: any[];
  chainId?: number;
  onSave: (params: {
    name: string;
    description?: string;
    nodes: any[];
    edges: any[];
  }) => void;
  onCancel: () => void;
}> = ({ workflowId, initialName, initialDescription, onSave, onCancel }) => {
  const [name, setName] = useState(initialName ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');

  return (
    <div className="p-20">
      <h1 className="text-r-neutral-title1 text-20 font-medium mb-16">
        {workflowId ? 'Edit automation' : 'New automation'}
      </h1>
      <div className="bg-r-neutral-card1 rounded-[10px] border border-solid border-rabby-neutral-line p-16 flex flex-col gap-12">
        <div>
          <div className="text-r-neutral-body text-13 mb-6">Name</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Protect Aave position"
          />
        </div>
        <div>
          <div className="text-r-neutral-body text-13 mb-6">Description</div>
          <Input.TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What should this automation do?"
          />
        </div>
        <div className="flex justify-end gap-8 mt-4">
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            type="primary"
            disabled={!name.trim()}
            onClick={() =>
              onSave({ name: name.trim(), description, nodes: [], edges: [] })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProjectEditor;
