import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import { applyTheme, getSettings, hydrateConnectionFromServer, hydrateSettingsFromServer } from './settings';
import { refreshConnection } from './config';
import { installHaptics } from './lib/haptics';
import './styles/theme.css';

applyTheme();
installHaptics();

const root = createRoot(document.getElementById('root')!);

function render() {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Before the first render: adopt the server's shared preferences (issue #8 —
// theme/accent/etc.; hydrate re-applies the theme via saveSettings) and, when
// this device has no local token, the opt-in shared connection so it
// auto-connects. Both are same-origin fetches that fail fast; never blocks long.
const boot: Promise<unknown>[] = [hydrateSettingsFromServer()];
if (!getSettings().haToken) {
  boot.push(
    hydrateConnectionFromServer().then((applied) => {
      if (applied) refreshConnection();
    }),
  );
}
Promise.allSettled(boot).finally(render);
