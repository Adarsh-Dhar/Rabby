import React from 'react';
import { Input, Card, Collapse, Button, Space, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { MCPWorkflowNode, MCPWorkflowEdge } from 'background/service/keeperhubMCP';
import type { DraftDefinition } from './index';

const { TextArea } = Input;

interface FormPaneProps {
  definition: DraftDefinition;
  onChange: (changes: Partial<DraftDefinition>) => void;
}

export const FormPane: React.FC<FormPaneProps> = ({ definition, onChange }) => {
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ name: e.target.value });
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ description: e.target.value });
  };

  const handleNodeChange = (index: number, field: string, value: any) => {
    const newNodes = [...definition.nodes];
    newNodes[index] = {
      ...newNodes[index],
      [field]: value,
    };
    onChange({ nodes: newNodes });
  };

  const handleNodeDataChange = (index: number, field: string, value: any) => {
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

  const handleNodeConfigChange = (index: number, field: string, value: any) => {
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
    const newNode: MCPWorkflowNode = {
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
    const newEdge: MCPWorkflowEdge = {
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

  const renderNodeConfig = (node: MCPWorkflowNode, index: number) => {
    const config = node.data?.config || {};

    return (
      <div className="flex flex-col gap-8">
        {Object.entries(config).map(([key, value]) => (
          <div key={key} className="flex items-center gap-8">
            <div className="text-r-neutral-foot text-12 w-120">{key}</div>
            <Input
              value={typeof value === 'string' ? value : JSON.stringify(value)}
              onChange={(e) => handleNodeConfigChange(index, key, e.target.value)}
              className="flex-1"
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full p-16 gap-16 overflow-y-auto">
      {/* Basic Info */}
      <Card title="Workflow Details" size="small">
        <div className="flex flex-col gap-12">
          <div>
            <div className="text-r-neutral-foot text-12 mb-4">Name</div>
            <Input
              value={definition.name}
              onChange={handleNameChange}
              placeholder="Workflow name"
            />
          </div>
          {definition.description !== undefined && (
            <div>
              <div className="text-r-neutral-foot text-12 mb-4">Description</div>
              <TextArea
                value={definition.description}
                onChange={handleDescriptionChange}
                placeholder="Workflow description"
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Nodes */}
      <Card
        title={
          <div className="flex items-center justify-between">
            <span>Nodes ({definition.nodes.length})</span>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={addNode}
            >
              Add Node
            </Button>
          </div>
        }
        size="small"
      >
        <div className="flex flex-col gap-12">
          {definition.nodes.map((node, index) => (
            <Collapse
              key={node.id}
              size="small"
              items={[
                {
                  key: node.id,
                  label: (
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-8">
                        <Tag color={node.type === 'trigger' ? 'blue' : node.type === 'action' ? 'green' : 'orange'}>
                          {node.type}
                        </Tag>
                        <span>{node.data?.label || node.id}</span>
                      </span>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNode(index);
                        }}
                      />
                    </div>
                  ),
                  children: (
                    <div className="flex flex-col gap-12">
                      <div className="flex gap-8">
                        <div className="flex-1">
                          <div className="text-r-neutral-foot text-12 mb-4">Label</div>
                          <Input
                            value={node.data?.label || ''}
                            onChange={(e) => handleNodeDataChange(index, 'label', e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="text-r-neutral-foot text-12 mb-4">Type</div>
                          <Input
                            value={node.data?.type || ''}
                            onChange={(e) => handleNodeDataChange(index, 'type', e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-r-neutral-foot text-12 mb-4">Description</div>
                        <TextArea
                          value={node.data?.description || ''}
                          onChange={(e) => handleNodeDataChange(index, 'description', e.target.value)}
                          autoSize={{ minRows: 1, maxRows: 3 }}
                        />
                      </div>
                      <div>
                        <div className="text-r-neutral-foot text-12 mb-4">Config</div>
                        {renderNodeConfig(node, index)}
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          ))}
        </div>
      </Card>

      {/* Edges */}
      <Card
        title={
          <div className="flex items-center justify-between">
            <span>Edges ({definition.edges.length})</span>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={addEdge}
              disabled={definition.nodes.length < 2}
            >
              Add Edge
            </Button>
          </div>
        }
        size="small"
      >
        <div className="flex flex-col gap-8">
          {definition.edges.map((edge, index) => (
            <div key={edge.id} className="flex items-center gap-8 p-8 bg-r-neutral-card rounded-4">
              <div className="flex-1">
                <div className="text-r-neutral-foot text-12 mb-4">Source</div>
                <Input
                  value={edge.source}
                  onChange={(e) => {
                    const newEdges = [...definition.edges];
                    newEdges[index] = { ...newEdges[index], source: e.target.value };
                    onChange({ edges: newEdges });
                  }}
                />
              </div>
              <div className="text-r-neutral-foot">→</div>
              <div className="flex-1">
                <div className="text-r-neutral-foot text-12 mb-4">Target</div>
                <Input
                  value={edge.target}
                  onChange={(e) => {
                    const newEdges = [...definition.edges];
                    newEdges[index] = { ...newEdges[index], target: e.target.value };
                    onChange({ edges: newEdges });
                  }}
                />
              </div>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => removeEdge(index)}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
