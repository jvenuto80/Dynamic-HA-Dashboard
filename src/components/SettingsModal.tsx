import { useState } from 'react';
import {
  createConnection,
  createLongLivedTokenAuth,
} from 'home-assistant-js-websocket';
import {
  getSettings,
  saveSettings,
  applyTheme,
  saveServerConnection,
  clearServerConnection,
  THEMES,
  ACCENT_SWATCHES,
  type ThemeId,
} from '../settings';
import type { DashView } from '../types';

interface Props {
  onClose: () => void;
  onResetLayout: () => void;
  onExportLayout: () => string;
  onImportLayout: (data: string | DashView[]) => void;
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export function SettingsModal({ onClose, onResetLayout, onExportLayout, onImportLayout }: Props) {
  const initial = getSettings();
  const [haUrl, setHaUrl] = useState(initial.haUrl);
  const [haToken, setHaToken] = useState(initial.haToken);
  const [showToken, setShowToken] = useState(false);
  const [rememberOnServer, setRememberOnServer] = useState(initial.rememberOnServer);
  const [theme, setTheme] = useState<ThemeId>(initial.theme);
  const [accent, setAccent] = useState(initial.accent);
  const [ambientEffects, setAmbientEffects] = useState(initial.ambientEffects);
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
  const toggleEffects = () => {
    const next = !ambientEffects;
    setAmbientEffects(next);
    // Live-preview the backdrop without persisting yet.
    window.dispatchEvent(new CustomEvent('ha:ambient-effects', { detail: next }));
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
    const url = haUrl.trim();
    const token = haToken.trim();
    saveSettings({ haUrl: url, haToken: token, theme, accent, ambientEffects, rememberOnServer });
    // Sync the opt-in shared connection on the server. Store the *effective* URL
    // (falls back to the default host) so other devices never adopt an empty URL.
    if (rememberOnServer && token) {
      void saveServerConnection(effectiveUrl, token);
    } else if (!rememberOnServer && initial.rememberOnServer) {
      void clearServerConnection();
    }
    if (reload) {
      window.location.reload();
    } else {
      onClose();
    }
  };

  const cancel = () => {
    // Revert any live appearance preview to the persisted values.
    applyTheme(getSettings());
    window.dispatchEvent(
      new CustomEvent('ha:ambient-effects', { detail: getSettings().ambientEffects }),
    );
    onClose();
  };

  // Download the current layout (all views + tiles + glance config) as a file
  // the user can re-import after deploying the add-on/Docker container.
  const exportLayout = () => {
    const json = onExportLayout();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `ha-dashboard-layout-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importLayout = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        onImportLayout(String(reader.result));
        alert('Layout imported. Reloading…');
        window.location.reload();
      } catch (err) {
        alert(`Import failed: ${err instanceof Error ? err.message : 'invalid file'}`);
      }
    };
    reader.readAsText(file);
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
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>Remember connection on this server</span>
                <small>
                  Store the URL &amp; token on the add-on so new devices (tablets, kiosks)
                  connect automatically — no need to paste the token on each one. Stored in
                  the add-on's <code>/data</code>; anyone who can open the dashboard can use
                  it. You can turn this off anytime.
                </small>
              </div>
              <button
                className={`ts-switch ${rememberOnServer ? 'on' : ''}`}
                role="switch"
                aria-checked={rememberOnServer}
                onClick={() => setRememberOnServer((s) => !s)}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
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
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>Ambient effects</span>
                <small>Weather backdrop — rain &amp; snow particles, plus lightning in thunderstorms.</small>
              </div>
              <button
                className={`ts-switch ${ambientEffects ? 'on' : ''}`}
                role="switch"
                aria-checked={ambientEffects}
                onClick={toggleEffects}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
          </section>

          {/* Data */}
          <section className="settings-section">
            <h4 className="settings-section-title">
              <span className="mdi mdi-database" /> Dashboard data
            </h4>
            <small className="settings-hint">
              Export saves your full layout (views, tiles, and at-a-glance buttons) to a
              file. Import it after deploying to a new device, Docker container, or add-on
              so you don't have to rebuild it.
            </small>
            <div className="settings-data-row">
              <button className="toolbar-btn" onClick={exportLayout}>
                <span className="mdi mdi-download" /> Export layout
              </button>
              <label className="toolbar-btn" style={{ cursor: 'pointer' }}>
                <span className="mdi mdi-upload" /> Import layout
                <input
                  type="file"
                  accept="application/json,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) importLayout(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
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

          {/* Support */}
          <section className="settings-section">
            <h4 className="settings-section-title">
              <span className="mdi mdi-heart" /> Support
            </h4>
            <small className="settings-hint">
              Enjoying the dashboard? Buy me a beer to say thanks — it keeps the
              updates flowing.
            </small>
            <a
              className="bmb-button"
              href="https://venmo.com/u/jvenuto"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="bmb-emoji">🍺</span>
              <span className="bmb-label">Buy me a beer</span>
              <span className="mdi mdi-open-in-new bmb-ext" />
            </a>
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
