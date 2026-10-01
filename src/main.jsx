import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import '@fontsource-variable/inter';



import '@fontsource-variable/fraunces';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/globals.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
