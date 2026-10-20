import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { initRealtimeSync } from './services/realtimeSync';
import App from './App.tsx';
import './index.css';
import './utils/imageLogger';
import { initGlobalCrashHandlers } from './utils/crashReporter';
import { initUiFeedback } from './utils/uiFeedback';
import { ErrorBoundary } from './components/ErrorBoundary';

// Initialize global exception and unhandled promise rejection tracking
initGlobalCrashHandlers();

// Initialize tactile UI feedback & ripple animations
initUiFeedback();

// Start resilient Multi-Device SSE & TanStack Sync stream
initRealtimeSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);


