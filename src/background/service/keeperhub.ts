import { createPersistStore } from 'background/utils';

export type KeeperhubWorkflowType =
  | 'liquidation-shield'
  | 'yield-harvester'
  | 'stop-loss';

export interface KeeperhubWorkflowRecord {
  workflowId: string;
  type: KeeperhubWorkflowType;
  address: string;
  chainId: number;
  createdAt: number;
  // last status fetched from GET /api/workflows/{id}/executions - not polled
  // in the background, only refreshed on demand when the UI is open.
  lastKnownStatus?: 'active' | 'paused' | 'error';
}

interface KeeperhubStore {
  // keyed by lowercased address, one workflow list per account
  workflowsByAddress: Record<string, KeeperhubWorkflowRecord[]>;
  apiKey: string;
}

class KeeperhubService {
  store!: KeeperhubStore;
  private apiKey: string;

  constructor() {
    // Set default API key immediately, will be updated from persisted store in init()
    this.apiKey = 'kh_LsNuD78Ww0_nWjToSc33b9RZ_LdMA5QF';
  }

  init = async () => {
    this.store = await createPersistStore<KeeperhubStore>({
      name: 'keeperhub',
      template: {
        workflowsByAddress: {},
        apiKey: 'kh_LsNuD78Ww0_nWjToSc33b9RZ_LdMA5QF',
      },
    });
    // Update from store if available, otherwise keep the default
    if (this.store.apiKey) {
      this.apiKey = this.store.apiKey;
    } else {
      this.store.apiKey = this.apiKey;
    }
  };

  setApiKey = (key: string) => {
    this.apiKey = key;
    this.store.apiKey = key;
  };

  getApiKey = () => this.apiKey;

  clearApiKey = () => {
    this.apiKey = '';
    this.store.apiKey = '';
  };

  addWorkflow = (address: string, record: KeeperhubWorkflowRecord) => {
    const key = address.toLowerCase();
    const existing = this.store.workflowsByAddress[key] || [];
    this.store.workflowsByAddress[key] = [...existing, record];
  };

  getWorkflows = (address: string): KeeperhubWorkflowRecord[] => {
    return this.store.workflowsByAddress[address.toLowerCase()] || [];
  };

  removeWorkflow = (address: string, workflowId: string) => {
    const key = address.toLowerCase();
    const existing = this.store.workflowsByAddress[key] || [];
    this.store.workflowsByAddress[key] = existing.filter(
      (w) => w.workflowId !== workflowId
    );
  };

  updateWorkflowStatus = (
    address: string,
    workflowId: string,
    status: KeeperhubWorkflowRecord['lastKnownStatus']
  ) => {
    const key = address.toLowerCase();
    const existing = this.store.workflowsByAddress[key] || [];
    this.store.workflowsByAddress[key] = existing.map((w) =>
      w.workflowId === workflowId ? { ...w, lastKnownStatus: status } : w
    );
  };
}

export default new KeeperhubService();
