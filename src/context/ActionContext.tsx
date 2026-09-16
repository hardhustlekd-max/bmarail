import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  ActionState,
  subscribeActionLoading,
  startGlobalAction,
  endGlobalAction,
  trackGlobalAction,
  pulseNavbarLoader,
} from '../services/actionTracker';

interface ActionContextType {
  actionState: ActionState;
  startAction: (actionId?: string, labelAm?: string, labelEn?: string, maxDurationMs?: number) => () => void;
  endAction: () => void;
  trackAction: <T>(asyncFn: () => Promise<T>, labelAm?: string, labelEn?: string) => Promise<T>;
  pulseLoader: (labelAm?: string, labelEn?: string, durationMs?: number) => void;
}

const ActionContext = createContext<ActionContextType | undefined>(undefined);

export const ActionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [actionState, setActionState] = useState<ActionState>({
    isLoading: false,
    activeCount: 0,
    labelAm: '',
    labelEn: '',
    timestamp: Date.now(),
  });

  useEffect(() => {
    const unsub = subscribeActionLoading(setActionState);
    return unsub;
  }, []);

  return (
    <ActionContext.Provider
      value={{
        actionState,
        startAction: startGlobalAction,
        endAction: endGlobalAction,
        trackAction: trackGlobalAction,
        pulseLoader: pulseNavbarLoader,
      }}
    >
      {children}
    </ActionContext.Provider>
  );
};

export function useActionTracker(): ActionContextType {
  const context = useContext(ActionContext);
  if (!context) {
    throw new Error('useActionTracker must be used within an ActionProvider');
  }
  return context;
}
