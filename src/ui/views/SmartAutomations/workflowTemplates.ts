// NOTE: KeeperHub's public docs describe `nodes`/`edges` as free-form
// workflow-graph payloads (see /api/workflows and the ai_generate_workflow
// MCP tool), but the exact node "type" strings and per-node config schema
// for the web3/Aave plugin are not published in what we have access to.
//
// The safe path used here: instead of hand-authoring node JSON, call
// KeeperHub's `ai_generate_workflow` (via MCP or its REST equivalent) with a
// natural-language prompt and use its returned nodes/edges directly. That
// avoids guessing a schema and shipping a workflow that silently fails to
// validate server-side.
//
// This function is a stand-in until that call is wired up - it currently
// returns an empty graph, which createKeeperhubWorkflow will happily submit
// but which will do nothing. Do not treat this as a working automation.
export function buildLiquidationShieldWorkflow(params: {
  address: string;
  healthFactorThreshold: number;
}) {
  // TODO: replace with a real ai_generate_workflow call, e.g.
  //   POST /api/... with:
  //   { prompt: `Monitor Aave V3 health factor for ${params.address} on
  //              Ethereum and call repayDebt if it drops below
  //              ${params.healthFactorThreshold}` }
  // and pass through the response's nodes/edges unchanged.
  return {
    nodes: [] as unknown[],
    edges: [] as unknown[],
  };
}
