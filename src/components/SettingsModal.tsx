import { useState } from 'react';
import {
  createConnection,
  createLongLivedTokenAuth,
} from 'home-assistant-js-websocket';
import {
  getSettings,
  saveSettings,
  applyTheme,
  THEMES,
  ACCENT_SWATCHES,
  type ThemeId,
} from '../settings';

interface Props {
  onClose: () => void;
  onResetLayout: () => void;
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export function SettingsModal({ onClose, onResetLayout }: Props) {
  const initial = getSettings();
  const [haUrl, setHaUrl] = useState(initial.haUrl);
  const [haToken, setHaToken] = useState(initial.haToken);
  const [showToken, setShowToken] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(initial.theme);
  const [accent, setAccent] = useState(initial.accent);
  const [test, setTest] = useState<TestState>('idle');
  const [testMsg, setTestMsg] = useState('');

  // Appearance changes preview instantly.
  const pickTheme = (t: ThemeId) => {
    setTheme(t);
    applyTheme({ ...getSettings(), theme: t, accent });
  };
  const pickAccent = (c: string) => {
    setAccent(c);
    applyTheme({ ...getSettings(), theme, accent: c });
  };

  const effectiveUrl = haUrl.trim() || 'http://homeassistant.local:8123';

  const runTest = async () => {
    setTest('testing');
    setTestMsg('');
    try {
      const auth = createLongLivedTokenAuth(effectiveUrl, haToken.trim());
      const conn = await createConnection({ auth });
      conn.close();
      setTest('ok');
      setTestMsg('Connected successfully.');
    } catch (err) {
      setTest('fail');
      setTestMsg(err instanceof Error ? err.message : 'Connection failed.');
    }
  };

  const save = (reload: boolean) => {
    saveSettings({ haUrl: haUrl.trim(), haToken: haToken.trim(), theme, accent });
    if (reload) {
      window.location.reload();
    } else {
      onClose();
    }
  };

  const cancel = () => {
    // Revert any live appearance preview to the persisted values.
    applyTheme(getSettings());
    onClose();
  };

  return (
    <div className="ts-overlay" onClick={cancel}>
      <div className="ts-modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-head">
          <h3>
            <span className="mdi mdi-cog" /> Settings
          </h3>
          <button className="edit-icon-btn" title="Close" onClick={cancel}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="ts-body">
          {/* Connection */}
          <section className="settings-section">
            <h4 className="settings-section-title">
              <span className="mdi mdi-home-assistant" /> Home Assistant
            </h4>
            <label className="ts-field">
              <span>Server URL</span>
              <input
                type="url"
                placeholder="http://homeassistant.local:8123"
                value={haUrl}
                onChange={(e) => setHaUrl(e.target.value)}
              />
            </label>
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
                  className="edit-icon-btn"
                  title={showToken ? 'Hide' : 'Show'}
                  onClick={() => setShowToken((s) => !s)}
                >
                  <span className={`mdi ${showToken ? 'mdi-eye-off' : 'mdi-eye'}`} />
                </button>
              </div>
              <small className="settings-hint">
                Create one in Home Assistant → Profile → Long-Lived Access Tokens.
              </small>
            </label>
            <div className="settings-test-row">
              <button className="toolbar-btn" onClick={runTest} disabled={test === 'testing'}>
                {test === 'testing' ? (
                  <>
                    <span className="mdi mdi-loading mdi-spin" /> Testing…
                  </>
                ) : (
                  <>
                    <span className="mdi mdi-lan-connect" /> Test connection
                  </>
                )}
              </button>
              {test === 'ok' && (
                <span className="settings-test-msg ok">
                  <span className="mdi mdi-check-circle" /> {testMsg}
                </span>
              )}
              {test === 'fail' && (
                <span className="settings-test-msg fail">
                  <span className="mdi mdi-alert-circle" /> {testMsg}
                </span>
              )}
            </div>
          </section>

          {/* Appearance */}
          <section className="settings-section">
            <h4 className="settings-section-title">
              <span className="mdi mdi-palette" /> Appearance
            </h4>
            <div className="ts-field">
              <span>Theme</span>
              <div className="settings-theme-row">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={`settings-theme-btn ${theme === t.id ? 'active' : ''}`}
                    onClick={() => pickTheme(t.id)}
                  >
                    <span className={`theme-swatch theme-${t.id}`} />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="ts-field">
              <span>Accent color</span>
              <div className="settings-accent-row">
                {ACCENT_SWATCHES.map((c) => (
                  <button
                    key={c}
                    className={`settings-accent-btn ${accent.toLowerCase() === c.toLowerCase() ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => pickAccent(c)}
                  >
                    {accent.toLowerCase() === c.toLowerCase() && <span className="mdi mdi-check" />}
                  </button>
                ))}
                <label className="settings-accent-custom" title="Custom color">
                  <span className="mdi mdi-eyedropper-variant" />
                  <input type="color" value={accent} onChange={(e) => pickAccent(e.target.value)} />
                </label>
              </div>
            </div>
          </section>

          {/* Data */}
          <section className="settings-section">
            <h4 className="settings-section-title">
              <span className="mdi mdi-database" /> Dashboard data
            </h4>
            <button
              className="toolbar-btn danger"
              onClick={() => {
                if (confirm('Reset ALL dashboards to the default layout? This cannot be undone.')) {
                  onResetLayout();
                  onClose();
                }
              }}
            >
              <span className="mdi mdi-restore" /> Reset dashboards to default
            </button>
          </section>
        </div>

        <div className="ts-footer">
          <button className="toolbar-btn" onClick={cancel}>
            Cancel
          </button>
          <button className="toolbar-btn primary" onClick={() => save(true)}>
            <span className="mdi mdi-content-save" /> Save &amp; reload
          </button>
        </div>
      </div>
    </div>
  );
}
