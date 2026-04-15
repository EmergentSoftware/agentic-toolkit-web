import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type LayoutWidth = 'full' | 'standard';

interface LayoutWidthContextValue {
  setWidth: (width: LayoutWidth) => void;
  width: LayoutWidth;
}

const LayoutWidthContext = createContext<LayoutWidthContextValue | null>(null);

export function LayoutWidthProvider({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState<LayoutWidth>('standard');
  const value = useMemo<LayoutWidthContextValue>(() => ({ setWidth, width }), [width]);
  return <LayoutWidthContext.Provider value={value}>{children}</LayoutWidthContext.Provider>;
}

export function useFullWidthLayout(): void {
  const ctx = useContext(LayoutWidthContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setWidth('full');
    return () => ctx.setWidth('standard');
  }, [ctx]);
}

export function useLayoutWidth(): LayoutWidthContextValue {
  const ctx = useContext(LayoutWidthContext);
  if (!ctx) throw new Error('useLayoutWidth must be used within a <LayoutWidthProvider>');
  return ctx;
}
