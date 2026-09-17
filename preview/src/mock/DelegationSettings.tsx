import React, { useState } from 'react';
import { Button, Input } from 'antd';

export interface DelegationSettingsValue {
  safeAddress: string;
  rolesModifierAddress: string;
  roleKey: string;
  chainId: number;
}

/**
 * Stub of the delegation configuration panel. The real component talks to the
 * Zodiac Roles / Safe stack; here it just edits the Safe address so the
 * expand/collapse and save/clear flows are visible in the preview.
 */
export const DelegationSettings: React.FC<{
  value: DelegationSettingsValue | null;
  saving?: boolean;
  onSave: (value: DelegationSettingsValue) => void;
  onClear: () => void;
  wallet?: unknown;
  accountAddress?: string;
  chainServerId?: string;
  chainId?: number;
}> = ({ value, saving, onSave, onClear, chainId }) => {
  const [safeAddress, setSafeAddress] = useState(value?.safeAddress ?? '');

  return (
    <div className="rounded-8 bg-r-neutral-card2 p-12 flex flex-col gap-10">
      <div>
        <div className="text-r-neutral-body text-13 mb-6">Safe address</div>
        <Input
          value={safeAddress}
          onChange={(e) => setSafeAddress(e.target.value)}
          placeholder="0x…"
        />
      </div>
      <div className="flex justify-end gap-8">
        <Button danger onClick={onClear} loading={saving}>
          Clear
        </Button>
        <Button
          type="primary"
          loading={saving}
          disabled={!safeAddress.trim()}
          onClick={() =>
            onSave({
              safeAddress: safeAddress.trim(),
              rolesModifierAddress:
                value?.rolesModifierAddress ??
                '0x9646fDAD06d3e24444381f44362a3B0eB343D337',
              roleKey: value?.roleKey ?? 'automations',
              chainId: chainId ?? value?.chainId ?? 1,
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
};

export default DelegationSettings;
