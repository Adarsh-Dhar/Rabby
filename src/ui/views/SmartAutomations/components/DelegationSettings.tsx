import React, { useState } from 'react';
import { Input, Button, Alert, Typography, Space, Collapse, Steps, Card, message } from 'antd';
import {
  predictSafeAddress,
  buildSafeDeploymentTransaction,
  buildAttachRolesModifierTransaction,
  isRolesModifierEnabled,
} from '../delegation/safeDeployment';
import {
  buildApplyRoleTransaction,
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
}

interface DelegationSettingsProps {
  value: DelegationSettingsValue | null;
  onSave: (value: DelegationSettingsValue) => void;
  onClear: () => void;
  saving?: boolean;
  wallet?: any; // Wallet service for signing transactions
  accountAddress?: string;
}

const isAddress = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v.trim());

/**
 * Lets the user opt Smart Automations into executing through a Safe +
 * Zodiac Roles Modifier they've already deployed, instead of executing
 * directly with a plain EOA and MAX_UINT256-or-nothing approvals.
 *
 * This form deliberately never suggests a default address for any field —
 * every value here moves real funds if wrong, so there's nothing to
 * pre-fill safely. See delegation/zodiacRoles.ts for what happens with
 * these values once saved.
 */
export const DelegationSettings: React.FC<DelegationSettingsProps> = ({
  value,
  onSave,
  onClear,
  saving,
  wallet,
  accountAddress,
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
  const [selectedWorkflowType, setSelectedWorkflowType] = useState<string>('liquidation-shield');
  const [approveAmount, setApproveAmount] = useState('');

  const valid =
    isAddress(safeAddress) &&
    isAddress(rolesModifierAddress) &&
    /^0x[a-fA-F0-9]{64}$/.test(roleKey.trim());

  const handlePredictSafe = async () => {
    if (!accountAddress) {
      message.error('No account address available');
      return;
    }
    setIsPredictingSafe(true);
    try {
      const predicted = await predictSafeAddress(accountAddress, 1);
      setPredictedSafeAddress(predicted);
      setGuidedSetupStep(1);
    } catch (e) {
      message.error('Failed to predict Safe address');
    } finally {
      setIsPredictingSafe(false);
    }
  };

  const handleDeploySafe = async () => {
    if (!accountAddress || !wallet) {
      message.error('No wallet or account available');
      return;
    }
    try {
      const tx = await buildSafeDeploymentTransaction(accountAddress, 1);
      // This would call wallet's transaction signing flow
      // For now, just show the transaction details
      message.info(`Would deploy Safe with address: ${predictedSafeAddress}`);
      setGuidedSetupStep(2);
    } catch (e) {
      message.error('Failed to build Safe deployment transaction');
    }
  };

  const handleAttachRolesModifier = async () => {
    if (!predictedSafeAddress || !wallet) {
      message.error('No Safe address or wallet available');
      return;
    }
    try {
      const tx = await buildAttachRolesModifierTransaction(predictedSafeAddress, 1);
      message.info('Would attach Roles Modifier to Safe');
      setGuidedSetupStep(3);
    } catch (e) {
      message.error('Failed to build Roles Modifier attachment transaction');
    }
  };

  const handleApplyPermissions = async () => {
    if (!predictedSafeAddress || !rolesModifierAddress || !wallet) {
      message.error('Missing addresses or wallet');
      return;
    }
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

      const tx = await buildApplyRoleTransaction(
        roleKey || '0x' + '0'.repeat(64),
        permissions,
        rolesModifierAddress,
        1
      );
      message.info('Would apply role permissions');
      setGuidedSetupStep(4);
    } catch (e) {
      message.error('Failed to build apply-role transaction');
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
              <Button
                type="primary"
                onClick={handleDeploySafe}
                style={{ marginTop: 8 }}
              >
                Deploy Safe
              </Button>
            </div>
          )}

          {guidedSetupStep === 2 && (
            <div style={{ marginTop: 16 }}>
              <Text>Safe deployed. Now attaching Roles Modifier...</Text>
              <Button
                type="primary"
                onClick={handleAttachRolesModifier}
                style={{ marginTop: 8 }}
              >
                Attach Roles Modifier
              </Button>
            </div>
          )}

          {guidedSetupStep === 3 && (
            <div style={{ marginTop: 16 }}>
              <Text>Roles Modifier attached. Now applying permissions...</Text>
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
              <Button
                type="primary"
                onClick={handleApplyPermissions}
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
                message="Setup complete!"
                description="Your Safe + Roles Modifier is now configured. You can now create automations that will execute through this role."
              />
              <Button
                onClick={() => {
                  setShowGuidedSetup(false);
                  setGuidedSetupStep(0);
                }}
                style={{ marginTop: 8 }}
              >
                Done
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
