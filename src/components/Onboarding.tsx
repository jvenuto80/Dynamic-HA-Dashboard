import { useState } from 'react';
import {
  createConnection,
  createLongLivedTokenAuth,
} from 'home-assistant-js-websocket';
import { getSettings, saveSettings, saveServerConnection, isServedByHomeAssistant } from '../settings';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      setMsg(t('onboarding_connected'));
    } catch (err) {
      setTest('fail');
      setMsg(err instanceof Error ? err.message : t('onboarding_failed'));
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
            <h1 className="onboarding-title">{t('onboarding_welcome')}</h1>
            <p className="onboarding-sub">
              {t('onboarding_subtitle')}
            </p>
          </div>
        </div>

        <ol className="onboarding-steps">
          <li>
            <span className="mdi mdi-numeric-1-circle onboarding-step-icon" />
            <span className="onboarding-step-text">
              {t('onboarding_step1')}
            </span>
          </li>
          <li>
            <span className="mdi mdi-numeric-2-circle onboarding-step-icon" />
            <span className="onboarding-step-text">
              {t('onboarding_step2')}
            </span>
          </li>
        </ol>

        {servedByHa ? (
          <div className="ts-field">
            <span>{t('onboarding_server_url')}</span>
            <div className="settings-hint" style={{ marginTop: 4 }}>
              <span className="mdi mdi-check-circle" style={{ color: 'var(--accent-primary)' }} />{' '}
              {t('onboarding_served_by_ha')}
            </div>
          </div>
        ) : (
          <label className="ts-field">
            <span>{t('onboarding_server_url')}</span>
            <input
              type="url"
              placeholder="http://homeassistant.local:8123"
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
            />
            <small className="settings-hint">
              {t('onboarding_url_hint')}
            </small>
          </label>
        )}

        <label className="ts-field">
          <span>{t('onboarding_token')}</span>
          <div className="settings-token-row">
            <input
              type={showToken ? 'text' : 'password'}
              placeholder={t('onboarding_token_placeholder')}
              value={haToken}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setHaToken(e.target.value)}
            />
            <button
              type="button"
              className="edit-icon-btn"
              title={showToken ? t('onboarding_hide') : t('onboarding_show')}
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
            {t('onboarding_remember')}
          </span>
        </label>

        {test !== 'idle' && (
          <div className={`onboarding-status ${test}`}>
            {test === 'testing' && <span className="mdi mdi-loading mdi-spin" />}
            {test === 'ok' && <span className="mdi mdi-check-circle" />}
            {test === 'fail' && <span className="mdi mdi-alert-circle" />}
            <span>{test === 'testing' ? t('onboarding_testing') : msg}</span>
          </div>
        )}

        <div className="onboarding-actions">
          <button className="toolbar-btn" onClick={runTest} disabled={!canConnect || test === 'testing'}>
            <span className="mdi mdi-lan-connect" /> {t('onboarding_test')}
          </button>
          <button className="toolbar-btn primary onboarding-connect" onClick={connect} disabled={!canConnect}>
            <span className="mdi mdi-arrow-right-circle" /> {t('onboarding_connect')}
          </button>
        </div>

        <button className="onboarding-skip" onClick={onDismiss}>
          {t('onboarding_skip')}
        </button>
      </div>
    </div>
  );
}
