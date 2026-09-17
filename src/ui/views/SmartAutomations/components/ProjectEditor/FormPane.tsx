import React from 'react';
import { Input, Collapse, Button, Tag } from 'antd';
import { ReactComponent as RcIconPlus } from 'ui/assets/plus.svg';
import { ReactComponent as RcIconDelete } from 'ui/assets/address/delete.svg';
import ThemeIcon from '@/ui/component/ThemeMode/ThemeIcon';
import type { DraftDefinition } from './index';

const { TextArea } = Input;
const { Panel } = Collapse;

// Same wrapper contract as ProjectEditor's header/tab bar and ChatPane:
// px-20 on this component's own root, then a centered column capped at
// 1180px via inline style rather than the `max-w-[1180px]` bracket class
// this file used before.
const centeredColumnStyle: React.CSSProperties = { maxWidth: 1180 };

interface NodeData {
  label?: string;
  type?: string;
  description?: string;
  config?: {
    actionType?: string;
    contractAddress?: string;
    functionName?: string;
    functionArgs?: string;
    triggerType?: string;
    [key: string]: unknown;
  };
}

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'forEach';
  data: NodeData;
  position?: { x: number; y: number };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

interface FormPaneProps {
  definition: DraftDefinition;
  onChange: (changes: Partial<DraftDefinition>) => void;
}

export const FormPane: React.FC<FormPaneProps> = ({ definition, onChange }) => {
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ name: e.target.value });
  };

  const handleDescriptionChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    onChange({ description: e.target.value });
  };

  const handleNodeChange = (index: number, field: string, value: unknown) => {
    const newNodes = [...definition.nodes];
    newNodes[index] = {
      ...newNodes[index],
      [field]: value,
    };
    onChange({ nodes: newNodes });
  };

  const handleNodeDataChange = (
    index: number,
    field: string,
    value: unknown
  ) => {
    const newNodes = [...definition.nodes];
    newNodes[index] = {
      ...newNodes[index],
      data: {
        ...newNodes[index].data,
        [field]: value,
      },
    };
    onChange({ nodes: newNodes });
  };

  const handleNodeConfigChange = (
    index: number,
    field: string,
    value: unknown
  ) => {
    const newNodes = [...definition.nodes];
    newNodes[index] = {
      ...newNodes[index],
      data: {
        ...newNodes[index].data,
        config: {
          ...newNodes[index].data?.config,
          [field]: value,
        },
      },
    };
    onChange({ nodes: newNodes });
  };

  const addNode = () => {
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'action',
      data: {
        label: 'New Node',
        type: 'action',
        config: {},
      },
      position: { x: 100, y: 100 + definition.nodes.length * 100 },
    };
    onChange({ nodes: [...definition.nodes, newNode] });
  };

  const removeNode = (index: number) => {
    const newNodes = definition.nodes.filter((_, i) => i !== index);
    onChange({ nodes: newNodes });
  };

  const addEdge = () => {
    if (definition.nodes.length < 2) {
      return; // Need at least 2 nodes to create an edge
    }
    const newEdge: WorkflowEdge = {
      id: `edge-${Date.now()}`,
      source: definition.nodes[0].id,
      target: definition.nodes[definition.nodes.length - 1].id,
    };
    onChange({ edges: [...definition.edges, newEdge] });
  };

  const removeEdge = (index: number) => {
    const newEdges = definition.edges.filter((_, i) => i !== index);
    onChange({ edges: newEdges });
  };

  const renderNodeConfig = (node: WorkflowNode, index: number) => {
    const config = node.data?.config || {};

    return (
      <div className="flex flex-col gap-8">
        {Object.entries(config).map(([key, value]) => (
          <div key={key} className="flex items-center gap-8">
            <div className="text-r-neutral-foot text-12 w-120">{key}</div>
            <Input
              value={typeof value === 'string' ? value : JSON.stringify(value)}
              onChange={(e) =>
                handleNodeConfigChange(index, key, e.target.value)
              }
              className="flex-1"
              size="small"
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 h-full flex-col overflow-y-auto bg-r-neutral-bg px-20 py-20">
      <div
        className="mx-auto flex w-full flex-col gap-16"
        style={centeredColumnStyle}
      >
        {/* Basic Info */}
        <div className="rounded-8 border border-r-neutral-line bg-r-neutral-card p-16">
          <div className="text-r-neutral-title text-14 font-medium mb-12">
            Workflow Details
          </div>
          <div className="flex flex-col gap-12">
            <div>
              <div className="text-r-neutral-foot text-12 mb-6">Name</div>
              <Input
                value={definition.name}
                onChange={handleNameChange}
                placeholder="Workflow name"
                size="small"
              />
            </div>
            {definition.description !== undefined && (
              <div>
                <div className="text-r-neutral-foot text-12 mb-4">
                  Description
                </div>
                <TextArea
                  value={definition.description}
                  onChange={handleDescriptionChange}
                  placeholder="Workflow description"
                  autoSize={{ minRows: 2, maxRows: 4 }}
                  size="small"
                />
              </div>
            )}
          </div>
        </div>

        {/* Nodes */}
        <div className="rounded-8 border border-r-neutral-line bg-r-neutral-card p-16">
          <div className="mb-16 flex items-center justify-between gap-12">
            <div>
              <div className="text-r-neutral-title text-14 font-medium">
                Nodes
              </div>
              <div className="text-r-neutral-foot text-12 mt-4">
                {definition.nodes.length}{' '}
                {definition.nodes.length === 1 ? 'step' : 'steps'} in this
                workflow
              </div>
            </div>
            <Button
              type="primary"
              size="small"
              className="h-32 min-w-[142px] shrink-0 whitespace-nowrap px-14"
              onClick={addNode}
            >
              Add Node
            </Button>
          </div>
          {definition.nodes.length === 0 ? (
            <div className="rounded-6 border border-dashed border-r-neutral-line bg-r-neutral-card-1 px-16 py-24 text-center">
              <div className="text-r-neutral-title text-14 font-medium">
                No nodes yet
              </div>
              <div className="mt-4 text-r-neutral-foot text-12">
                Add a trigger or action to start building this workflow.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-12">
              {definition.nodes.map((node: WorkflowNode, index: number) => (
                <Collapse
                  key={node.id}
                  className="overflow-hidden rounded-8 border border-r-neutral-line bg-r-neutral-card"
                >
                  <Panel
                    header={
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-8">
                          <Tag
                            color={
                              node.type === 'trigger'
                                ? 'blue'
                                : node.type === 'action'
                                ? 'green'
                                : 'orange'
                            }
                          >
                            {node.type}
                          </Tag>
                          <span>{node.data?.label || node.id}</span>
                        </span>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={
                            <ThemeIcon
                              src={RcIconDelete}
                              className="w-14 h-14"
                            />
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNode(index);
                          }}
                        />
                      </div>
                    }
                    key={node.id}
                  >
                    <div className="flex flex-col gap-12">
                      <div className="flex gap-8">
                        <div className="flex-1">
                          <div className="text-r-neutral-foot text-12 mb-4">
                            Label
                          </div>
                          <Input
                            value={node.data?.label || ''}
                            onChange={(e) =>
                              handleNodeDataChange(
                                index,
                                'label',
                                e.target.value
                              )
                            }
                            size="small"
                          />
                        </div>
                        <div className="flex-1">
                          <div className="text-r-neutral-foot text-12 mb-4">
                            Type
                          </div>
                          <Input
                            value={node.data?.type || ''}
                            onChange={(e) =>
                              handleNodeDataChange(
                                index,
                                'type',
                                e.target.value
                              )
                            }
                            size="small"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-r-neutral-foot text-12 mb-4">
                          Description
                        </div>
                        <TextArea
                          value={node.data?.description || ''}
                          onChange={(e) =>
                            handleNodeDataChange(
                              index,
                              'description',
                              e.target.value
                            )
                          }
                          autoSize={{ minRows: 1, maxRows: 3 }}
                          size="small"
                        />
                      </div>
                      <div>
                        <div className="text-r-neutral-foot text-12 mb-4">
                          Config
                        </div>
                        {renderNodeConfig(node, index)}
                      </div>
                    </div>
                  </Panel>
                </Collapse>
              ))}
            </div>
          )}
        </div>

        {/* Edges */}
        <div className="bg-r-neutral-card rounded-8 p-16">
          <div className="flex items-center justify-between mb-12">
            <div className="text-r-neutral-title text-14 font-medium">
              Edges ({definition.edges.length})
            </div>
            <Button
              type="primary"
              size="small"
              className="h-32 min-w-[142px] shrink-0 whitespace-nowrap px-14"
              onClick={addEdge}
            >
              Add Edge
            </Button>
          </div>
          <div className="flex flex-col gap-8">
            {definition.edges.map((edge: WorkflowEdge, index: number) => (
              <div
                key={edge.id}
                className="flex items-center gap-8 p-8 bg-r-neutral-card-1 rounded-4"
              >
                <div className="flex-1">
                  <div className="text-r-neutral-foot text-12 mb-4">Source</div>
                  <Input
                    value={edge.source}
                    onChange={(e) => {
                      const newEdges = [...definition.edges];
                      newEdges[index] = {
                        ...newEdges[index],
                        source: e.target.value,
                      };
                      onChange({ edges: newEdges });
                    }}
                    size="small"
                  />
                </div>
                <div className="text-r-neutral-foot">→</div>
                <div className="flex-1">
                  <div className="text-r-neutral-foot text-12 mb-4">Target</div>
                  <Input
                    value={edge.target}
                    onChange={(e) => {
                      const newEdges = [...definition.edges];
                      newEdges[index] = {
                        ...newEdges[index],
                        target: e.target.value,
                      };
                      onChange({ edges: newEdges });
                    }}
                    size="small"
                  />
                </div>
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<ThemeIcon src={RcIconDelete} className="w-14 h-14" />}
                  onClick={() => removeEdge(index)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};