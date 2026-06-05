import { useState } from 'react';
import {
  createConnection,
  createLongLivedTokenAuth,
} from 'home-assistant-js-websocket';
import { getSettings, saveSettings, saveServerConnection, isServedByHomeAssistant } from '../settings';

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

interface Props {
  /** Dismiss onboarding for this session without connecting (explore the shell). */
  onDismiss: () => void;
}

/**
 * First-run guided setup. Shown when no Home Assistant token is configured yet.
 * Walks the user through entering their server URL + a long-lived token, lets
 * them test the connection, and connects (persists + reloads) in one step.
 */
export function Onboarding({ onDismiss }: Props) {
  const initial = getSettings();
  const [haUrl, setHaUrl] = useState(initial.haUrl);
  const [haToken, setHaToken] = useState(initial.haToken);
  const [showToken, setShowToken] = useState(false);
  const [remember, setRemember] = useState(initial.rememberOnServer);
  const [test, setTest] = useState<TestState>('idle');
  const [msg, setMsg] = useState('');

  // Behind Ingress, Home Assistant is the page's own origin — connect there so
  // the scheme matches (wss:// over HTTPS) and traffic is proxied by HA.
  const servedByHa = isServedByHomeAssistant();
  const effectiveUrl = servedByHa
    ? window.location.origin
    : haUrl.trim() || 'http://homeassistant.local:8123';
  const canConnect = haToken.trim().length > 0;

  const runTest = async () => {
    setTest('testing');
    setMsg('');
    try {
      const auth = createLongLivedTokenAuth(effectiveUrl, haToken.trim());
      const conn = await createConnection({ auth });
      conn.close();
      setTest('ok');
      setMsg('Connected successfully.');
    } catch (err) {
      setTest('fail');
      setMsg(err instanceof Error ? err.message : 'Connection failed.');
    }
  };

  const connect = () => {
    const url = haUrl.trim();
    const token = haToken.trim();
    if (!token) return;
    saveSettings({ haUrl: url, haToken: token, rememberOnServer: remember });
    if (remember && token) {
      void saveServerConnection(effectiveUrl, token);
    }
    window.location.reload();
  };

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-brand">
          <span className="onboarding-logo mdi mdi-home-automation" />
          <div>
            <h1 className="onboarding-title">Welcome to Glance</h1>
            <p className="onboarding-sub">
              Let’s connect to your Home Assistant to bring your home to life.
            </p>
          </div>
        </div>

        <ol className="onboarding-steps">
          <li>
            <span className="mdi mdi-numeric-1-circle onboarding-step-icon" />
            <span className="onboarding-step-text">
              In Home Assistant, open your <strong>Profile → Security</strong> and create a{' '}
              <strong>Long-Lived Access Token</strong>.
            </span>
          </li>
          <li>
            <span className="mdi mdi-numeric-2-circle onboarding-step-icon" />
            <span className="onboarding-step-text">
              Paste your server address and the token below, then connect.
            </span>
          </li>
        </ol>

        {servedByHa ? (
          <div className="ts-field">
            <span>Server URL</span>
            <div className="settings-hint" style={{ marginTop: 4 }}>
              <span className="mdi mdi-check-circle" style={{ color: 'var(--accent-primary)' }} />{' '}
              Connected through Home Assistant — no server URL needed. Glance uses
              the same address you opened it with, so it works locally and
              remotely without being exposed to the internet.
            </div>
          </div>
        ) : (
          <label className="ts-field">
            <span>Server URL</span>
            <input
              type="url"
              placeholder="http://homeassistant.local:8123"
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
            />
            <small className="settings-hint">
              Use your HA IP (e.g. http://192.168.1.50:8123) if the local name doesn’t resolve.
            </small>
          </label>
        )}

        <label className="ts-field">
          <span>Long-lived access token</span>
          <div className="settings-token-row">
            <input
              type={showToken ? 'text' : 'password'}
              placeholder="Paste token from your HA profile"
              value={haToken}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setHaToken(e.target.value)}
            />
            <button
              type="button"
              className="edit-icon-btn"
              title={showToken ? 'Hide' : 'Show'}
              onClick={() => setShowToken((s) => !s)}
            >
              <span className={`mdi ${showToken ? 'mdi-eye-off' : 'mdi-eye'}`} />
            </button>
          </div>
        </label>

        <label className="onboarding-remember">
          <button
            type="button"
            className={`ts-switch ${remember ? 'on' : ''}`}
            role="switch"
            aria-checked={remember}
            onClick={() => setRemember((r) => !r)}
          >
            <span className="ts-switch-knob" />
          </button>
          <span>
            Remember on this server so other devices connect automatically
          </span>
        </label>

        {test !== 'idle' && (
          <div className={`onboarding-status ${test}`}>
            {test === 'testing' && <span className="mdi mdi-loading mdi-spin" />}
            {test === 'ok' && <span className="mdi mdi-check-circle" />}
            {test === 'fail' && <span className="mdi mdi-alert-circle" />}
            <span>{test === 'testing' ? 'Testing…' : msg}</span>
          </div>
        )}

        <div className="onboarding-actions">
          <button className="toolbar-btn" onClick={runTest} disabled={!canConnect || test === 'testing'}>
            <span className="mdi mdi-lan-connect" /> Test
          </button>
          <button className="toolbar-btn primary onboarding-connect" onClick={connect} disabled={!canConnect}>
            <span className="mdi mdi-arrow-right-circle" /> Connect
          </button>
        </div>

        <button className="onboarding-skip" onClick={onDismiss}>
          I’ll set this up later
        </button>
      </div>
    </div>
  );
}
