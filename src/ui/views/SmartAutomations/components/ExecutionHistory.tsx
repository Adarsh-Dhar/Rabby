import React, { useEffect, useState } from 'react';
import { useWallet } from '@/ui/utils';

interface ExecutionHistoryProps {
  address: string;
  workflowId: string;
}

interface ExecutionRecord {
  id: string;
  status: 'success' | 'error' | 'running';
  timestamp: number;
  result?: any;
}

export const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  address,
  workflowId,
}) => {
  const wallet = useWallet();
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [featureNotImplemented, setFeatureNotImplemented] = useState(false);

  useEffect(() => {
    const loadExecutions = async () => {
      setLoading(true);
      try {
        // Check if the method exists before calling it
        const walletWithExecutions = wallet as any;
        if (typeof walletWithExecutions.getKeeperhubWorkflowExecutions !== 'function') {
          setFeatureNotImplemented(true);
          return;
        }

        // This would call a new wallet method to fetch execution history
        // For now, this is a placeholder
        const history = await walletWithExecutions.getKeeperhubWorkflowExecutions(
          address,
          workflowId
        );
        setExecutions(history);
      } catch (error) {
        console.error('Failed to load execution history:', error);
        // If the method doesn't exist yet, show a placeholder message
        setFeatureNotImplemented(true);
      } finally {
        setLoading(false);
      }
    };

    loadExecutions();
  }, [address, workflowId, wallet]);

  if (loading) {
    return <div className="text-r-neutral-foot text-12">Loading history…</div>;
  }

  if (featureNotImplemented) {
    return (
      <div className="text-r-neutral-foot text-12">
        Execution history not yet available
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="text-r-neutral-foot text-12">No execution history</div>
    );
  }

  return (
    <div className="mt-8">
      <div className="text-r-neutral-foot text-12 mb-4">Execution History</div>
      {executions.map((exec) => (
        <div key={exec.id} className="flex justify-between py-4 text-12">
          <span className="text-r-neutral-title">
            {new Date(exec.timestamp).toLocaleString()}
          </span>
          <span
            className={
              exec.status === 'success'
                ? 'text-green-500'
                : exec.status === 'error'
                ? 'text-red-500'
                : 'text-yellow-500'
            }
          >
            {exec.status}
          </span>
        </div>
      ))}
    </div>
  );
};
