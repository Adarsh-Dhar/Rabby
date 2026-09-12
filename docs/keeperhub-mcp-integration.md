# KeeperHub MCP Integration

This document describes the KeeperHub Model Context Protocol (MCP) server integration in the Rabby wallet, enabling AI-powered workflow generation and management for blockchain automations.

## Overview

The KeeperHub MCP integration allows Rabby to:

- Generate complex blockchain workflows using AI
- Execute and monitor DeFi automation workflows
- Manage workflow lifecycle programmatically
- Integrate with KeeperHub's ecosystem of automation tools

## Architecture

### Components

1. **MCP Configuration** (`.devin/mcp_config.json`)
   - Project-level MCP server configuration
   - Uses environment variable for API key security

2. **MCP Service Layer** (`src/background/service/keeperhubMCP.ts`)
   - TypeScript service wrapper for KeeperHub MCP API
   - Handles authentication, validation, and error handling
   - Shares API key with existing KeeperHub service

3. **Type Definitions** (`src/background/service/keeperhubMCPTypes.ts`)
   - Comprehensive TypeScript types for MCP tools and responses
   - Ensures type safety across the integration

4. **Workflow Templates** (`src/ui/views/SmartAutomations/workflowTemplates.ts`)
   - AI-powered workflow generation functions
   - Replaces manual JSON construction with AI-generated workflows

5. **Wallet Controller Integration** (`src/background/controller/wallet.ts`)
   - Exposes MCP functionality to the UI layer
   - Provides unified interface for workflow operations

## Setup

### Prerequisites

- KeeperHub API key (starts with `kh_`)
- Node.js environment
- Rabby wallet development setup

### Configuration

1. **Project-level MCP Configuration** (`.devin/mcp_config.json`):
```json
{
  "mcpServers": {
    "keeperhub": {
      "url": "https://app.keeperhub.com/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${env:KEEPERHUB_API_KEY}"
      }
    }
  }
}
```

2. **Local Override** (`.devin/mcp_config.local.json` - gitignored):
```json
{
  "mcpServers": {
    "keeperhub": {
      "url": "https://app.keeperhub.com/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer kh_your_actual_api_key_here"
      }
    }
  }
}
```

3. **Environment Variable** (optional):
```bash
export KEEPERHUB_API_KEY="kh_your_api_key_here"
```

### API Key Management

The integration shares the API key with the existing KeeperHub service:

- **Storage**: Uses `keeperhub` persist store for consistency
- **Validation**: API key format validation (`kh_` prefix, minimum length)
- **Security**: Local config file is gitignored to prevent accidental commits

## Usage

### Workflow Generation

The main use case is AI-powered workflow generation:

```typescript
import { buildLiquidationShieldWorkflow } from '@/ui/views/SmartAutomations/workflowTemplates';

// Generate a liquidation shield workflow
const { nodes, edges } = await buildLiquidationShieldWorkflow({
  address: '0x123...',
  healthFactorThreshold: 1.15
});

// Create the workflow using the generated structure
await wallet.createKeeperhubWorkflow({
  address: '0x123...',
  chainId: 1,
  type: 'liquidation-shield',
  name: 'Liquidation Shield',
  nodes,
  edges
});
```

### Available Workflow Templates

1. **Liquidation Shield**: Monitors Aave V3 health factor and repays debt when threshold is breached
2. **Yield Harvester**: Claims and compounds rewards from DeFi protocols
3. **Stop Loss**: Automatically sells assets when price drops below threshold

### Direct MCP Service Usage

For advanced use cases, access the MCP service directly:

```typescript
import keeperhubMCPService from 'background/service/keeperhubMCP';

// Generate custom workflow
const workflow = await keeperhubMCPService.generateWorkflow({
  prompt: 'Create a workflow that...',
  context: { /* additional context */ }
});

// Validate workflow before creation
const validation = await keeperhubMCPService.validateWorkflow({
  nodes: workflow.nodes,
  edges: workflow.edges
});

// Execute workflow
const execution = await keeperhubMCPService.executeWorkflow(workflowId);

// Monitor execution
const status = await keeperhubMCPService.getExecution(execution.executionId);
```

## API Reference

### MCP Service Methods

#### `generateWorkflow(request)`
Generate a workflow using AI.

**Parameters:**
- `prompt`: Natural language description of the workflow
- `context`: Optional additional context for generation

**Returns:** `MCPWorkflowResponse`

#### `createWorkflow(params)`
Create a workflow with nodes and edges.

**Parameters:**
- `name`: Workflow name
- `description`: Optional description
- `nodes`: Array of workflow nodes
- `edges`: Array of workflow edges
- `enabled`: Whether workflow is active
- `projectId`: Optional project assignment
- `tagId`: Optional tag assignment

**Returns:** `MCPWorkflowResponse`

#### `validateWorkflow(params)`
Validate workflow structure before creation.

**Parameters:**
- `nodes`: Array of workflow nodes
- `edges`: Array of workflow edges

**Returns:** `{ valid: boolean; errors?: string[] }`

#### `executeWorkflow(workflowId)`
Manually trigger workflow execution.

**Parameters:**
- `workflowId`: ID of the workflow to execute

**Returns:** `{ executionId: string }`

#### `getExecution(executionId)`
Get execution status and logs.

**Parameters:**
- `executionId`: ID of the execution

**Returns:** `MCPExecution`

#### `listWorkflows(params?)`
List workflows for the organization.

**Parameters:**
- `projectId`: Optional project filter
- `tagId`: Optional tag filter

**Returns:** `MCPWorkflowResponse[]`

## Error Handling

The integration includes comprehensive error handling:

### API Key Errors
- Missing API key: `"KeeperHub API key is not configured"`
- Invalid format: `"Invalid KeeperHub API key format"`

### Validation Errors
- Missing required fields: Specific field validation messages
- Invalid structure: `"Invalid workflow response: missing..."`

### Network Errors
- Connection issues: `"Network error connecting to KeeperHub..."`
- API failures: Detailed error messages from KeeperHub

### Workflow Generation Errors
- Empty prompt: `"Workflow generation prompt is required"`
- Generation failure: `"Failed to generate workflow. Please try again later."`

## Type Safety

All MCP operations use TypeScript types defined in `keeperhubMCPTypes.ts`:

- `WorkflowNode`: Structure for workflow nodes
- `WorkflowEdge`: Structure for workflow edges  
- `MCPWorkflowResponse`: Complete workflow response
- `MCPExecution`: Execution status and logs
- `MCPError`: Standardized error format

## Security Considerations

1. **API Key Storage**: API keys stored in local config (gitignored)
2. **Environment Variables**: Support for env var injection
3. **Validation**: Format validation before API calls
4. **Error Messages**: Non-sensitive error reporting
5. **CORS Handling**: Proper credential management for browser context

## Troubleshooting

### MCP Server Not Connecting

1. Check API key format and validity
2. Verify network connectivity to `app.keeperhub.com`
3. Ensure MCP config files are properly formatted
4. Check browser console for CORS errors

### Workflow Generation Fails

1. Verify API key has sufficient permissions
2. Check prompt is descriptive and clear
3. Ensure context parameters are valid
4. Review KeeperHub service status

### Empty Workflow Response

1. AI generation may need more specific prompts
2. Check KeeperHub API rate limits
3. Verify context parameters match supported protocols
4. Fallback to manual workflow construction

## Development

### Adding New Workflow Templates

1. Create function in `workflowTemplates.ts`
2. Use `keeperhubMCPService.generateWorkflow()`
3. Add appropriate error handling
4. Update UI to call new template

### Extending MCP Integration

1. Add new methods to `keeperhubMCP.ts`
2. Update type definitions in `keeperhubMCPTypes.ts`
3. Expose through wallet controller if needed
4. Add comprehensive error handling

## Future Enhancements

- [ ] Support for marketplace workflow discovery
- [ ] Real-time execution monitoring
- [ ] Workflow testing sandbox
- [ ] Advanced protocol action integration
- [ ] Custom node type definitions
- [ ] Workflow versioning and rollback

## References

- [KeeperHub MCP Documentation](https://docs.keeperhub.com/mcp)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Rabby Wallet Architecture](./architecture.md)
- [DeFi Automation Best Practices](./defi-automation.md)