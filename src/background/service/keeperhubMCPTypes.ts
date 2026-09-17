/**
 * Type definitions for KeeperHub MCP integration
 * These types correspond to the MCP tools and their schemas
 */

// Base node and edge types for workflows
export interface WorkflowNode {
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

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string; // For condition nodes: "true" or "false", for forEach: "loop" or "done"
}

// Workflow management types
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled: boolean;
  projectId?: string;
  tagId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowParams {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  enabled?: boolean;
  projectId?: string;
  tagId?: string;
  idempotency_key?: string;
}

export interface UpdateWorkflowParams {
  workflowId: string;
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  enabled?: boolean;
  projectId?: string | null;
  tagId?: string | null;
}

// Execution types
export interface Execution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  logs: ExecutionLog[];
  transactionHashes?: Record<string, TransactionReceipt>;
}

export interface ExecutionLog {
  level: 'info' | 'error' | 'warn';
  message: string;
  timestamp: string;
  nodeId?: string;
}

export interface TransactionReceipt {
  transactionHash: string;
  blockNumber?: number;
  status?: 'success' | 'failed';
  gasUsed?: string;
  effectiveGasPrice?: string;
}

// AI Generation types
export interface GenerateWorkflowRequest {
  prompt: string;
  context?: Record<string, unknown>;
}

export interface GenerateWorkflowResponse {
  workflow: Workflow;
  explanation?: string;
}

// Direct execution types
export interface TransferParams {
  chain_id: string;
  to_address: string;
  amount: string;
  token_address?: string;
  simulate?: boolean;
  idempotency_key?: string;
}

export interface ContractCallParams {
  chain_id: string;
  contract_address: string;
  abi: string;
  function_name: string;
  function_args?: unknown[];
  value?: string;
  simulate?: boolean;
  idempotency_key?: string;
}

export interface CheckAndExecuteParams {
  chain_id: string;
  contract_address: string;
  abi: string;
  function_name: string;
  function_args?: unknown[];
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'startsWith'
    | 'endsWith';
  comparison_value: string | number;
  action_params: TransferParams | ContractCallParams;
  simulate?: boolean;
  idempotency_key?: string;
}

export interface DirectExecutionStatus {
  execution_id: string;
  status: 'pending' | 'completed' | 'failed';
  transaction_hash?: string;
  result?: unknown;
  error?: string;
}

// Protocol actions (DeFi)
export interface ProtocolAction {
  protocol: string;
  action: string;
  description: string;
  input_schema: Record<string, unknown>;
  supported_chains: string[];
}

export interface ExecuteProtocolActionParams {
  action_type: string; // Format: "protocol/action-slug"
  inputs: Record<string, unknown>;
  simulate?: boolean;
  idempotency_key?: string;
}

// Project and Tag management
export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  workflowCount: number;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  workflowCount: number;
  createdAt: string;
}

// Marketplace listings
export interface WorkflowListing {
  slug: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  price?: number;
  category?: string;
  chain?: string;
  author: string;
}

export interface CallWorkflowParams {
  slug: string;
  inputs: Record<string, unknown>;
}

// Error types
export interface MCPError {
  code: string;
  message: string;
  details?: unknown;
  wouldRevert?: boolean;
  failureKind?: 'validation' | 'revert' | 'execution';
}

// Web3 specific types
export interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
  chainId: string;
}

export interface BalanceCheck {
  address: string;
  balance: string;
  token?: TokenConfig;
  timestamp: string;
}

// Integration types
export interface WalletIntegration {
  id: string;
  type: 'safe' | 'EOA';
  address: string;
  chainId: string;
  status: 'active' | 'error';
}

// Spending limits
export interface SpendingLimits {
  daily_limit_usd: number;
  daily_usage_usd: number;
  reset_time: string;
}
