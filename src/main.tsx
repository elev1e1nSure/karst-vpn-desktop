import React from 'react';
import ReactDOM from 'react-dom/client';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import twemojiCountryFlagsUrl from './assets/fonts/TwemojiCountryFlags.woff2?url';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';

// WebView2 on Windows renders regional-indicator flag emoji as raw letters instead of
// a flag glyph. The font is bundled locally — not fetched from the polyfill's default CDN —
// because network access at startup isn't guaranteed for a VPN client.
polyfillCountryFlagEmojis('Twemoji Country Flags', twemojiCountryFlagsUrl);

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
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
