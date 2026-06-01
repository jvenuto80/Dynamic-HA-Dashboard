import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme } from './settings';
import { installHaptics } from './lib/haptics';
import './styles/theme.css';

applyTheme();
installHaptics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
