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
  completedAt?: number;
  logs?: Array<{
    level: 'info' | 'error' | 'warn';
    message: string;
    timestamp: string;
  }>;
  transactionHashes?: Record<string, string>;
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
        const history = await wallet.getKeeperhubWorkflowExecutions(
          address,
          workflowId
        );
        setExecutions(history);
        setFeatureNotImplemented(false);
      } catch (error) {
        console.error('Failed to load execution history:', error);
        // If it's an API key error, show the "not implemented" message
        // Otherwise, treat it as an empty execution list (workflow may not have run yet)
        if (error instanceof Error && error.message.includes('API key')) {
          setFeatureNotImplemented(true);
        } else {
          setExecutions([]);
        }
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
        Execution history requires KeeperHub API key configuration
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
        <div key={exec.id} className="border-b border-r-neutral-line py-8">
          <div className="flex justify-between text-12 mb-2">
            <span className="text-r-neutral-title">
              {new Date(exec.timestamp).toLocaleString()}
            </span>
            <span
              className={
                exec.status === 'success'
                  ? 'text-r-green-success'
                  : exec.status === 'error'
                  ? 'text-r-red-default'
                  : 'text-r-orange-orange'
              }
            >
              {exec.status}
            </span>
          </div>
          {exec.completedAt && (
            <div className="text-r-neutral-foot text-12">
              Completed: {new Date(exec.completedAt).toLocaleString()}
            </div>
          )}
          {exec.logs && exec.logs.length > 0 && (
            <div className="mt-2">
              <div className="text-r-neutral-foot text-12 mb-1">Logs:</div>
              {exec.logs.slice(0, 3).map((log, idx) => (
                <div key={idx} className="text-12 ml-8">
                  <span
                    className={
                      log.level === 'error'
                        ? 'text-r-red-default'
                        : 'text-r-neutral-body'
                    }
                  >
                    [{log.level}] {log.message}
                  </span>
                </div>
              ))}
              {exec.logs.length > 3 && (
                <div className="text-r-neutral-foot text-12 ml-8">
                  +{exec.logs.length - 3} more logs
                </div>
              )}
            </div>
          )}
          {exec.transactionHashes &&
            Object.keys(exec.transactionHashes).length > 0 && (
              <div className="mt-2">
                <div className="text-r-neutral-foot text-12 mb-1">
                  Transactions:
                </div>
                {Object.entries(exec.transactionHashes).map(([key, hash]) => (
                  <div key={key} className="text-12 ml-8">
                    <span className="text-r-neutral-body">{key}: </span>
                    <span className="text-r-blue-light">
                      {hash.slice(0, 10)}…{hash.slice(-6)}
                    </span>
                  </div>
                ))}
              </div>
            )}
        </div>
      ))}
    </div>
  );
};
