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
  // kh_* API key. Never logged, never sent anywhere but
  // https://app.keeperhub.com/api.
  apiKey: string | null;
  // keyed by lowercased address, one workflow list per account
  workflowsByAddress: Record<string, KeeperhubWorkflowRecord[]>;
}

class KeeperhubService {
  store!: KeeperhubStore;

  init = async () => {
    this.store = await createPersistStore<KeeperhubStore>({
      name: 'keeperhub',
      template: {
        apiKey: null,
        workflowsByAddress: {},
      },
    });
  };

  setApiKey = (key: string) => {
    this.store.apiKey = key;
  };

  getApiKey = () => this.store.apiKey;

  clearApiKey = () => {
    this.store.apiKey = null;
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
