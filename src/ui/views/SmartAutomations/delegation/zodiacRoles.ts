/**
 * Zodiac Roles Modifier integration for Automations.
 *
 * WHAT THIS IS AND ISN'T:
 * This module does NOT deploy a Safe, does NOT deploy a Roles Modifier, and
 * does NOT define permissions. All of that has to happen first, outside of
 * Rabby, using the Zodiac Roles app (https://app.roles.gnosisguild.org) or
 * the zodiac-roles-sdk directly. What this module does is take a
 * transaction Automations already built (to/value/data) and wrap it
 * in an `execTransactionWithRole` call, so that when the automation fires,
 * it executes AS the role — meaning it can only do what the role's
 * on-chain permissions already allow, no matter what the automation's
 * workflow JSON says.
 *
 * This is the real fix for "unlimited approve() by default": instead of (or
 * in addition to) capping the amount client-side, the Roles Modifier
 * enforces on-chain that this key can ONLY call approve() on the specific
 * token/spender/amount-below-X the role was scoped to. A compromised
 * KeeperHub response, a bug in workflowTemplates.ts, or a malicious AI
 * generation result all become no-ops if they fall outside the role.
 *
 * WHAT YOU MUST SET UP BEFORE ANY OF THIS WORKS (outside this codebase):
 *   1. Deploy a Safe (this can hold your real funds).
 *   2. Attach the Zodiac Roles Modifier to that Safe.
 *   3. Create a role and grant it ONLY the specific permissions Smart
 *      Automations needs (e.g. erc20.approve(spender=<pool>, amount<=X)
 *      and pool.repay(...)), using app.roles.gnosisguild.org or the SDK.
 *   4. Assign the role to a member address — this can be a fresh Rabby
 *      account dedicated to automations, so it never touches your main key.
 *   5. Paste the Safe address, Roles Modifier address, and role key into
 *      Automations settings (see DelegationSettings.tsx).
 *
 * Rabby cannot safely do steps 1-4 for you: doing so would mean either
 * fabricating contract addresses (fund-loss risk if wrong) or silently
 * granting broad permissions on your behalf (defeats the point of scoping).
 */

export interface RoleDelegationConfig {
  /** The Safe (avatar) whose funds/positions the automation acts on. */
  safeAddress: string;
  /** The Zodiac Roles Modifier attached to that Safe. */
  rolesModifierAddress: string;
  /** bytes32-encoded role key, e.g. keccak/utf8 of a human label like "automations". */
  roleKey: string;
  /** The chain this Safe + Roles Modifier are deployed on. */
  chainId: number;
}

export interface UnwrappedCall {
  to: string;
  value: string; // decimal wei string
  data: string; // 0x-prefixed calldata
}

import { encodeFunctionData } from 'viem';

// Operation enum used by Safe/Zodiac: 0 = Call, 1 = DelegateCall.
// Automations should only ever need plain Call — DelegateCall in this
// context would let the target contract run arbitrary code as the Safe,
// which is far too dangerous to expose from an automated workflow.
const OPERATION_CALL = 0;

/**
 * ABI fragment for execTransactionWithRole, taken from the Zodiac Roles
 * Modifier interface (gnosisguild/zodiac-modifier-roles). Re-verify against
 * the deployed Roles Modifier's own ABI/source before relying on this for a
 * real Safe — modifier versions can differ.
 */
const ROLES_MODIFIER_ABI = [
  {
    name: 'execTransactionWithRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'roleKey', type: 'bytes32' },
      { name: 'shouldRevert', type: 'bool' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
] as const;

/**
 * Wraps a single already-built call into an execTransactionWithRole call
 * targeting the configured Roles Modifier. The wrapped call is what Smart
 * Automations should actually submit for execution/signing — never the raw
 * `to/data` from the workflow node directly, once role delegation is on.
 *
 * `shouldRevert: true` is intentional and non-configurable here: if the
 * role doesn't permit the call, we want the transaction to revert loudly,
 * not silently no-op in a way that could mask a misconfiguration.
 */
export function wrapCallForRole(
  call: UnwrappedCall,
  config: RoleDelegationConfig
): UnwrappedCall {
  const data = encodeFunctionData({
    abi: ROLES_MODIFIER_ABI,
    functionName: 'execTransactionWithRole',
    args: [
      call.to as `0x${string}`,
      BigInt(call.value || '0'),
      call.data as `0x${string}`,
      OPERATION_CALL,
      config.roleKey as `0x${string}`,
      true,
    ],
  });
  return {
    to: config.rolesModifierAddress,
    value: '0',
    data,
  };
}

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * The fallback builder in workflowTemplates.ts describes actions
 * semantically (actionType/token/spender/amount), not as raw to/data —
 * that's the shape the erc20/approve nodes actually use (see
 * buildErc20ApproveNode). KeeperHub's AI-generation path may return either
 * shape depending on its server-side schema at the time. This only knows
 * how to translate the one semantic shape we control end-to-end today
 * (erc20/approve); anything else needs `to` and `data` already present, and is
 * left untouched with a console warning rather than silently skipped, so a
 * gap here is visible instead of a false sense of coverage.
 */
function toRawCall(nodeConfig: Record<string, any>): UnwrappedCall | null {
  if (nodeConfig?.to && nodeConfig?.data) {
    return {
      to: nodeConfig.to,
      value: nodeConfig.value ?? '0',
      data: nodeConfig.data,
    };
  }
  if (
    nodeConfig?.actionType === 'erc20/approve' &&
    nodeConfig?.token &&
    nodeConfig?.spender
  ) {
    const data = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [
        nodeConfig.spender as `0x${string}`,
        BigInt(nodeConfig.amount ?? '0'),
      ],
    });
    return { to: nodeConfig.token, value: '0', data };
  }
  return null;
}

/**
 * Rewrites every action node in a built workflow so its execution target
 * becomes the Roles Modifier instead of the original contract, IF a role
 * delegation config is present. No-op when config is null, so existing
 * direct-execution behavior is unaffected for users who haven't set up a
 * Safe + Roles Modifier.
 *
 * This is intentionally analogous to scopeApproveNodeAmounts in
 * workflowTemplates.ts — same "post-process whatever nodes we got, from
 * either the fallback builder or KeeperHub's AI path" shape — so the two
 * protections compose instead of one bypassing the other. Call this AFTER
 * scopeApproveNodeAmounts so the role wraps the already-scoped amount, not
 * the unscoped one.
 */
export function applyRoleDelegation(
  nodes: Array<{ data: { config?: Record<string, any> } }>,
  config: RoleDelegationConfig | null
) {
  if (!config) return nodes;
  return nodes.map((node) => {
    const nodeConfig = node.data?.config;
    const rawCall = nodeConfig ? toRawCall(nodeConfig) : null;
    if (!rawCall) {
      if (nodeConfig?.actionType) {
        // eslint-disable-next-line no-console
        console.warn(
          `applyRoleDelegation: don't know how to translate actionType "${nodeConfig.actionType}"` +
            ' into a raw call yet — this node will still execute directly, NOT through the role.' +
            ' Add a case in toRawCall() before relying on role delegation for this action type.'
        );
      }
      return node;
    }
    const wrapped = wrapCallForRole(rawCall, config);
    return {
      ...node,
      data: {
        ...node.data,
        config: {
          ...nodeConfig,
          to: wrapped.to,
          value: wrapped.value,
          data: wrapped.data,
          _executedViaRole: config.roleKey,
        },
      },
    };
  });
}
