import React from 'react';
import ReactDOM from 'react-dom/client';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import twemojiCountryFlagsUrl from './assets/fonts/TwemojiCountryFlags.woff2?url';
import { App } from './App';

// WebView2/Chromium on Windows renders regional-indicator flag emoji as raw letters (e.g. "SE")
// instead of a flag glyph. Font is bundled locally (not fetched from the default CDN) since this
// is a VPN client — network access at startup isn't guaranteed.
polyfillCountryFlagEmojis('Twemoji Country Flags', twemojiCountryFlagsUrl);

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
