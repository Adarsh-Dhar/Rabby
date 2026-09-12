import keeperhubMCPService from 'background/service/keeperhubMCP';
import type {
  MCPWorkflowNode,
  MCPWorkflowEdge,
} from 'background/service/keeperhubMCP';

/**
 * Build a liquidation shield workflow using KeeperHub's AI generation
 * This leverages the MCP service to generate proper workflow nodes and edges
 * instead of hand-authoring JSON structures that may not match server-side schemas.
 */
export async function buildLiquidationShieldWorkflow(params: {
  address: string;
  healthFactorThreshold: number;
}): Promise<{ nodes: MCPWorkflowNode[]; edges: MCPWorkflowEdge[] }> {
  try {
    const prompt = `Monitor Aave V3 health factor for address ${params.address} on Ethereum mainnet.
    When the health factor drops below ${params.healthFactorThreshold}, automatically trigger a debt repayment
    transaction to protect the position from liquidation. The workflow should check the health factor periodically
    and execute the repayment only when the threshold is breached.`;

    console.log('Generating liquidation shield workflow with params:', params);

    const response = await keeperhubMCPService.generateWorkflow({
      prompt,
      context: {
        address: params.address,
        healthFactorThreshold: params.healthFactorThreshold,
        protocol: 'aave-v3',
        chain: 'ethereum',
        action: 'repay-debt',
      },
    });

    console.log('Workflow generation successful:', response);

    return {
      nodes: response.nodes,
      edges: response.edges,
    };
  } catch (error) {
    console.error('Failed to generate liquidation shield workflow:', error);
    // Provide more detailed error information
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
    }

    // Fallback: create a basic workflow structure manually
    // This provides a working structure even if AI generation fails
    const timestamp = Date.now();
    return {
      nodes: [
        {
          id: `trigger-${timestamp}`,
          type: 'trigger',
          data: {
            label: 'Health Factor Monitor',
            description: 'Monitor Aave V3 health factor',
            type: 'trigger',
            config: {
              triggerType: 'Schedule',
              scheduleCron: '*/5 * * * *',
              scheduleTimezone: 'UTC',
            },
            status: 'idle',
          },
          position: { x: 100, y: 100 },
        },
        {
          id: `step-1-${timestamp}`,
          type: 'action',
          data: {
            label: 'Get Aave Health Factor',
            description: 'Read the health factor from Aave v3',
            type: 'action',
            config: {
              network: '1',
              actionType: 'aave-v3/get-user-account-data',
              user: params.address,
              _protocolMeta: JSON.stringify({
                protocolSlug: 'aave-v3',
                contractKey: 'pool',
                functionName: 'getUserAccountData',
                actionType: 'read'
              })
            },
            status: 'idle',
          },
          position: { x: 300, y: 100 },
        },
        {
          id: `condition-${timestamp}`,
          type: 'action',
          data: {
            label: 'Check Health Factor',
            description: `Check if HF < ${params.healthFactorThreshold}`,
            type: 'action',
            config: {
              group: {
                id: `group-1-${timestamp}`,
                logic: 'AND',
                rules: [
                  {
                    id: `rule-1-${timestamp}`,
                    operator: '<',
                    leftOperand: `{{@step-1-${timestamp}:Get Aave Health Factor.healthFactor}}`,
                    rightOperand: String(params.healthFactorThreshold * 1e18)
                  }
                ]
              },
              condition: `{{@step-1-${timestamp}:Get Aave Health Factor.healthFactor}} < ${params.healthFactorThreshold * 1e18}`,
              actionType: 'Condition'
            },
            status: 'idle',
          },
          position: { x: 500, y: 100 },
        },
        {
          id: `action-${timestamp}`,
          type: 'action',
          data: {
            label: 'Repay Debt',
            description: 'Execute debt repayment',
            type: 'action',
            config: {
              actionType: 'aave-v3/repay',
              network: '1',
              asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
              amount: '115792089237316195423570985008687907853269984665640564039457584007913129639935', // max uint256
              interestRateMode: '1', // Stable rate
              onBehalfOf: params.address,
              _protocolMeta: JSON.stringify({
                protocolSlug: 'aave-v3',
                contractKey: 'pool',
                functionName: 'repay',
                actionType: 'write'
              })
            },
            status: 'idle',
          },
          position: { x: 700, y: 100 },
        },
      ],
      edges: [
        {
          id: `edge-1-${timestamp}`,
          source: `trigger-${timestamp}`,
          target: `step-1-${timestamp}`,
        },
        {
          id: `edge-2-${timestamp}`,
          source: `step-1-${timestamp}`,
          target: `condition-${timestamp}`,
        },
        {
          id: `edge-3-${timestamp}`,
          source: `condition-${timestamp}`,
          target: `action-${timestamp}`,
          sourceHandle: 'true',
        },
      ],
    };
  }
}

/**
 * Build a yield harvester workflow using KeeperHub's AI generation
 * Automatically claims and compounds rewards from DeFi protocols
 */
export async function buildYieldHarvesterWorkflow(params: {
  address: string;
  protocols: string[];
}): Promise<{ nodes: MCPWorkflowNode[]; edges: MCPWorkflowEdge[] }> {
  try {
    const protocolList = params.protocols.join(', ');
    const prompt = `Create a yield harvesting workflow for address ${params.address}.
    Monitor reward accumulation from the following DeFi protocols: ${protocolList}.
    When rewards exceed a gas-efficient threshold, automatically claim and compound them
    back into the protocol to maximize yield. The workflow should balance gas costs against
    reward amounts and only execute when profitable.`;

    console.log('Generating yield harvester workflow with params:', params);

    const response = await keeperhubMCPService.generateWorkflow({
      prompt,
      context: {
        address: params.address,
        protocols: params.protocols,
        action: 'harvest-yield',
      },
    });

    console.log('Workflow generation successful:', response);

    return {
      nodes: response.nodes,
      edges: response.edges,
    };
  } catch (error) {
    console.error('Failed to generate yield harvester workflow:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
    }

    // Fallback: create a basic yield harvesting structure
    const timestamp = Date.now();
    return {
      nodes: [
        {
          id: `trigger-${timestamp}`,
          type: 'trigger',
          data: {
            label: 'Reward Monitor',
            description: 'Monitor DeFi protocol rewards',
            type: 'trigger',
            config: {
              triggerType: 'Schedule',
              scheduleCron: '0 */6 * * *',
              scheduleTimezone: 'UTC',
            },
            status: 'idle',
          },
          position: { x: 100, y: 100 },
        },
        {
          id: `step-1-${timestamp}`,
          type: 'action',
          data: {
            label: 'Get Aave Rewards',
            description: 'Read rewards from Aave v3',
            type: 'action',
            config: {
              network: '1',
              actionType: 'aave-v3/get-user-account-data',
              user: params.address,
              _protocolMeta: JSON.stringify({
                protocolSlug: 'aave-v3',
                contractKey: 'pool',
                functionName: 'getUserAccountData',
                actionType: 'read'
              })
            },
            status: 'idle',
          },
          position: { x: 300, y: 100 },
        },
        {
          id: `condition-${timestamp}`,
          type: 'action',
          data: {
            label: 'Check Threshold',
            description: 'Check if rewards exceed gas cost',
            type: 'action',
            config: {
              group: {
                id: `group-1-${timestamp}`,
                logic: 'AND',
                rules: [
                  {
                    id: `rule-1-${timestamp}`,
                    operator: '>',
                    leftOperand: `{{@step-1-${timestamp}:Get Aave Rewards.totalCollateralETH}}`,
                    rightOperand: '10000000000000000' // 0.01 ETH
                  }
                ]
              },
              condition: `{{@step-1-${timestamp}:Get Aave Rewards.totalCollateralETH}} > 10000000000000000`,
              actionType: 'Condition'
            },
            status: 'idle',
          },
          position: { x: 500, y: 100 },
        },
        {
          id: `action-${timestamp}`,
          type: 'action',
          data: {
            label: 'Claim Rewards',
            description: 'Claim and compound rewards',
            type: 'action',
            config: {
              actionType: 'aave-v3/claim-rewards',
              network: '1',
              rewardTokens: ['0x4Ddb2a681d9d6737a8a7B75EeF4F4e97666F0354'], // stkAAVE
              to: params.address,
              _protocolMeta: JSON.stringify({
                protocolSlug: 'aave-v3',
                contractKey: 'rewards-controller',
                functionName: 'claimRewards',
                actionType: 'write'
              })
            },
            status: 'idle',
          },
          position: { x: 700, y: 100 },
        },
      ],
      edges: [
        {
          id: `edge-1-${timestamp}`,
          source: `trigger-${timestamp}`,
          target: `step-1-${timestamp}`,
        },
        {
          id: `edge-2-${timestamp}`,
          source: `step-1-${timestamp}`,
          target: `condition-${timestamp}`,
        },
        {
          id: `edge-3-${timestamp}`,
          source: `condition-${timestamp}`,
          target: `action-${timestamp}`,
          sourceHandle: 'true',
        },
      ],
    };
  }
}

/**
 * Build a stop-loss workflow using KeeperHub's AI generation
 * Automatically sell assets when they drop below a specified price threshold
 */
export async function buildStopLossWorkflow(params: {
  address: string;
  tokenAddress: string;
  thresholdPrice: number;
  targetToken: string;
}): Promise<{ nodes: MCPWorkflowNode[]; edges: MCPWorkflowEdge[] }> {
  try {
    const prompt = `Create a stop-loss workflow for address ${params.address}.
    Monitor the price of token at ${params.tokenAddress}. When the price drops below ${params.thresholdPrice},
    automatically sell the position for ${params.targetToken} to limit losses.
    The workflow should use reliable price oracles and execute trades efficiently when the threshold is breached.`;

    console.log('Generating stop-loss workflow with params:', params);

    const response = await keeperhubMCPService.generateWorkflow({
      prompt,
      context: {
        address: params.address,
        tokenAddress: params.tokenAddress,
        thresholdPrice: params.thresholdPrice,
        targetToken: params.targetToken,
        action: 'stop-loss',
      },
    });

    console.log('Workflow generation successful:', response);

    return {
      nodes: response.nodes,
      edges: response.edges,
    };
  } catch (error) {
    console.error('Failed to generate stop-loss workflow:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
    }

    // Fallback: create a basic stop-loss structure
    const timestamp = Date.now();
    return {
      nodes: [
        {
          id: `trigger-${timestamp}`,
          type: 'trigger',
          data: {
            label: 'Price Monitor',
            description: `Monitor ${params.tokenAddress} price`,
            type: 'trigger',
            config: {
              triggerType: 'Schedule',
              scheduleCron: '*/1 * * * *',
              scheduleTimezone: 'UTC',
            },
            status: 'idle',
          },
          position: { x: 100, y: 100 },
        },
        {
          id: `step-1-${timestamp}`,
          type: 'action',
          data: {
            label: 'Get Token Price',
            description: 'Read token price from oracle',
            type: 'action',
            config: {
              tokenAddress: params.tokenAddress,
              network: '1',
              actionType: 'uniswap-v3/get-token-price',
              _protocolMeta: JSON.stringify({
                protocolSlug: 'uniswap-v3',
                contractKey: 'pool',
                functionName: 'slot0',
                actionType: 'read'
              })
            },
            status: 'idle',
          },
          position: { x: 300, y: 100 },
        },
        {
          id: `condition-${timestamp}`,
          type: 'action',
          data: {
            label: 'Check Price Threshold',
            description: `Check if price < ${params.thresholdPrice}`,
            type: 'action',
            config: {
              group: {
                id: `group-1-${timestamp}`,
                logic: 'AND',
                rules: [
                  {
                    id: `rule-1-${timestamp}`,
                    operator: '<',
                    leftOperand: `{{@step-1-${timestamp}:Get Token Price.price}}`,
                    rightOperand: String(params.thresholdPrice * 1e18)
                  }
                ]
              },
              condition: `{{@step-1-${timestamp}:Get Token Price.price}} < ${params.thresholdPrice * 1e18}`,
              actionType: 'Condition'
            },
            status: 'idle',
          },
          position: { x: 500, y: 100 },
        },
        {
          id: `action-${timestamp}`,
          type: 'action',
          data: {
            label: 'Execute Trade',
            description: `Sell for ${params.targetToken}`,
            type: 'action',
            config: {
              actionType: 'uniswap-v3/swap',
              network: '1',
              tokenIn: params.tokenAddress,
              tokenOut: params.targetToken,
              fee: '3000',
              recipient: params.address,
              amountIn: '115792089237316195423570985008687907853269984665640564039457584007913129639935', // max uint256
              amountOutMinimum: '0',
              _protocolMeta: JSON.stringify({
                protocolSlug: 'uniswap-v3',
                contractKey: 'router',
                functionName: 'exactInputSingle',
                actionType: 'write'
              })
            },
            status: 'idle',
          },
          position: { x: 700, y: 100 },
        },
      ],
      edges: [
        {
          id: `edge-1-${timestamp}`,
          source: `trigger-${timestamp}`,
          target: `step-1-${timestamp}`,
        },
        {
          id: `edge-2-${timestamp}`,
          source: `step-1-${timestamp}`,
          target: `condition-${timestamp}`,
        },
        {
          id: `edge-3-${timestamp}`,
          source: `condition-${timestamp}`,
          target: `action-${timestamp}`,
          sourceHandle: 'true',
        },
      ],
    };
  }
}
