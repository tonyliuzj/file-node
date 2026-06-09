'use client';

import { createContext, type ReactNode, useContext } from 'react';

const TurnstileClearanceContext = createContext('');

export function TurnstileClearanceProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: string;
}) {
  return (
    <TurnstileClearanceContext.Provider value={value}>
      {children}
    </TurnstileClearanceContext.Provider>
  );
}

export function useTurnstileClearance() {
  return useContext(TurnstileClearanceContext);
}
