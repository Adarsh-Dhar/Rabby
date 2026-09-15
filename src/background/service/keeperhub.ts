import { createPersistStore } from 'background/utils';

export type KeeperhubWorkflowType =
  | 'liquidation-shield'
  | 'yield-harvester'
  | 'stop-loss'
  | 'twap';

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
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // No default key. Until the user configures one in Settings, this stays
    // empty and getKeeperhubApiKeyStatus() will correctly report "not connected".
    this.apiKey = '';
  }

  init = async () => {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.store = await createPersistStore<KeeperhubStore>({
        name: 'keeperhub',
        template: {
          workflowsByAddress: {},
          apiKey: '',
        },
      });
      this.apiKey = this.store.apiKey || '';
      this.initialized = true;
    })();

    await this.initPromise;
  };

  private ensureInitialized = async () => {
    if (!this.initialized) {
      await this.init();
    }
  };

  setApiKey = async (key: string) => {
    await this.ensureInitialized();
    this.apiKey = key;
    this.store.apiKey = key;
  };

  getApiKey = async () => {
    await this.ensureInitialized();
    return this.apiKey;
  };

  clearApiKey = async () => {
    await this.ensureInitialized();
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
