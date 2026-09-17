import { createPersistStore } from 'background/utils';
import type { MCPWorkflowNode, MCPWorkflowEdge } from './keeperhubMCP';

interface AiProviderStore {
  geminiApiKey: string;
}

class AiProviderService {
  store!: AiProviderStore;
  private geminiApiKey: string;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.geminiApiKey = '';
  }

  init = async () => {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.store = await createPersistStore<AiProviderStore>({
        name: 'aiProvider',
        template: {
          geminiApiKey: '',
        },
      });
      this.geminiApiKey = this.store.geminiApiKey || '';
      this.initialized = true;
    })();

    await this.initPromise;
  };

  private ensureInitialized = async () => {
    if (!this.initialized) {
      await this.init();
    }
  };

  setGeminiApiKey = async (key: string) => {
    await this.ensureInitialized();
    this.geminiApiKey = key;
    this.store.geminiApiKey = key;
  };

  getGeminiApiKey = async () => {
    await this.ensureInitialized();
    return this.geminiApiKey;
  };

  getGeminiApiKeyStatus = async (): Promise<boolean> => {
    await this.ensureInitialized();
    return this.geminiApiKey.length > 0;
  };

  clearGeminiApiKey = async () => {
    await this.ensureInitialized();
    this.geminiApiKey = '';
    this.store.geminiApiKey = '';
  };

  /**
   * Multi-turn chat call to Gemini 3.5 Flash-Lite for workflow generation.
   * Uses structured outputs to ensure the response matches MCPWorkflowNode/MCPWorkflowEdge exactly.
   *
   * @param params - Chat parameters including message history and current workflow definition
   * @returns Structured workflow proposal with nodes, edges, and a human-readable summary
   */
  async proposeWorkflow(params: {
    messages: { role: 'user' | 'model'; text: string }[];
    currentDefinition?: {
      name: string;
      nodes: MCPWorkflowNode[];
      edges: MCPWorkflowEdge[];
    };
    chainId: number;
    address: string;
  }): Promise<{
    name: string;
    description?: string;
    nodes: MCPWorkflowNode[];
    edges: MCPWorkflowEdge[];
    summary: string;
  }> {
    const apiKey = await this.getGeminiApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key is not configured');
    }

    if (!params.messages || params.messages.length === 0) {
      throw new Error('At least one message is required');
    }

    // Ensure the last message is from the user (Gemini constraint)
    const lastMessage = params.messages[params.messages.length - 1];
    if (lastMessage.role !== 'user') {
      throw new Error('The last message must be from the user');
    }

    // Build the system prompt with schema and few-shot examples
    const systemPrompt = this.buildSystemPrompt(
      params.currentDefinition,
      params.chainId,
      params.address
    );

    // Convert messages to Gemini format
    const contents = params.messages.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    }));

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents,
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: this.getResponseSchema(),
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      if (!result.candidates || result.candidates.length === 0) {
        throw new Error('No response from Gemini');
      }

      const candidate = result.candidates[0];
      if (
        !candidate.content ||
        !candidate.content.parts ||
        candidate.content.parts.length === 0
      ) {
        throw new Error('Invalid response structure from Gemini');
      }

      const text = candidate.content.parts[0].text;
      const parsed = JSON.parse(text);

      // Validate the response structure
      if (!parsed.name || !parsed.nodes || !parsed.edges || !parsed.summary) {
        throw new Error(
          'Invalid workflow response from Gemini: missing required fields'
        );
      }

      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new Error(
          'Invalid workflow response from Gemini: nodes and edges must be arrays'
        );
      }

      return parsed;
    } catch (error) {
      console.error('Gemini workflow generation error:', error);

      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          throw error;
        }
        if (
          error.message.includes('fetch') ||
          error.message.includes('network')
        ) {
          throw new Error(
            'Network error connecting to Gemini. Please check your connection.'
          );
        }
        if (error.message.includes('JSON')) {
          throw new Error(
            'Failed to parse Gemini response. The model may have returned invalid JSON.'
          );
        }
      }

      throw new Error(
        'Failed to generate workflow with Gemini. Please try again later.'
      );
    }
  }

  /**
   * Builds the system prompt for Gemini, including schema and few-shot examples.
   */
  private buildSystemPrompt(
    currentDefinition?: {
      name: string;
      nodes: MCPWorkflowNode[];
      edges: MCPWorkflowEdge[];
    },
    chainId?: number,
    address?: string
  ): string {
    let prompt = `You are an expert blockchain workflow designer. Your task is to generate or modify automation workflows for DeFi protocols.

You must respond with a JSON object containing:
{
  "name": "workflow name",
  "description": "optional description",
  "nodes": [array of workflow nodes],
  "edges": [array of workflow edges],
  "summary": "human-readable explanation of what changed or was built"
}

NODE SCHEMA:
Each node must have:
- id: string (unique identifier)
- type: "trigger" | "action" | "condition" | "forEach"
- data: {
  - label: string (display name)
  - description?: string
  - type: string (node subtype)
  - config: Record<string, unknown> (node-specific configuration)
  - status?: string
}
- position?: { x: number, y: number }

EDGE SCHEMA:
Each edge must have:
- id: string (unique identifier)
- source: string (node id)
- target: string (node id)
- sourceHandle?: string

IMPORTANT CONSTRAINTS:
1. All contract calls should use "web3/read-contract" or "web3/write-contract" action types
2. Include proper ABI and functionArgs for all contract interactions
3. For approve() calls, include a spender and amount in functionArgs
4. Trigger nodes typically use "Schedule" triggerType with cron expressions
5. Condition nodes use "Condition" actionType with logic rules
6. Never generate unlimited approvals without explicit user request
`;

    if (currentDefinition) {
      prompt += `\n\nCURRENT WORKFLOW STATE (for diff/modify):\n${JSON.stringify(
        currentDefinition,
        null,
        2
      )}\n\nWhen modifying, explain what changed in the summary field.`;
    }

    if (chainId && address) {
      prompt += `\n\nContext: Chain ID ${chainId}, Address ${address}`;
    }

    // Add few-shot examples from existing templates
    prompt += `\n\nEXAMPLE WORKFLOWS:

EXAMPLE 1 - Liquidation Shield:
{
  "name": "Liquidation Shield",
  "description": "Monitor Aave V3 health factor and repay debt when below threshold",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "data": {
        "label": "Health Factor Monitor",
        "description": "Monitor Aave V3 health factor",
        "type": "trigger",
        "config": {
          "triggerType": "Schedule",
          "scheduleCron": "*/5 * * * *",
          "scheduleTimezone": "UTC"
        },
        "status": "idle"
      },
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "step-1",
      "type": "action",
      "data": {
        "label": "Get Aave Health Factor",
        "description": "Read the health factor from Aave v3",
        "type": "action",
        "config": {
          "contractAddress": "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
          "network": "1",
          "functionName": "getUserAccountData",
          "actionType": "web3/read-contract",
          "abi": "[...]",
          "functionArgs": "[\\"0x1234...\\"]"
        },
        "status": "idle"
      },
      "position": { "x": 300, "y": 100 }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "trigger-1",
      "target": "step-1"
    }
  ],
  "summary": "Created a liquidation shield that monitors Aave V3 health factor every 5 minutes and triggers debt repayment when HF < 1.15"
}

EXAMPLE 2 - Yield Harvester:
{
  "name": "Yield Harvester",
  "description": "Claim rewards from DeFi protocols",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "data": {
        "label": "Reward Monitor",
        "description": "Monitor DeFi protocol rewards",
        "type": "trigger",
        "config": {
          "triggerType": "Schedule",
          "scheduleCron": "0 */6 * * *",
          "scheduleTimezone": "UTC"
        },
        "status": "idle"
      },
      "position": { "x": 100, "y": 100 }
    }
  ],
  "edges": [],
  "summary": "Created a yield harvester that monitors rewards every 6 hours and claims them when profitable"
}`;

    return prompt;
  }

  /**
   * Returns the JSON schema for structured output from Gemini.
   */
  private getResponseSchema(): object {
    return {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Workflow name',
        },
        description: {
          type: 'string',
          description: 'Optional workflow description',
        },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: {
                type: 'string',
                enum: ['trigger', 'action', 'condition', 'forEach'],
              },
              data: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  description: { type: 'string' },
                  type: { type: 'string' },
                  config: { type: 'object' },
                  status: { type: 'string' },
                },
                required: ['label', 'type', 'config'],
              },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                },
              },
            },
            required: ['id', 'type', 'data'],
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              source: { type: 'string' },
              target: { type: 'string' },
              sourceHandle: { type: 'string' },
            },
            required: ['id', 'source', 'target'],
          },
        },
        summary: {
          type: 'string',
          description:
            'Human-readable explanation of what changed or was built',
        },
      },
      required: ['name', 'nodes', 'edges', 'summary'],
    };
  }
}

export default new AiProviderService();
