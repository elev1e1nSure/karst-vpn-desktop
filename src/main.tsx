import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

// Disable right-click context menu and reload/devtools hotkeys for a native desktop feel
if (typeof window !== 'undefined') {
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (
      e.key === 'F5' ||
      (e.ctrlKey && e.key === 'r') ||
      (e.metaKey && e.key === 'r') ||
      (e.ctrlKey && e.shiftKey && e.key === 'I') ||
      (e.ctrlKey && e.shiftKey && e.key === 'J') ||
      (e.metaKey && e.shiftKey && e.key === 'I') ||
      (e.metaKey && e.shiftKey && e.key === 'J')
    ) {
      e.preventDefault();
    }
  });
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
