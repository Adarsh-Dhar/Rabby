import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';

// antd base styles (dark theme) + the extension's generated design tokens.
import 'antd/dist/antd.dark.css';
import '@/ui/style/cssvars.css';
import './index.css';

// The real screen under test — its heavy background/wallet imports are
// redirected to lightweight mocks via the Vite aliases in vite.config.ts.
import SmartAutomations from '@/ui/views/SmartAutomations/screen/home';

const Harness: React.FC = () => {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    const { body } = document;
    root.classList.toggle('dark', dark);
    body.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <div className="min-h-full w-full flex flex-col items-center py-32 px-16">
      <div className="w-full max-w-[1040px] mb-16 flex items-center justify-between">
        <div className="text-r-neutral-body text-13">
          Standalone preview of{' '}
          <code className="text-r-neutral-title1">
            SmartAutomations/screen/home.tsx
          </code>{' '}
          — wallet/background services are mocked.
        </div>
        <button
          type="button"
          onClick={() => setDark((d) => !d)}
          className="cursor-pointer rounded-8 border border-solid border-rabby-neutral-line bg-r-neutral-card1 text-r-neutral-title1 text-12 px-12 py-6"
        >
          {dark ? 'Switch to light' : 'Switch to dark'}
        </button>
      </div>
      <div className="w-full max-w-[1040px] rounded-[16px] border border-solid border-rabby-neutral-line bg-r-neutral-bg-1 overflow-hidden shadow-[0_16px_48px_0_rgba(0,0,0,0.24)]">
        <SmartAutomations />
      </div>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <Harness />
    </ConfigProvider>
  </React.StrictMode>
);
