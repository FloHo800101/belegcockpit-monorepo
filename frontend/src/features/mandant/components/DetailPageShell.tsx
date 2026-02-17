import { ReactNode } from 'react';

interface DetailPageShellProps {
  /** Left column content (typically a table) */
  children: ReactNode;
  /** Right column content (sidepanel/inspector) - null hides the panel */
  sidepanel?: ReactNode | null;
  /** Whether sidepanel is currently open - affects layout */
  sidepanelOpen?: boolean;
}

/**
 * DetailPageShell - Reusable 2-column layout for all detail pages
 * 
 * Follows UX_CONTRACT.md "Desktop Breite":
 * - Max width: 1720px, centered with horizontal padding
 * - Left column (table): 60-65% width, flex-1 (or 100% when sidepanel closed)
 * - Right column (sidepanel): 35-40%, 520px target (min 420px, max 560px)
 * - Gap: 24-32px between columns
 * - Vertical separator between columns
 */
export function DetailPageShell({ children, sidepanel, sidepanelOpen = true }: DetailPageShellProps) {
  const showSidepanel = sidepanelOpen && sidepanel;

  return (
    <div className="h-full w-full overflow-hidden">
      {/* Outer container: full width, max 1720px, centered with fluid padding */}
      <div className="h-full w-full max-w-[90%] 2xl:max-w-[1720px] mx-auto px-fluid-lg">
        {/* 2-column flex layout with fluid gap */}
        <div className="flex h-full gap-fluid-lg">
          {/* Left column: Table area - takes remaining space (60-65%) or full width when panel closed */}
          <div className="flex-1 min-w-0 h-full overflow-hidden">
            {children}
          </div>
          
          {/* Right column: Sidepanel - responsive width with separator */}
          {showSidepanel && (
            <aside className="w-[520px] min-w-[420px] max-w-[560px] flex-shrink-0 h-full border-l border-border/50 pl-fluid-lg overflow-hidden flex flex-col">
              {sidepanel}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
