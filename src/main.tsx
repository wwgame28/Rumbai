import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/screens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { initStore } from './data/store.ts';
import { registerServiceWorker } from './pwa/register.ts';

const root = createRoot(document.getElementById('root')!);

initStore()
  .catch(() => undefined)
  .then(() => {
    document.getElementById('boot')?.remove();
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });

registerServiceWorker();
