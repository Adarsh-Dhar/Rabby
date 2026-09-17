import { createPersistStore } from 'background/utils';
import keeperhubService from './keeperhub';

// MCP-related types for KeeperHub integration
export interface MCPWorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'forEach';
  data: {
    label: string;
    description?: string;
    type: string;
    config: Record<string, unknown>;
    status?: string;
  };
  position?: { x: number; y: number };
}

export interface MCPWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

export interface MCPWorkflowResponse {
  id: string;
  name: string;
  description?: string;
  nodes: MCPWorkflowNode[];
  edges: MCPWorkflowEdge[];
  enabled: boolean;
  projectId?: string;
  tagId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MCPExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  logs: Array<{
    level: 'info' | 'error' | 'warn';
    message: string;
    timestamp: string;
  }>;
  transactionHashes?: Record<string, string>;
}

export interface MCPGenerateWorkflowRequest {
  prompt: string;
  context?: Record<string, unknown>;
}

export interface MCPApiError {
  code: string;
  message: string;
  details?: unknown;
}

class KeeperhubMCPService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = 'https://app.keeperhub.com';
  }

  init = async () => {
    // Initialization happens through keeperhubService
    // No separate init needed as we share the API key
  };

  setApiKey = async (key: string) => {
    await keeperhubService.setApiKey(key);
  };

  getApiKey = async () => await keeperhubService.getApiKey();

  /**
   * Validate the API key format and availability
   */
  validateApiKey = (key: string): boolean => {
    return typeof key === 'string' && key.startsWith('kh_') && key.length > 10;
  };

  /**
   * Generate a workflow using KeeperHub's AI generation
   * This corresponds to the ai_generate_workflow MCP tool
   */
  async generateWorkflow(
    request: MCPGenerateWorkflowRequest
  ): Promise<MCPWorkflowResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('KeeperHub API key is not configured');
    }

    if (!this.validateApiKey(apiKey)) {
      throw new Error('Invalid KeeperHub API key format');
    }

    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error('Workflow generation prompt is required');
    }

    try {
      // Single canonical endpoint for AI workflow generation
      const endpoint = `${this.baseUrl}/api/workflows/ai-generate`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        credentials: 'omit',
      });

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Workflow generation failed: ${response.status} - ${errorText}`
        );
      }

      const result = await response.json();

      if (!result.nodes || !Array.isArray(result.nodes)) {
        throw new Error('Invalid workflow response: missing nodes');
      }
      if (!result.edges || !Array.isArray(result.edges)) {
        throw new Error('Invalid workflow response: missing edges');
      }

      return result;
    } catch (error) {
      console.error('KeeperHub MCP workflow generation error:', error);

      if (error instanceof Error) {
        if (
          error.message.includes('API key') ||
          error.message.includes('prompt')
        ) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network') ||
          error.message.includes('Failed to fetch')
        ) {
          throw new Error(
            'Network error connecting to KeeperHub. Please check your connection.'
          );
        }
      }

      throw new Error('Failed to generate workflow. Please try again later.');
    }
  }

  /**
   * Create a workflow with generated nodes and edges
   * This corresponds to the create_workflow MCP tool
   */
  async createWorkflow(params: {
    name: string;
    description?: string;
    nodes: MCPWorkflowNode[];
    edges: MCPWorkflowEdge[];
    enabled?: boolean;
    projectId?: string;
    tagId?: string;
  }): Promise<MCPWorkflowResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('KeeperHub API key is not configured');
    }

    if (!this.validateApiKey(apiKey)) {
      throw new Error('Invalid KeeperHub API key format');
    }

    if (!params.name || params.name.trim().length === 0) {
      throw new Error('Workflow name is required');
    }

    if (
      !params.nodes ||
      !Array.isArray(params.nodes) ||
      params.nodes.length === 0
    ) {
      throw new Error('Workflow must have at least one node');
    }

    if (!params.edges || !Array.isArray(params.edges)) {
      throw new Error('Workflow edges must be an array');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/workflows/create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        credentials: 'omit',
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Workflow creation failed: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!result.id) {
        throw new Error('Invalid workflow response: missing workflow ID');
      }

      return result;
    } catch (error) {
      console.error('KeeperHub MCP workflow creation error:', error);

      if (error instanceof Error) {
        if (
          error.message.includes('API key') ||
          error.message.includes('name') ||
          error.message.includes('nodes')
        ) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw new Error(
            'Network error connecting to KeeperHub. Please check your connection.'
          );
        }
      }

      throw new Error('Failed to create workflow. Please try again later.');
    }
  }

  /**
   * Execute a workflow manually
   * This corresponds to the execute_workflow MCP tool
   */
  async executeWorkflow(workflowId: string): Promise<{ executionId: string }> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('KeeperHub API key is not configured');
    }

    if (!workflowId || workflowId.trim().length === 0) {
      throw new Error('Workflow ID is required');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/workflows/${workflowId}/execute`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          credentials: 'omit',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Workflow execution failed: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!result.executionId) {
        throw new Error('Invalid execution response: missing execution ID');
      }

      return result;
    } catch (error) {
      console.error('KeeperHub MCP workflow execution error:', error);

      if (error instanceof Error) {
        if (
          error.message.includes('API key') ||
          error.message.includes('Workflow ID')
        ) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw new Error(
            'Network error connecting to KeeperHub. Please check your connection.'
          );
        }
      }

      throw new Error('Failed to execute workflow. Please try again later.');
    }
  }

  /**
   * Get execution status and logs
   * This corresponds to the get_execution MCP tool
   */
  async getExecution(executionId: string): Promise<MCPExecution> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('KeeperHub API key is not configured');
    }

    if (!executionId || executionId.trim().length === 0) {
      throw new Error('Execution ID is required');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/executions/${executionId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          credentials: 'omit',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to get execution: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      console.error('KeeperHub MCP get execution error:', error);

      if (error instanceof Error) {
        if (
          error.message.includes('API key') ||
          error.message.includes('Execution ID')
        ) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw new Error(
            'Network error connecting to KeeperHub. Please check your connection.'
          );
        }
      }

      throw new Error(
        'Failed to get execution status. Please try again later.'
      );
    }
  }

  /**
   * List executions for a workflow
   * NOTE: The endpoint path (GET /api/workflows/{id}/executions) is inferred from the existing pattern
   * and has not been verified against KeeperHub's actual API documentation. This should be confirmed
   * before shipping to production.
   */
  async listExecutions(workflowId: string): Promise<MCPExecution[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('KeeperHub API key is not configured');
    }

    if (!workflowId || workflowId.trim().length === 0) {
      throw new Error('Workflow ID is required');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/workflows/${workflowId}/executions`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          credentials: 'omit',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to list executions: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!Array.isArray(result)) {
        throw new Error('Invalid executions response: expected an array');
      }

      return result;
    } catch (error) {
      console.error('KeeperHub MCP list executions error:', error);

      if (error instanceof Error) {
        if (
          error.message.includes('API key') ||
          error.message.includes('Workflow ID')
        ) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw new Error(
            'Network error connecting to KeeperHub. Please check your connection.'
          );
        }
      }

      throw new Error('Failed to list executions. Please try again later.');
    }
  }

  /**
   * List workflows for the organization
   * This corresponds to the list_workflows MCP tool
   */
  async listWorkflows(params?: {
    projectId?: string;
    tagId?: string;
  }): Promise<MCPWorkflowResponse[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('KeeperHub API key is not configured');
    }

    if (!this.validateApiKey(apiKey)) {
      throw new Error('Invalid KeeperHub API key format');
    }

    try {
      const url = new URL(`${this.baseUrl}/api/workflows`);
      if (params?.projectId)
        url.searchParams.append('projectId', params.projectId);
      if (params?.tagId) url.searchParams.append('tagId', params.tagId);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        credentials: 'omit',
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to list workflows: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!Array.isArray(result)) {
        throw new Error('Invalid workflows response: expected an array');
      }

      return result;
    } catch (error) {
      console.error('KeeperHub MCP list workflows error:', error);

      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw new Error(
            'Network error connecting to KeeperHub. Please check your connection.'
          );
        }
      }

      throw new Error('Failed to list workflows. Please try again later.');
    }
  }

  /**
   * Update a workflow
   * NOTE: The endpoint path (PATCH /api/workflows/{id}) is inferred from the existing pattern
   * and has not been verified against KeeperHub's actual API documentation. This should be confirmed
   * before shipping to production.
   */
  async updateWorkflow(
    workflowId: string,
    patch: {
      name?: string;
      description?: string;
      enabled?: boolean;
      nodes?: MCPWorkflowNode[];
      edges?: MCPWorkflowEdge[];
    }
  ): Promise<MCPWorkflowResponse> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('KeeperHub API key is not configured');
    }

    if (!this.validateApiKey(apiKey)) {
      throw new Error('Invalid KeeperHub API key format');
    }

    if (!workflowId || workflowId.trim().length === 0) {
      throw new Error('Workflow ID is required');
    }

    if (Object.keys(patch).length === 0) {
      throw new Error('Update patch must include at least one field');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/workflows/${workflowId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(patch),
          credentials: 'omit',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Workflow update failed: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!result.id) {
        throw new Error('Invalid workflow response: missing workflow ID');
      }

      return result;
    } catch (error) {
      console.error('KeeperHub MCP workflow update error:', error);

      if (error instanceof Error) {
        if (
          error.message.includes('API key') ||
          error.message.includes('Workflow ID')
        ) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw new Error(
            'Network error connecting to KeeperHub. Please check your connection.'
          );
        }
      }

      throw new Error('Failed to update workflow. Please try again later.');
    }
  }

  /**
   * Delete a workflow
   * NOTE: The endpoint path (DELETE /api/workflows/{id}) is inferred from the existing pattern
   * and has not been verified against KeeperHub's actual API documentation. This should be confirmed
   * before shipping to production.
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('KeeperHub API key is not configured');
    }

    if (!this.validateApiKey(apiKey)) {
      throw new Error('Invalid KeeperHub API key format');
    }

    if (!workflowId || workflowId.trim().length === 0) {
      throw new Error('Workflow ID is required');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/workflows/${workflowId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          credentials: 'omit',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Workflow deletion failed: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }

        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('KeeperHub MCP workflow deletion error:', error);

      if (error instanceof Error) {
        if (
          error.message.includes('API key') ||
          error.message.includes('Workflow ID')
        ) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw new Error(
            'Network error connecting to KeeperHub. Please check your connection.'
          );
        }
      }

      throw new Error('Failed to delete workflow. Please try again later.');
    }
  }

  /**
   * Validate a workflow before creation
   * This corresponds to the validate_workflow MCP tool
   */
  async validateWorkflow(params: {
    nodes: MCPWorkflowNode[];
    edges: MCPWorkflowEdge[];
  }): Promise<{ valid: boolean; errors?: string[] }> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('KeeperHub API key is not configured');
    }

    if (!this.validateApiKey(apiKey)) {
      throw new Error('Invalid KeeperHub API key format');
    }

    if (!params.nodes || !Array.isArray(params.nodes)) {
      throw new Error('Workflow nodes must be an array');
    }

    if (!params.edges || !Array.isArray(params.edges)) {
      throw new Error('Workflow edges must be an array');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/workflows/validate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        credentials: 'omit',
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Workflow validation failed: ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }

        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      console.error('KeeperHub MCP workflow validation error:', error);

      if (error instanceof Error) {
        if (
          error.message.includes('API key') ||
          error.message.includes('nodes') ||
          error.message.includes('edges')
        ) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw new Error(
            'Network error connecting to KeeperHub. Please check your connection.'
          );
        }
      }

      throw new Error('Failed to validate workflow. Please try again later.');
    }
  }

  /**
   * Find a workflow by name
   * NOTE: This is a placeholder for the future general-chat entry point.
   * When the chat system supports talking to automations by name (not just click-into-project),
   * this will be used to resolve a workflow ID from a user-provided name.
   * Currently not implemented as per the click-into-project-only scope.
   */
  // async findWorkflowByName(name: string): Promise<MCPWorkflowResponse | null> {
  //   // Future implementation: search workflows by name and return the match
  //   return null;
  // }
}

export default new KeeperhubMCPService();
