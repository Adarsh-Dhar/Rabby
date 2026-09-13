/**
 * Turnkey keyring for Smart Automations.
 *
 * This keyring allows Rabby to use Turnkey's TEE-based key custody
 * and policy engine for automation-only keys. Turnkey provides secure
 * key management with policy enforcement, which can be used as an
 * alternative to Zodiac Roles for automation access control.
 *
 * IMPORTANT: This is a scaffold. The full integration would use the
 * @turnkey/sdk-server package and require the user to provide their
 * Turnkey organization ID and API credentials. Rabby stores these
 * credentials but never fabricates them.
 *
 * ARCHITECTURE NOTE: Turnkey and Zodiac Roles are separate approaches:
 * - Turnkey: Policy enforcement at the key level (TEE-based custody)
 * - Zodiac Roles: Policy enforcement at the contract level (role permissions)
 * They can be alternatives or composed (e.g., a Turnkey-held key as a Roles Modifier member).
 */

import { EventEmitter } from 'events';
import { isAddress } from 'viem';

export const keyringType = 'Turnkey';
export const TransactionBuiltEvent = 'TransactionBuilt';
export const TransactionConfirmedEvent = 'TransactionConfirmed';
export const TransactionReadyForExecEvent = 'TransactionReadyForExec';

interface SignTransactionOptions {
  signatures: string[];
  provider: any;
}

interface DeserializeOption {
  accounts?: string[];
}

interface TurnkeyCredentials {
  organizationId: string;
  apiKeyId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
}

interface TurnkeyKeyringState {
  credentials: TurnkeyCredentials | null;
  addresses: string[];
}

/**
 * Turnkey keyring implementation.
 *
 * This keyring provides a scaffold for integrating Turnkey's TEE-based
 * key custody with Rabby. The full implementation would use the @turnkey/sdk-server
 * package to interact with Turnkey's API for key generation, signing, and policy management.
 */
export class TurnkeyKeyring extends EventEmitter {
  static type = keyringType;
  state: TurnkeyKeyringState;

  constructor() {
    super();
    this.state = {
      credentials: null,
      addresses: [],
    };
  }

  /**
   * Initialize the keyring with Turnkey credentials.
   * These credentials must be provided by the user; Rabby never fabricates them.
   */
  async init(credentials: TurnkeyCredentials): Promise<void> {
    this.state.credentials = credentials;
    // TODO: Initialize Turnkey SDK with credentials
    // TODO: Fetch existing addresses from Turnkey API
  }

  /**
   * Generate a new key in Turnkey's TEE.
   * This would call Turnkey's API to create a new key under the organization.
   */
  async generateKey(): Promise<string> {
    if (!this.state.credentials) {
      throw new Error('Turnkey credentials not initialized');
    }
    // TODO: Call Turnkey's createKey API
    // TODO: Return the generated address
    throw new Error('generateKey not implemented - requires Turnkey SDK integration');
  }

  /**
   * Serialize the keyring state for storage.
   */
  async serialize(): Promise<TurnkeyKeyringState> {
    return this.state;
  }

  /**
   * Deserialize the keyring state from storage.
   */
  async deserialize(state: TurnkeyKeyringState, options?: DeserializeOption): Promise<void> {
    this.state = state;
    if (state.credentials) {
      await this.init(state.credentials);
    }
    if (options?.accounts) {
      this.state.addresses = options.accounts;
    }
  }

  /**
   * Get all addresses managed by this keyring.
   */
  async getAccounts(): Promise<string[]> {
    return this.state.addresses;
  }

  /**
   * Add an address to the keyring.
   */
  async addAccount(address: string): Promise<void> {
    if (!isAddress(address)) {
      throw new Error('Invalid address');
    }
    if (!this.state.addresses.includes(address)) {
      this.state.addresses.push(address);
    }
  }

  /**
   * Remove an address from the keyring.
   */
  async removeAccount(address: string): Promise<void> {
    this.state.addresses = this.state.addresses.filter((a) => a !== address);
  }

  /**
   * Sign a transaction using Turnkey's TEE.
   * This would call Turnkey's signTransaction API with policy enforcement.
   */
  async signTransaction(
    address: string,
    transaction: any,
    options: SignTransactionOptions
  ): Promise<string> {
    if (!this.state.credentials) {
      throw new Error('Turnkey credentials not initialized');
    }
    if (!this.state.addresses.includes(address)) {
      throw new Error('Address not managed by this keyring');
    }
    // TODO: Call Turnkey's signTransaction API
    // TODO: Return the signed transaction
    throw new Error('signTransaction not implemented - requires Turnkey SDK integration');
  }

  /**
   * Sign typed data (EIP-712) using Turnkey's TEE.
   * This would call Turnkey's signTypedData API with policy enforcement.
   */
  async signTypedData(
    address: string,
    typedData: any,
    options: SignTransactionOptions
  ): Promise<string> {
    if (!this.state.credentials) {
      throw new Error('Turnkey credentials not initialized');
    }
    if (!this.state.addresses.includes(address)) {
      throw new Error('Address not managed by this keyring');
    }
    // TODO: Call Turnkey's signTypedData API
    // TODO: Return the signature
    throw new Error('signTypedData not implemented - requires Turnkey SDK integration');
  }

  /**
   * Sign a message using Turnkey's TEE.
   * This would call Turnkey's signMessage API with policy enforcement.
   */
  async signMessage(
    address: string,
    message: string,
    options: SignTransactionOptions
  ): Promise<string> {
    if (!this.state.credentials) {
      throw new Error('Turnkey credentials not initialized');
    }
    if (!this.state.addresses.includes(address)) {
      throw new Error('Address not managed by this keyring');
    }
    // TODO: Call Turnkey's signMessage API
    // TODO: Return the signature
    throw new Error('signMessage not implemented - requires Turnkey SDK integration');
  }

  /**
   * Get the Turnkey policy for a given address.
   * This would call Turnkey's API to fetch the policy configuration.
   */
  async getPolicy(address: string): Promise<any> {
    if (!this.state.credentials) {
      throw new Error('Turnkey credentials not initialized');
    }
    // TODO: Call Turnkey's getPolicy API
    throw new Error('getPolicy not implemented - requires Turnkey SDK integration');
  }

  /**
   * Update the Turnkey policy for a given address.
   * This would call Turnkey's API to update the policy configuration.
   */
  async updatePolicy(address: string, policy: any): Promise<void> {
    if (!this.state.credentials) {
      throw new Error('Turnkey credentials not initialized');
    }
    // TODO: Call Turnkey's updatePolicy API
    throw new Error('updatePolicy not implemented - requires Turnkey SDK integration');
  }
}

export default TurnkeyKeyring;
