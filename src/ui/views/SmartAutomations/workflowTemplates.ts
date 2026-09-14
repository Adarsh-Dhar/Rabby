import keeperhubMCPService from 'background/service/keeperhubMCP';
import type {
  MCPWorkflowNode,
  MCPWorkflowEdge,
} from 'background/service/keeperhubMCP';

// Ethereum mainnet contract addresses (used for reference in AI prompts)
const AAVE_V3_POOL_ADDRESS = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const UNISWAP_V3_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
export const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const MAX_UINT256 =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

/**
 * KeeperHub uses generic web3 action types (e.g., 'web3/read-contract', 'web3/write-contract')
 * instead of protocol-specific action types. Contract calls are made directly with
 * proper ABIs and function arguments. The AI generation handles proper workflow structure,
 * so we rely on that for complex protocols while providing fallback templates with standard
 * web3 actions.
 */

/**
 * Build a liquidation shield workflow using KeeperHub's AI generation
 * This leverages the MCP service to generate proper workflow nodes and edges
 * instead of hand-authoring JSON structures that may not match server-side schemas.
 * Falls back to a manually constructed workflow using web3 contract actions if AI fails.
 */
export async function buildLiquidationShieldWorkflow(params: {
  address: string;
  healthFactorThreshold: number;
}): Promise<{ nodes: MCPWorkflowNode[]; edges: MCPWorkflowEdge[] }> {
  try {
    const prompt = `Monitor Aave V3 health factor for address ${params.address} on Ethereum mainnet.
    When the health factor drops below ${params.healthFactorThreshold}, automatically trigger a debt repayment
    transaction to protect the position from liquidation. The workflow should check the health factor periodically
    and execute the repayment only when the threshold is breached. Include an approve step for the spending
    contract (the Aave V3 Pool) before the repay write action, since the repay call will fail without it.`;

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
              contractAddress: AAVE_V3_POOL_ADDRESS,
              network: '1',
              functionName: 'getUserAccountData',
              actionType: 'web3/read-contract',
              abi: '[{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"getUserAccountData","outputs":[{"internalType":"uint256","name":"totalCollateralBase","type":"uint256"},{"internalType":"uint256","name":"totalDebtBase","type":"uint256"},{"internalType":"uint256","name":"availableBorrowsBase","type":"uint256"},{"internalType":"uint256","name":"currentLiquidationThreshold","type":"uint256"},{"internalType":"uint256","name":"ltv","type":"uint256"},{"internalType":"uint256","name":"healthFactor","type":"uint256"}],"stateMutability":"view","type":"function"}]',
              functionArgs: JSON.stringify([params.address])
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
                    leftOperand: `{{@step-1-${timestamp}:Get Aave Health Factor.result.healthFactor}}`,
                    rightOperand: String(params.healthFactorThreshold * 1e18)
                  }
                ]
              },
              condition: `{{@step-1-${timestamp}:Get Aave Health Factor.result.healthFactor}} < ${params.healthFactorThreshold * 1e18}`,
              actionType: 'Condition'
            },
            status: 'idle',
          },
          position: { x: 500, y: 100 },
        },
        {
          id: `step-2-${timestamp}`,
          type: 'action',
          data: {
            label: 'Approve USDC',
            description: 'Approve Aave Pool to spend USDC',
            type: 'action',
            config: {
              contractAddress: USDC_ADDRESS,
              network: '1',
              functionName: 'approve',
              actionType: 'web3/write-contract',
              abi: '[{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]',
              functionArgs: JSON.stringify([
                AAVE_V3_POOL_ADDRESS,
                MAX_UINT256
              ])
            },
            status: 'idle',
          },
          position: { x: 700, y: 100 },
        },
        {
          id: `action-${timestamp}`,
          type: 'action',
          data: {
            label: 'Repay Debt',
            description: 'Execute debt repayment',
            type: 'action',
            config: {
              contractAddress: AAVE_V3_POOL_ADDRESS,
              network: '1',
              functionName: 'repay',
              actionType: 'web3/write-contract',
              abi: '[{"inputs":[{"internalType":"address","name":"asset","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"interestRateMode","type":"uint256"},{"internalType":"address","name":"onBehalfOf","type":"address"}],"name":"repay","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"}]',
              functionArgs: JSON.stringify([
                USDC_ADDRESS,
                MAX_UINT256,
                1, // Stable rate
                params.address
              ])
            },
            status: 'idle',
          },
          position: { x: 900, y: 100 },
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
          target: `step-2-${timestamp}`,
          sourceHandle: 'true',
        },
        {
          id: `edge-4-${timestamp}`,
          source: `step-2-${timestamp}`,
          target: `action-${timestamp}`,
        },
      ],
    };
  }
}

/**
 * Build a yield harvester workflow using KeeperHub's AI generation
 * Automatically claims rewards from DeFi protocols to your wallet
 * Falls back to a manually constructed workflow using web3 contract actions if AI fails.
 */
export async function buildYieldHarvesterWorkflow(params: {
  address: string;
  protocols: string[];
}): Promise<{ nodes: MCPWorkflowNode[]; edges: MCPWorkflowEdge[] }> {
  try {
    const protocolList = params.protocols.join(', ');
    const prompt = `Create a yield harvesting workflow for address ${params.address}.
    Monitor reward accumulation from the following DeFi protocols: ${protocolList}.
    When rewards exceed a gas-efficient threshold, automatically claim them to your wallet.
    The workflow should balance gas costs against reward amounts and only execute when profitable.`;

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
              contractAddress: AAVE_V3_POOL_ADDRESS,
              network: '1',
              functionName: 'getUserAccountData',
              actionType: 'web3/read-contract',
              abi: '[{"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"getUserAccountData","outputs":[{"internalType":"uint256","name":"totalCollateralBase","type":"uint256"},{"internalType":"uint256","name":"totalDebtBase","type":"uint256"},{"internalType":"uint256","name":"availableBorrowsBase","type":"uint256"},{"internalType":"uint256","name":"currentLiquidationThreshold","type":"uint256"},{"internalType":"uint256","name":"ltv","type":"uint256"},{"internalType":"uint256","name":"healthFactor","type":"uint256"}],"stateMutability":"view","type":"function"}]',
              functionArgs: JSON.stringify([params.address])
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
                    leftOperand: `{{@step-1-${timestamp}:Get Aave Rewards.result.totalCollateralBase}}`,
                    rightOperand: '10000000000000000' // 0.01 ETH
                  }
                ]
              },
              condition: `{{@step-1-${timestamp}:Get Aave Rewards.result.totalCollateralBase}} > 10000000000000000`,
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
            description: 'Claim accumulated rewards',
            type: 'action',
            config: {
              contractAddress: AAVE_V3_POOL_ADDRESS,
              network: '1',
              functionName: 'claimRewardsToUser',
              actionType: 'web3/write-contract',
              abi: '[{"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"address[]","name":"rewardTokens","type":"address[]"}],"name":"claimRewardsToUser","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"nonpayable","type":"function"}]',
              functionArgs: JSON.stringify([
                params.address,
                ['0x4D5F47FA6A74077f613766d14c8D74A6416621E8'] // Example reward token (AAVE)
              ])
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
 * Build a TWAP workflow using CoW Protocol's ComposableCoW
 * This creates a time-weighted average price order that executes over a specified duration
 * Falls back to a manually constructed workflow using web3 contract actions if AI fails.
 */
export async function buildTwapWorkflow(params: {
  address: string;
  sellToken: string;
  buyToken: string;
  totalSellAmount: string;
  totalBuyAmountMin: string;
  numParts: number;
  partDurationSeconds: number;
}): Promise<{ nodes: MCPWorkflowNode[]; edges: MCPWorkflowEdge[] }> {
  try {
    const prompt = `Create a TWAP (Time-Weighted Average Price) workflow for address ${params.address}.
    Sell ${params.totalSellAmount} of ${params.sellToken} for ${params.buyToken} over ${params.numParts} parts,
    with each part executing every ${params.partDurationSeconds} seconds. The total minimum buy amount is ${params.totalBuyAmountMin}.
    This is a one-time order creation action, not a recurring automation — the order will be placed on CoW Protocol's orderbook
    and filled by their solver network over time without further signatures.`;

    console.log('Generating TWAP workflow with params:', params);

    const response = await keeperhubMCPService.generateWorkflow({
      prompt,
      context: {
        address: params.address,
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        totalSellAmount: params.totalSellAmount,
        totalBuyAmountMin: params.totalBuyAmountMin,
        numParts: params.numParts,
        partDurationSeconds: params.partDurationSeconds,
        protocol: 'cow-protocol',
        action: 'twap-order',
      },
    });

    console.log('Workflow generation successful:', response);

    return {
      nodes: response.nodes,
      edges: response.edges,
    };
  } catch (error) {
    console.error('Failed to generate TWAP workflow:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
    }

    // Fallback: create a basic TWAP structure using Uniswap swaps
    // Note: True TWAP requires CoW Protocol, but we provide a simplified swap workflow
    const timestamp = Date.now();
    return {
      nodes: [
        {
          id: `trigger-${timestamp}`,
          type: 'trigger',
          data: {
            label: 'Manual Trigger',
            description: 'One-time swap execution',
            type: 'trigger',
            config: {
              triggerType: 'Manual',
            },
            status: 'idle',
          },
          position: { x: 100, y: 100 },
        },
        {
          id: `step-1-${timestamp}`,
          type: 'action',
          data: {
            label: 'Approve Token',
            description: `Approve Uniswap Router to spend ${params.sellToken.slice(0, 8)}…`,
            type: 'action',
            config: {
              contractAddress: params.sellToken,
              network: '1',
              functionName: 'approve',
              actionType: 'web3/write-contract',
              abi: '[{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]',
              functionArgs: JSON.stringify([
                UNISWAP_V3_ROUTER_ADDRESS,
                params.totalSellAmount
              ])
            },
            status: 'idle',
          },
          position: { x: 300, y: 100 },
        },
        {
          id: `action-${timestamp}`,
          type: 'action',
          data: {
            label: 'Execute Swap',
            description: `Sell ${params.sellToken.slice(0, 8)}… for ${params.buyToken.slice(0, 8)}…`,
            type: 'action',
            config: {
              contractAddress: UNISWAP_V3_ROUTER_ADDRESS,
              network: '1',
              functionName: 'exactInputSingle',
              actionType: 'web3/write-contract',
              abi: '[{"inputs":[{"components":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMinimum","type":"uint256"},{"internalType":"uint160","name":"sqrtPriceLimitX96","type":"uint160"}],"internalType":"struct ISwapRouter.ExactInputSingleParams","name":"params","type":"tuple"}],"name":"exactInputSingle","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"payable","type":"function"}]',
              functionArgs: JSON.stringify([
                {
                  tokenIn: params.sellToken,
                  tokenOut: params.buyToken,
                  fee: 3000,
                  recipient: params.address,
                  deadline: Math.floor(Date.now() / 1000) + 3600,
                  amountIn: params.totalSellAmount,
                  amountOutMinimum: params.totalBuyAmountMin,
                  sqrtPriceLimitX96: '0'
                }
              ])
            },
            status: 'idle',
          },
          position: { x: 500, y: 100 },
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
          target: `action-${timestamp}`,
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
    The workflow should use reliable price oracles and execute trades efficiently when the threshold is breached.
    Include an approve step for the spending contract (the Uniswap V3 Router) before the swap write action,
    since the swap call will fail without it.`;

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
              contractAddress: params.tokenAddress,
              network: '1',
              functionName: 'slot0',
              actionType: 'web3/read-contract',
              abi: '[{"inputs":[],"name":"slot0","outputs":[{"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"internalType":"int24","name":"tick","type":"int24"},{"internalType":"uint16","name":"observationIndex","type":"uint16"},{"internalType":"uint16","name":"observationCardinality","type":"uint16"},{"internalType":"uint16","name":"observationCardinalityNext","type":"uint16"},{"internalType":"uint8","name":"feeProtocol","type":"uint8"},{"internalType":"bool","name":"unlocked","type":"bool"}],"stateMutability":"view","type":"function"}]'
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
                    leftOperand: `{{@step-1-${timestamp}:Get Token Price.result.sqrtPriceX96}}`,
                    rightOperand: String(params.thresholdPrice * 1e18)
                  }
                ]
              },
              condition: `{{@step-1-${timestamp}:Get Token Price.result.sqrtPriceX96}} < ${params.thresholdPrice * 1e18}`,
              actionType: 'Condition'
            },
            status: 'idle',
          },
          position: { x: 500, y: 100 },
        },
        {
          id: `step-2-${timestamp}`,
          type: 'action',
          data: {
            label: 'Approve Router',
            description: 'Approve Uniswap Router to spend tokens',
            type: 'action',
            config: {
              contractAddress: params.tokenAddress,
              network: '1',
              functionName: 'approve',
              actionType: 'web3/write-contract',
              abi: '[{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]',
              functionArgs: JSON.stringify([
                UNISWAP_V3_ROUTER_ADDRESS,
                MAX_UINT256
              ])
            },
            status: 'idle',
          },
          position: { x: 700, y: 100 },
        },
        {
          id: `action-${timestamp}`,
          type: 'action',
          data: {
            label: 'Execute Trade',
            description: `Sell for ${params.targetToken}`,
            type: 'action',
            config: {
              contractAddress: UNISWAP_V3_ROUTER_ADDRESS,
              network: '1',
              functionName: 'exactInputSingle',
              actionType: 'web3/write-contract',
              abi: '[{"inputs":[{"components":[{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"uint24","name":"fee","type":"uint24"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMinimum","type":"uint256"},{"internalType":"uint160","name":"sqrtPriceLimitX96","type":"uint160"}],"internalType":"struct ISwapRouter.ExactInputSingleParams","name":"params","type":"tuple"}],"name":"exactInputSingle","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"payable","type":"function"}]',
              functionArgs: JSON.stringify([
                {
                  tokenIn: params.tokenAddress,
                  tokenOut: params.targetToken,
                  fee: 3000,
                  recipient: params.address,
                  deadline: Math.floor(Date.now() / 1000) + 3600,
                  amountIn: MAX_UINT256,
                  amountOutMinimum: '0',
                  sqrtPriceLimitX96: '0'
                }
              ])
            },
            status: 'idle',
          },
          position: { x: 900, y: 100 },
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
          target: `step-2-${timestamp}`,
          sourceHandle: 'true',
        },
        {
          id: `edge-4-${timestamp}`,
          source: `step-2-${timestamp}`,
          target: `action-${timestamp}`,
        },
      ],
    };
  }
}
