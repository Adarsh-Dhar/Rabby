/**
 * Stub of `@/ui/utils`'s `useWallet()` for the standalone preview. It returns
 * demo automations data instead of talking to the extension background
 * service, so the SmartAutomations screen renders in an ordinary browser.
 */
export interface DemoWorkflow {
  workflowId: string;
  name: string;
  description?: string;
  type: string;
  lastKnownStatus?: 'active' | 'paused' | 'error';
  createdAt: number;
}

const DAY = 86_400_000;

let workflows: DemoWorkflow[] = [
  {
    workflowId: 'demo-health-factor',
    name: 'Protect Aave position',
    description: 'Repay USDC debt automatically when the health factor drops below 1.25.',
    type: 'health-factor',
    lastKnownStatus: 'active',
    createdAt: Date.now() - DAY * 4,
  },
  {
    workflowId: 'demo-dca',
    name: 'Weekly ETH buy',
    description: 'Swap 50 USDC for ETH every Monday morning via a TWAP order.',
    type: 'twap',
    lastKnownStatus: 'paused',
    createdAt: Date.now() - DAY * 9,
  },
  {
    workflowId: 'demo-rebalance',
    name: 'Stablecoin rebalance',
    description: 'Keep the USDC / DAI split at 60/40 across the portfolio.',
    type: 'rebalance',
    lastKnownStatus: 'error',
    createdAt: Date.now() - DAY * 21,
  },
  {
    workflowId: 'demo-drip',
    name: 'stETH auto-compound',
    type: 'dca',
    lastKnownStatus: 'active',
    createdAt: Date.now() - DAY * 2,
  },
];

let delegation: {
  safeAddress: string;
  rolesModifierAddress: string;
  roleKey: string;
  chainId: number;
} | null = {
  safeAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  rolesModifierAddress: '0x9646fDAD06d3e24444381f44362a3B0eB343D337',
  roleKey: 'automations',
  chainId: 1,
};

const delay = <T,>(value: T, ms = 350): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const walletStub = {
  getKeeperhubApiKeyStatus: () => delay(true),
  getKeeperhubWorkflows: (_address: string) => delay([...workflows]),
  getRoleDelegation: (_address: string) => delay(delegation),
  deleteKeeperhubWorkflow: (_address: string, workflowId: string) => {
    workflows = workflows.filter((w) => w.workflowId !== workflowId);
    return delay(true);
  },
  updateKeeperhubWorkflow: (
    _address: string,
    workflowId: string,
    patch: { enabled?: boolean; name?: string; description?: string }
  ) => {
    workflows = workflows.map((w) =>
      w.workflowId === workflowId
        ? {
            ...w,
            lastKnownStatus:
              patch.enabled === undefined
                ? w.lastKnownStatus
                : patch.enabled
                ? 'active'
                : 'paused',
            name: patch.name ?? w.name,
            description: patch.description ?? w.description,
          }
        : w
    );
    return delay(true);
  },
  createKeeperhubWorkflow: (params: {
    name: string;
    description?: string;
    type: string;
  }) => {
    workflows = [
      {
        workflowId: `demo-${Date.now()}`,
        name: params.name,
        description: params.description,
        type: params.type,
        lastKnownStatus: 'active',
        createdAt: Date.now(),
      },
      ...workflows,
    ];
    return delay(true);
  },
  setRoleDelegation: (_address: string, value: typeof delegation) => {
    delegation = value;
    return delay(true);
  },
  clearRoleDelegation: (_address: string) => {
    delegation = null;
    return delay(true);
  },
};

export const useWallet = () => walletStub;

export default walletStub;
