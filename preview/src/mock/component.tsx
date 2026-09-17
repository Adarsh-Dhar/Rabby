import React from 'react';

/**
 * Lightweight stand-in for Rabby's `@/ui/component` `PageHeader`. It renders
 * the title with an optional right-hand slot, matching the props the
 * SmartAutomations screen relies on (`canBack`, `rightSlot`, `className`).
 */
export const PageHeader: React.FC<{
  children?: React.ReactNode;
  canBack?: boolean;
  className?: string;
  rightSlot?: React.ReactNode;
}> = ({ children, className, rightSlot }) => (
  <div
    className={`flex items-center justify-between min-h-[40px] ${className ?? ''}`}
  >
    <h1 className="text-r-neutral-title1 text-20 font-medium m-0">
      {children}
    </h1>
    {rightSlot ? <div className="flex items-center">{rightSlot}</div> : null}
  </div>
);

export default { PageHeader };
