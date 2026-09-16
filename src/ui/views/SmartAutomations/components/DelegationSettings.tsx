import React, { useState } from 'react';
import { Input, Button, Alert, Typography, Space, Collapse, Steps, Card, message } from 'antd';
import {
  predictSafeAddress,
  buildSafeDeploymentTransaction,
  isRolesModifierEnabled,
  fetchKnownRolesModifier,
  type Eip1193Provider,
} from '../delegation/safeDeployment';
import {
  buildApplyRoleTransactions,
  liquidationShieldPermissions,
  stopLossPermissions,
  twapPermissions,
  yieldHarvesterPermissions,
} from '../delegation/rolePermissions';

const { Text, Link } = Typography;
const { Panel } = Collapse;
const { Step } = Steps;

export interface DelegationSettingsValue {
  safeAddress: string;
  rolesModifierAddress: string;
  roleKey: string;
  chainId: number;
}

interface DelegationSettingsProps {
  value: DelegationSettingsValue | null;
  onSave: (value: DelegationSettingsValue) => void;
  onClear: () => void;
  saving?: boolean;
  wallet?: any; // Wallet service for signing/sending transactions and RPC calls
  accountAddress?: string;
  /** Rabby's chain identifier (serverId, e.g. 'eth') for requestETHRpc calls */
  chainServerId?: string;
  /** Numeric chain ID (e.g. 1 for mainnet), for the subgraph cross-check */
  chainId?: number;
}

const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());

/**
 * Wraps Rabby's own wallet.requestETHRpc in the minimal EIP-1193 shape
 * that @safe-global/protocol-kit's `Safe.init({ provider })` expects,
 * instead of pointing protocol-kit at a hardcoded third-party RPC
 * endpoint (an earlier draft used `https://rpc.ankr.com/eth`, which is
 * wrong for any chain but mainnet and bypasses whatever RPC config/rate
 * limits the user's own Rabby setup already has).
 */
function makeEip1193Provider(wallet: any, chainServerId: string): Eip1193Provider {
  return {
    request: ({ method, params }) =>
      wallet.requestETHRpc({ method, params }, chainServerId),
  };
}

/**
 * Lets the user opt Automations into executing through a Safe +
 * Zodiac Roles Modifier they've already deployed, instead of executing
 * directly with a plain EOA and MAX_UINT256-or-nothing approvals.
 *
 * This form deliberately never suggests a default address for any field —
 * every value here moves real funds if wrong, so there's nothing to
 * pre-fill safely. See delegation/zodiacRoles.ts for what happens with
 * these values once saved.
 *
 * GUIDED SETUP, WHAT IT CAN AND CAN'T AUTOMATE:
 * Safe deployment is fully programmatic (Rabby already depends on
 * @safe-global/protocol-kit for Gnosis Safe support elsewhere). Deploying
 * a NEW Zodiac Roles Modifier is NOT — neither zodiac-roles-sdk nor
 * zodiac-roles-deployments (the two packages this feature depends on)
 * publishes a factory/mastercopy address for any chain, so there is no
 * verified way to build that deployment transaction from inside Rabby.
 * An earlier draft faked this step with `message.info('Would attach
 * Roles Modifier...')` and marked setup "complete" without deploying
 * anything — that's worse than just being honest that this one step
 * needs the user to visit app.roles.gnosisguild.org themselves.
 */
export const DelegationSettings: React.FC<DelegationSettingsProps> = ({
  value,
  onSave,
  onClear,
  saving,
  wallet,
  accountAddress,
  chainServerId,
  chainId,
}) => {
  const [safeAddress, setSafeAddress] = useState(value?.safeAddress ?? '');
  const [rolesModifierAddress, setRolesModifierAddress] = useState(
    value?.rolesModifierAddress ?? ''
  );
  const [roleKey, setRoleKey] = useState(value?.roleKey ?? '');

  // Guided setup state
  const [showGuidedSetup, setShowGuidedSetup] = useState(false);
  const [guidedSetupStep, setGuidedSetupStep] = useState(0);
  const [predictedSafeAddress, setPredictedSafeAddress] = useState('');
  const [isPredictingSafe, setIsPredictingSafe] = useState(false);
  const [isDeployingSafe, setIsDeployingSafe] = useState(false);
  const [isApplyingPermissions, setIsApplyingPermissions] = useState(false);
  const [selectedWorkflowType, setSelectedWorkflowType] = useState<string>('liquidation-shield');
  const [approveAmount, setApproveAmount] = useState('');
  // Step 3 (Roles Modifier) is manual — the user pastes what they deployed
  // at app.roles.gnosisguild.org, and we verify it on-chain before letting
  // them proceed to applying permissions.
  const [pastedRolesModifier, setPastedRolesModifier] = useState('');
  const [isVerifyingRolesModifier, setIsVerifyingRolesModifier] = useState(false);
  const [pastedRoleKey, setPastedRoleKey] = useState('');

  const valid =
    isAddress(safeAddress) &&
    isAddress(rolesModifierAddress) &&
    /^0x[a-fA-F0-9]{64}$/.test(roleKey.trim());

  const handlePredictSafe = async () => {
    if (!accountAddress || !wallet || !chainServerId) {
      message.error('No account, wallet, or chain available');
      return;
    }
    setIsPredictingSafe(true);
    try {
      const provider = makeEip1193Provider(wallet, chainServerId);
      const predicted = await predictSafeAddress(accountAddress, provider);
      setPredictedSafeAddress(predicted);
      setGuidedSetupStep(1);
    } catch (e) {
      message.error(`Failed to predict Safe address: ${e.message}`);
    } finally {
      setIsPredictingSafe(false);
    }
  };

  const handleDeploySafe = async () => {
    if (!accountAddress || !wallet || !chainServerId) {
      message.error('No wallet, account, or chain available');
      return;
    }
    setIsDeployingSafe(true);
    try {
      const provider = makeEip1193Provider(wallet, chainServerId);
      const tx = await buildSafeDeploymentTransaction(accountAddress, provider);
      // Actually send it through Rabby's real transaction confirmation
      // flow — an earlier draft only built this transaction and then
      // showed message.info('Would deploy Safe...') without sending it,
      // so nothing was ever deployed even after the user "completed" setup.
      await wallet.sendRequest({
        method: 'eth_sendTransaction',
        params: [{ from: accountAddress, to: tx.to, value: tx.value, data: tx.data }],
      });
      setGuidedSetupStep(2);
    } catch (e) {
      message.error(`Failed to deploy Safe: ${e.message}`);
    } finally {
      setIsDeployingSafe(false);
    }
  };

  const handleVerifyRolesModifier = async () => {
    if (!predictedSafeAddress || !wallet || !chainServerId) {
      message.error('No Safe address, wallet, or chain available');
      return;
    }
    if (!isAddress(pastedRolesModifier)) {
      message.error('Enter a valid Roles Modifier address');
      return;
    }
    setIsVerifyingRolesModifier(true);
    try {
      const enabled = await isRolesModifierEnabled(
        predictedSafeAddress,
        pastedRolesModifier,
        (params) =>
          wallet.requestETHRpc({ method: 'eth_call', params: [params, 'latest'] }, chainServerId)
      );
      if (!enabled) {
        message.error(
          'This address is not enabled as a module on your Safe yet. ' +
          'Finish attaching it at app.roles.gnosisguild.org first.'
        );
        return;
      }
      // Best-effort cross-check against the subgraph; absence isn't fatal
      // (very recent deployments may not be indexed yet, or chainId
      // wasn't passed in), so this only informs, it doesn't block.
      if (chainId) {
        const known = await fetchKnownRolesModifier(chainId, pastedRolesModifier);
        if (!known) {
          message.info(
            "Verified on-chain that this module is enabled — the subgraph hasn't indexed it yet, which is normal for a recent deployment."
          );
        }
      }
      setRolesModifierAddress(pastedRolesModifier);
      setGuidedSetupStep(3);
    } catch (e) {
      message.error(`Could not verify Roles Modifier: ${e.message}`);
    } finally {
      setIsVerifyingRolesModifier(false);
    }
  };

  const handleApplyPermissions = async () => {
    if (!predictedSafeAddress || !rolesModifierAddress || !wallet || !pastedRoleKey) {
      message.error('Missing addresses, role key, or wallet');
      return;
    }
    if (!/^0x[a-fA-F0-9]{64}$/.test(pastedRoleKey.trim())) {
      message.error('Role key must be a bytes32 hex value');
      return;
    }
    setIsApplyingPermissions(true);
    try {
      let permissions;
      switch (selectedWorkflowType) {
        case 'liquidation-shield':
          permissions = liquidationShieldPermissions(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
            approveAmount || '1000000000',
            1
          );
          break;
        case 'stop-loss':
          permissions = stopLossPermissions(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            '0xE592427A0AEce92De3Edee1F18E0157C05861564',
            approveAmount || '1000000000',
            1
          );
          break;
        case 'twap':
          permissions = twapPermissions(
            '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            '0x6cF1e9cA41f7611dEf408122793c358a3d11E5a5',
            approveAmount || '1000000000',
            1
          );
          break;
        case 'yield-harvester':
          permissions = yieldHarvesterPermissions(
            '0x4Ddb2a681d9d6737a8a7B75EeF4F4e97666F0354',
            1
          );
          break;
        default:
          message.error('Unknown workflow type');
          return;
      }

      // One allowFunction transaction per permission target (see
      // rolePermissions.ts — there is no single "apply the whole set"
      // call on the Modifier contract). Send them one at a time through
      // Rabby's real confirmation flow instead of building-and-discarding
      // like the earlier draft did.
      const txs = buildApplyRoleTransactions(
        pastedRoleKey.trim(),
        permissions,
        rolesModifierAddress
      );
      for (const tx of txs) {
        await wallet.sendRequest({
          method: 'eth_sendTransaction',
          params: [{ from: predictedSafeAddress, to: tx.to, value: tx.value, data: tx.data }],
        });
      }
      setRoleKey(pastedRoleKey.trim());
      setSafeAddress(predictedSafeAddress);
      setGuidedSetupStep(4);
    } catch (e) {
      message.error(`Failed to apply role permissions: ${e.message}`);
    } finally {
      setIsApplyingPermissions(false);
    }
  };

  return (
    <div className="delegation-settings">
      <Alert
        type="info"
        showIcon
        message="Optional: scope automations through a Safe + Zodiac Roles Modifier"
        description={
          <Text>
            By default, automations execute directly from this account, and
            an approve() step (if any) is capped at the amount you set when
            creating the workflow. If you&apos;d rather have on-chain
            enforcement — so the automation literally cannot exceed what a
            role permits, regardless of what the workflow contains — deploy
            a Safe and attach a Zodiac Roles Modifier at{' '}
            <Link href="https://app.roles.gnosisguild.org" target="_blank">
              app.roles.gnosisguild.org
            </Link>
            , grant a role only the specific permissions this automation
            needs, and paste the resulting addresses below.
          </Text>
        }
        style={{ marginBottom: 16 }}
      />

      {!showGuidedSetup && (
        <Button
          type="primary"
          onClick={() => setShowGuidedSetup(true)}
          style={{ marginBottom: 16 }}
        >
          Set this up for me
        </Button>
      )}

      {showGuidedSetup && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Steps current={guidedSetupStep} size="small">
            <Step title="Predict Safe" />
            <Step title="Deploy Safe" />
            <Step title="Attach Roles Modifier" />
            <Step title="Apply Permissions" />
          </Steps>

          {guidedSetupStep === 0 && (
            <div style={{ marginTop: 16 }}>
              <Text>Safe will be deployed with this account as the sole owner.</Text>
              <br />
              <Button
                type="primary"
                onClick={handlePredictSafe}
                loading={isPredictingSafe}
                style={{ marginTop: 8 }}
              >
                Predict Safe Address
              </Button>
              {predictedSafeAddress && (
                <div style={{ marginTop: 8 }}>
                  <Text>Predicted Safe address: {predictedSafeAddress}</Text>
                </div>
              )}
            </div>
          )}

          {guidedSetupStep === 1 && (
            <div style={{ marginTop: 16 }}>
              <Text>Safe address: {predictedSafeAddress}</Text>
              <br />
              <Text type="secondary">
                This sends a real deployment transaction — review it in the
                confirmation prompt before approving.
              </Text>
              <br />
              <Button
                type="primary"
                onClick={handleDeploySafe}
                loading={isDeployingSafe}
                style={{ marginTop: 8 }}
              >
                Deploy Safe
              </Button>
            </div>
          )}

          {guidedSetupStep === 2 && (
            <div style={{ marginTop: 16 }}>
              <Alert
                type="warning"
                showIcon
                message="This step can't be automated"
                description={
                  <Text>
                    Rabby has no verified factory address to deploy a new
                    Zodiac Roles Modifier from — deploying and attaching one
                    has to happen at{' '}
                    <Link href="https://app.roles.gnosisguild.org" target="_blank">
                      app.roles.gnosisguild.org
                    </Link>
                    , using your Safe address ({predictedSafeAddress}) as the
                    avatar. Once it's attached, paste its address below and
                    Rabby will confirm on-chain that it's actually enabled
                    before continuing.
                  </Text>
                }
                style={{ marginBottom: 8 }}
              />
              <Text strong>Roles Modifier address</Text>
              <Input
                placeholder="0x..."
                value={pastedRolesModifier}
                onChange={(e) => setPastedRolesModifier(e.target.value)}
              />
              <Button
                type="primary"
                onClick={handleVerifyRolesModifier}
                loading={isVerifyingRolesModifier}
                style={{ marginTop: 8 }}
              >
                Verify & Continue
              </Button>
            </div>
          )}

          {guidedSetupStep === 3 && (
            <div style={{ marginTop: 16 }}>
              <Text>Roles Modifier verified. Now applying permissions...</Text>
              <div style={{ marginTop: 8 }}>
                <Text strong>Role key (bytes32)</Text>
                <Input
                  placeholder="0x..."
                  value={pastedRoleKey}
                  onChange={(e) => setPastedRoleKey(e.target.value)}
                />
              </div>
              <div style={{ marginTop: 8 }}>
                <Text>Workflow type:</Text>
                <select
                  value={selectedWorkflowType}
                  onChange={(e) => setSelectedWorkflowType(e.target.value)}
                  style={{ marginLeft: 8 }}
                >
                  <option value="liquidation-shield">Liquidation Shield</option>
                  <option value="stop-loss">Stop-Loss</option>
                  <option value="twap">TWAP</option>
                  <option value="yield-harvester">Yield Harvester</option>
                </select>
              </div>
              <div style={{ marginTop: 8 }}>
                <Text>Approve amount (wei):</Text>
                <Input
                  value={approveAmount}
                  onChange={(e) => setApproveAmount(e.target.value)}
                  placeholder="e.g. 1000000000"
                  style={{ width: 200, marginLeft: 8 }}
                />
              </div>
              <Text type="secondary">
                This sends one transaction per permission — you'll get a
                confirmation prompt for each.
              </Text>
              <br />
              <Button
                type="primary"
                onClick={handleApplyPermissions}
                loading={isApplyingPermissions}
                style={{ marginTop: 8 }}
              >
                Apply Permissions
              </Button>
            </div>
          )}

          {guidedSetupStep === 4 && (
            <div style={{ marginTop: 16 }}>
              <Alert
                type="success"
                message="Setup complete"
                description="Your Safe + Roles Modifier is now configured and the permissions have been applied on-chain. You can now create automations that will execute through this role."
              />
              <Button
                type="primary"
                onClick={() => {
                  onSave({
                    safeAddress: predictedSafeAddress,
                    rolesModifierAddress,
                    roleKey,
                    chainId: chainId ?? 1,
                  });
                  setShowGuidedSetup(false);
                  setGuidedSetupStep(0);
                }}
                style={{ marginTop: 8, marginRight: 8 }}
              >
                Save & Done
              </Button>
            </div>
          )}
        </Card>
      )}

      <Collapse ghost style={{ marginTop: 16 }}>
        <Panel header="Manual setup (advanced)" key="manual">
          <Alert
            type="warning"
            showIcon
            message="Manual setup"
            description={
              <Text>
                If you already have a Safe + Roles Modifier deployed, you can
                paste the addresses below. Otherwise, use the guided setup above.
              </Text>
            }
            style={{ marginBottom: 16 }}
          />

          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>Safe address</Text>
              <Input
                placeholder="0x..."
                value={safeAddress}
                onChange={(e) => setSafeAddress(e.target.value)}
              />
            </div>
            <div>
              <Text strong>Zodiac Roles Modifier address</Text>
              <Input
                placeholder="0x..."
                value={rolesModifierAddress}
                onChange={(e) => setRolesModifierAddress(e.target.value)}
              />
            </div>
            <div>
              <Text strong>Role key (bytes32)</Text>
              <Input
                placeholder="0x..."
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
              />
            </div>

            <Space>
              <Button
                type="primary"
                disabled={!valid}
                loading={saving}
                onClick={() =>
                  onSave({
                    safeAddress: safeAddress.trim(),
                    rolesModifierAddress: rolesModifierAddress.trim(),
                    roleKey: roleKey.trim(),
                    chainId: chainId ?? 1,
                  })
                }
              >
                Save
              </Button>
              {value && (
                <Button danger onClick={onClear}>
                  Stop using role delegation
                </Button>
              )}
            </Space>
          </Space>
        </Panel>
      </Collapse>

      <Collapse ghost style={{ marginTop: 16 }}>
        <Panel header="What exactly does this change?" key="1">
          <Text type="secondary">
            Once saved, every action node in a newly created workflow is
            rewritten to call execTransactionWithRole on your Roles
            Modifier instead of calling the target contract directly. If
            the role you configured doesn&apos;t permit that exact call, the
            transaction reverts instead of executing — including calls
            generated by KeeperHub&apos;s AI path, not just the built-in
            templates. This does not retroactively change automations you
            already created.
          </Text>
        </Panel>
      </Collapse>
    </div>
  );
};
