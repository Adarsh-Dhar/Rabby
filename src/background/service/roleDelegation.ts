import { createPersistStore } from 'background/utils';

/**
 * Stores the user's own Safe + Zodiac Roles Modifier configuration for
 * Automations. Rabby never generates or infers these values — the
 * user deploys the Safe and Roles Modifier themselves (e.g. via
 * app.roles.gnosisguild.org) and pastes the resulting addresses here. See
 * src/ui/views/SmartAutomations/delegation/zodiacRoles.ts for what this
 * config is used for and why Rabby can't set it up on the user's behalf.
 */
export interface RoleDelegationRecord {
  safeAddress: string;
  rolesModifierAddress: string;
  roleKey: string;
  chainId: number;
  createdAt: number;
}

interface RoleDelegationStore {
  // keyed by lowercased EOA that will be assigned the role (member address)
  byAddress: Record<string, RoleDelegationRecord | undefined>;
}

class RoleDelegationService {
  store!: RoleDelegationStore;

  init = async () => {
    this.store = await createPersistStore<RoleDelegationStore>({
      name: 'roleDelegation',
      template: {
        byAddress: {},
      },
    });
  };

  get = (address: string): RoleDelegationRecord | null => {
    return this.store.byAddress[address.toLowerCase()] ?? null;
  };

  set = (address: string, record: Omit<RoleDelegationRecord, 'createdAt'>) => {
    this.store.byAddress[address.toLowerCase()] = {
      ...record,
      createdAt: Date.now(),
    };
  };

  clear = (address: string) => {
    delete this.store.byAddress[address.toLowerCase()];
  };
}

export default new RoleDelegationService();
