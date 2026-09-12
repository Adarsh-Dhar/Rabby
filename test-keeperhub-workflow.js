/**
 * Test script for KeeperHub workflow creation
 * This replicates exactly what the "Create Liquidation Shield" button does in the UI
 * Run with: node test-keeperhub-workflow.js
 */

// Simulate the workflow template function
async function buildLiquidationShieldWorkflow(params) {
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

// Simulate the wallet.createKeeperhubWorkflow function
async function createKeeperhubWorkflow(params) {
  // Use the default API key from the keeperhub service, or environment variable if set
  const apiKey = process.env.KEEPERHUB_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Set KEEPERHUB_API_KEY in your environment before running this script (no default key is provided).'
    );
  }

  console.log('Creating workflow with params:', {
    name: params.name,
    address: params.address,
    chainId: params.chainId,
    type: params.type,
    nodeCount: params.nodes.length,
    edgeCount: params.edges.length
  });

  try {
    const res = await fetch('https://app.keeperhub.com/api/workflows/create', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.name,
        nodes: params.nodes,
        edges: params.edges,
      }),
      credentials: 'omit',
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('KeeperHub API error:', res.status, res.statusText);
      console.error('Error response:', errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        console.error('Parsed error:', JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error('Could not parse error as JSON');
      }

      throw new Error(
        `KeeperHub workflow creation failed: ${res.status} ${res.statusText}. ${errorText}`
      );
    }

    const workflow = await res.json();
    console.log('Workflow created successfully:', workflow.id);
    return workflow;
  } catch (error) {
    console.error('Error creating workflow:', error.message);
    throw error;
  }
}

// Main test function
async function testWorkflowCreation() {
  // Test address - replace with your actual address
  const testAddress = '0xcc8fdc91bc0a33c9e6dde89c4646ae3fa6a200c2';
  const healthFactorThreshold = 1.15;

  console.log('='.repeat(50));
  console.log('Testing KeeperHub Workflow Creation');
  console.log('='.repeat(50));
  console.log('Test Address:', testAddress);
  console.log('Health Factor Threshold:', healthFactorThreshold);
  console.log('');

  try {
    // Step 1: Build the workflow
    console.log('Step 1: Building workflow...');
    const { nodes, edges } = await buildLiquidationShieldWorkflow({
      address: testAddress,
      healthFactorThreshold: healthFactorThreshold,
    });
    
    console.log('✓ Workflow built successfully');
    console.log('  - Nodes:', nodes.length);
    console.log('  - Edges:', edges.length);
    console.log('');

    // Log the workflow structure for debugging
    console.log('Workflow structure:');
    console.log('Nodes:', JSON.stringify(nodes, null, 2));
    console.log('');
    console.log('Edges:', JSON.stringify(edges, null, 2));
    console.log('');

    // Step 2: Create the workflow on KeeperHub
    console.log('Step 2: Creating workflow on KeeperHub...');
    const workflow = await createKeeperhubWorkflow({
      address: testAddress,
      chainId: 1,
      type: 'liquidation-shield',
      name: `Liquidation Shield - ${testAddress.slice(0, 6)}`,
      nodes,
      edges,
    });

    console.log('✓ Workflow created successfully on KeeperHub');
    console.log('  - Workflow ID:', workflow.id);
    console.log('  - Workflow Name:', workflow.name);
    console.log('');
    console.log('='.repeat(50));
    console.log('TEST PASSED');
    console.log('='.repeat(50));

  } catch (error) {
    console.log('');
    console.log('='.repeat(50));
    console.log('TEST FAILED');
    console.log('='.repeat(50));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testWorkflowCreation();