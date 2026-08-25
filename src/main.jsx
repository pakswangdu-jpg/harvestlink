import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import '@fontsource-variable/inter';
// Landing-page-only display/data faces (see .landing-page's --lp-font-display/--lp-font-mono
// tokens in globals.css) — self-hosted like Inter above, not a Google Fonts request, so the
// landing page never depends on an external font host being reachable.
import '@fontsource-variable/fraunces';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/globals.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
