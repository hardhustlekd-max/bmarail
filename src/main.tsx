import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './utils/imageLogger';
import { initGlobalCrashHandlers } from './utils/crashReporter';
import { ErrorBoundary } from './components/ErrorBoundary';

// Initialize global exception and unhandled promise rejection tracking
initGlobalCrashHandlers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

