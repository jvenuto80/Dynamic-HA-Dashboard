import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  isServedByHomeAssistant,
  pushSettingsToServer,
  THEMES,
  ACCENT_SWATCHES,
  type ThemeId,
} from '../settings';
import type { DashView } from '../types';
import type { HassEntities } from 'home-assistant-js-websocket';
import { weatherEntities } from '../lib/weather';
import { discoverCalendars } from '../lib/calendar';
import { DATE_FORMATS, DURATION_STYLES, type DateFormatId, type DurationStyle } from '../lib/format';

interface Props {
  onClose: () => void;
  entities: HassEntities;
  /** Pages, for the screensaver-shortcut picker (issue #28). */
  views?: Pick<DashView, 'id' | 'name'>[];
  onResetLayout: () => void;
  onStartBlank: () => void;
  onExportLayout: () => string;
  onImportLayout: (data: string | DashView[]) => void;
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export function SettingsModal({ onClose, entities, views, onResetLayout, onStartBlank, onExportLayout, onImportLayout }: Props) {
  const initial = getSettings();
  const { t, i18n } = useTranslation();
  const [haUrl, setHaUrl] = useState(initial.haUrl);
  const [haToken, setHaToken] = useState(initial.haToken);
  const [showToken, setShowToken] = useState(false);
  const [rememberOnServer, setRememberOnServer] = useState(initial.rememberOnServer);
  const [theme, setTheme] = useState<ThemeId>(initial.theme);
  const [accent, setAccent] = useState(initial.accent);
  const [ambientEffects, setAmbientEffects] = useState(initial.ambientEffects);
  const [compactSections, setCompactSections] = useState(initial.compactSections);
  const [weatherEntity, setWeatherEntity] = useState(initial.weatherEntity);
  const [dateFormat, setDateFormat] = useState<DateFormatId>(initial.dateFormat);
  const [durationStyle, setDurationStyle] = useState<DurationStyle>(initial.durationStyle);
  const [screensaverMinutes, setScreensaverMinutes] = useState(initial.screensaverMinutes);
  const [nowPlayingTakeover, setNowPlayingTakeover] = useState(initial.nowPlayingTakeover);
  const [calendarChip, setCalendarChip] = useState(initial.calendarChip);
  const [calendarEntities, setCalendarEntities] = useState<string[]>(initial.calendarEntities);
  const [screensaverShortcut, setScreensaverShortcut] = useState(initial.screensaverShortcut);
  const [syncSettings, setSyncSettings] = useState(initial.syncSettings);
  const [statusDots, setStatusDots] = useState(initial.statusDots);
  const [smartGrouping, setSmartGrouping] = useState(initial.smartGrouping);
  const [test, setTest] = useState<TestState>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [lang, setLang] = useState(() => localStorage.getItem('ha-dashboard-lang') ?? 'en');

  const pickLang = (l: string) => {
    setLang(l);
    i18n.changeLanguage(l);
    localStorage.setItem('ha-dashboard-lang', l);
  };

  const weatherOptions = weatherEntities(entities);
  const calendarOptions = discoverCalendars(entities);

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

  const toggleFlow = () => {
    const next = !compactSections;
    setCompactSections(next);
    // Live-preview the layout reflow without persisting yet.
    window.dispatchEvent(new CustomEvent('ha:compact-sections', { detail: next }));
  };

  const pickScreensaver = (minutes: number) => {
    setScreensaverMinutes(minutes);
    // Live-apply the idle timer without persisting yet.
    window.dispatchEvent(new CustomEvent('ha:screensaver-minutes', { detail: minutes }));
  };

  const toggleStatusDots = () => {
    const next = !statusDots;
    setStatusDots(next);
    // Live-apply the dots without persisting yet.
    window.dispatchEvent(new CustomEvent('ha:status-dots', { detail: next }));
  };

  const toggleSmartGrouping = () => {
    const next = !smartGrouping;
    setSmartGrouping(next);
    // Live-apply the grouping without persisting yet.
    window.dispatchEvent(new CustomEvent('ha:smart-grouping', { detail: next }));
  };

  const toggleTakeover = () => {
    const next = !nowPlayingTakeover;
    setNowPlayingTakeover(next);
    // Live-apply the tap behavior without persisting yet.
    window.dispatchEvent(new CustomEvent('ha:np-takeover', { detail: next }));
  };

  // Behind Ingress, Home Assistant is the page's own origin — connect there so
  // the scheme matches (wss:// over HTTPS) and traffic is proxied by HA.
  const servedByHa = isServedByHomeAssistant();
  const effectiveUrl = servedByHa
    ? window.location.origin
    : haUrl.trim() || 'http://homeassistant.local:8123';

  const runTest = async () => {
    setTest('testing');
    setTestMsg('');
    try {
      const auth = createLongLivedTokenAuth(effectiveUrl, haToken.trim());
      const conn = await createConnection({ auth });
      conn.close();
      setTest('ok');
      setTestMsg(t('settings_connected'));
    } catch (err) {
      setTest('fail');
      setTestMsg(err instanceof Error ? err.message : t('settings_failed'));
    }
  };

  const save = (reload: boolean) => {
    const url = haUrl.trim();
    const token = haToken.trim();
    saveSettings({ haUrl: url, haToken: token, theme, accent, ambientEffects, compactSections, rememberOnServer, weatherEntity, dateFormat, durationStyle, screensaverMinutes, nowPlayingTakeover, calendarChip, calendarEntities, screensaverShortcut, syncSettings, statusDots, smartGrouping });
    // Share the non-credential preferences with other devices (issue #8).
    void pushSettingsToServer();
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
    window.dispatchEvent(
      new CustomEvent('ha:compact-sections', { detail: getSettings().compactSections }),
    );
    window.dispatchEvent(
      new CustomEvent('ha:screensaver-minutes', { detail: getSettings().screensaverMinutes }),
    );
    window.dispatchEvent(
      new CustomEvent('ha:np-takeover', { detail: getSettings().nowPlayingTakeover }),
    );
    window.dispatchEvent(
      new CustomEvent('ha:status-dots', { detail: getSettings().statusDots }),
    );
    window.dispatchEvent(
      new CustomEvent('ha:smart-grouping', { detail: getSettings().smartGrouping }),
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
        alert(t('settings_import_success'));
        window.location.reload();
      } catch (err) {
        alert(t('settings_import_fail', { error: err instanceof Error ? err.message : 'invalid file' }));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="ts-overlay" onClick={cancel}>
      <div className="ts-modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-head">
          <h3>
            <span className="mdi mdi-cog" /> {t('settings_title')}
          </h3>
          <button className="edit-icon-btn" title={t('settings_close')} onClick={cancel}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="ts-body">
          {/* Connection */}
          <section className="settings-section">
            <h4 className="settings-section-title">
              <span className="mdi mdi-home-assistant" /> {t('settings_ha')}
            </h4>
            {servedByHa ? (
              <div className="ts-field">
                <span>{t('settings_server_url')}</span>
                <div className="settings-hint" style={{ marginTop: 4 }}>
                  <span className="mdi mdi-check-circle" style={{ color: 'var(--accent-primary)' }} />{' '}
                  {t('settings_served_by_ha')}
                </div>
              </div>
            ) : (
              <label className="ts-field">
                <span>{t('settings_server_url')}</span>
                <input
                  type="url"
                  placeholder="http://homeassistant.local:8123"
                  value={haUrl}
                  onChange={(e) => setHaUrl(e.target.value)}
                />
              </label>
            )}
            <label className="ts-field">
              <span>{t('settings_token')}</span>
              <div className="settings-token-row">
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder={t('settings_token_placeholder')}
                  value={haToken}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setHaToken(e.target.value)}
                />
                <button
                  className="edit-icon-btn"
                  title={showToken ? t('settings_hide') : t('settings_show')}
                  onClick={() => setShowToken((s) => !s)}
                >
                  <span className={`mdi ${showToken ? 'mdi-eye-off' : 'mdi-eye'}`} />
                </button>
              </div>
              <small className="settings-hint">
                {t('settings_create_token')}
              </small>
            </label>
            <div className="settings-test-row">
              <button className="toolbar-btn" onClick={runTest} disabled={test === 'testing'}>
                {test === 'testing' ? (
                  <>
                    <span className="mdi mdi-loading mdi-spin" /> {t('settings_testing')}
                  </>
                ) : (
                  <>
                    <span className="mdi mdi-lan-connect" /> {t('settings_test_connection')}
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
                <span>{t('settings_remember')}</span>
                <small>
                  {t('settings_remember_desc')}
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
              <span className="mdi mdi-palette" /> {t('settings_appearance')}
            </h4>
            <div className="ts-field">
              <span>{t('settings_theme')}</span>
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
              <span>{t('settings_accent')}</span>
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
                <span>{t('settings_ambient')}</span>
                <small>{t('settings_ambient_desc')}</small>
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
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>{t('settings_compact')}</span>
                <small>{t('settings_compact_desc')}</small>
              </div>
              <button
                className={`ts-switch ${compactSections ? 'on' : ''}`}
                role="switch"
                aria-checked={compactSections}
                onClick={toggleFlow}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
            <label className="ts-field">
              <span>{t('settings_language')}</span>
              <select value={lang} onChange={(e) => pickLang(e.target.value)}>
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
              <small className="settings-hint">
                {t('settings_language_hint')}
              </small>
            </label>
            <label className="ts-field settings-weather-field">
              <span>{t('settings_weather_entity')}</span>
              <select
                value={weatherEntity}
                onChange={(e) => setWeatherEntity(e.target.value)}
              >
                <option value="">
                  {t('settings_weather_auto')}{weatherOptions[0] ? ` (${weatherOptions[0].entity_id})` : ` (${t('settings_weather_none')})`}
                </option>
                {weatherOptions.map((w) => (
                  <option key={w.entity_id} value={w.entity_id}>
                    {(w.attributes.friendly_name as string) || w.entity_id}
                  </option>
                ))}
              </select>
              <small className="settings-hint">
                {t('settings_weather_entity_hint')}
              </small>
            </label>
            <label className="ts-field">
              <span>{t('settings_date_format')}</span>
              <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormatId)}>
                {DATE_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} — {f.sample}
                  </option>
                ))}
              </select>
              <small className="settings-hint">
                {t('settings_date_format_hint')}
              </small>
            </label>
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>{t('settings_smart_grouping')}</span>
                <small>
                  {t('settings_smart_grouping_desc')}
                </small>
              </div>
              <button
                className={`ts-switch ${smartGrouping ? 'on' : ''}`}
                role="switch"
                aria-checked={smartGrouping}
                onClick={toggleSmartGrouping}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>{t('settings_status_dots')}</span>
                <small>
                  {t('settings_status_dots_desc')}
                </small>
              </div>
              <button
                className={`ts-switch ${statusDots ? 'on' : ''}`}
                role="switch"
                aria-checked={statusDots}
                onClick={toggleStatusDots}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>{t('settings_np_takeover')}</span>
                <small>
                  {t('settings_np_takeover_desc')}
                </small>
              </div>
              <button
                className={`ts-switch ${nowPlayingTakeover ? 'on' : ''}`}
                role="switch"
                aria-checked={nowPlayingTakeover}
                onClick={toggleTakeover}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
            <label className="ts-field">
              <span>{t('settings_screensaver')}</span>
              <select
                value={screensaverMinutes}
                onChange={(e) => pickScreensaver(parseInt(e.target.value))}
              >
                <option value={0}>{t('settings_screensaver_off')}</option>
                {[1, 2, 5, 10, 15, 30].map((m) => (
                  <option key={m} value={m}>
                    {t('settings_screensaver_after', { count: m })}
                  </option>
                ))}
              </select>
              <small className="settings-hint">
                {t('settings_screensaver_hint')}
              </small>
            </label>
            {views && views.length > 0 && (
              <label className="ts-field">
                <span>{t('settings_screensaver_shortcut')}</span>
                <select
                  value={screensaverShortcut}
                  onChange={(e) => setScreensaverShortcut(e.target.value)}
                >
                  <option value="">{t('settings_screensaver_none')}</option>
                  {views.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <small className="settings-hint">
                  {t('settings_screensaver_shortcut_hint')}
                </small>
              </label>
            )}
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>{t('settings_sync')}</span>
                <small>
                  {t('settings_sync_desc')}
                </small>
              </div>
              <button
                className={`ts-switch ${syncSettings ? 'on' : ''}`}
                role="switch"
                aria-checked={syncSettings}
                onClick={() => setSyncSettings((s) => !s)}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
            <label className="ts-field">
              <span>{t('settings_duration')}</span>
              <select value={durationStyle} onChange={(e) => setDurationStyle(e.target.value as DurationStyle)}>
                {DURATION_STYLES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} — {d.sample}
                  </option>
                ))}
              </select>
              <small className="settings-hint">
                {t('settings_duration_hint')}
              </small>
            </label>
          </section>

          {/* Calendar */}
          <section className="settings-section">
            <h4 className="settings-section-title">
              <span className="mdi mdi-calendar" /> {t('settings_calendar')}
            </h4>
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>{t('settings_cal_chip')}</span>
                <small>
                  {t('settings_cal_chip_desc')}
                </small>
              </div>
              <button
                className={`ts-switch ${calendarChip ? 'on' : ''}`}
                role="switch"
                aria-checked={calendarChip}
                onClick={() => setCalendarChip((s) => !s)}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
            {calendarOptions.length > 0 ? (
              <div className="ts-field">
                <span>{t('settings_calendars')}</span>
                <div className="settings-cal-list">
                  {calendarOptions.map((c) => {
                    const included =
                      calendarEntities.length === 0 || calendarEntities.includes(c.entity_id);
                    return (
                      <label key={c.entity_id} className="settings-cal-row">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => {
                            // [] means "all": materialize it before excluding one.
                            const base = calendarEntities.length
                              ? calendarEntities
                              : calendarOptions.map((o) => o.entity_id);
                            const next = included
                              ? base.filter((id) => id !== c.entity_id)
                              : [...base, c.entity_id];
                            // Selecting every calendar collapses back to "all".
                            setCalendarEntities(
                              next.length === calendarOptions.length ? [] : next,
                            );
                          }}
                        />
                        {(c.attributes.friendly_name as string) || c.entity_id}
                      </label>
                    );
                  })}
                </div>
                <small className="settings-hint">
                  {t('settings_calendars_hint')}
                </small>
              </div>
            ) : (
              <small className="settings-hint">
                {t('settings_no_calendars')}
              </small>
            )}
          </section>

          {/* Data */}
          <section className="settings-section">
            <h4 className="settings-section-title">
              <span className="mdi mdi-database" /> {t('settings_data')}
            </h4>
            <small className="settings-hint">
              {t('settings_data_hint')}
            </small>
            <div className="settings-data-row">
              <button className="toolbar-btn" onClick={exportLayout}>
                <span className="mdi mdi-download" /> {t('settings_export')}
              </button>
              <label className="toolbar-btn" style={{ cursor: 'pointer' }}>
                <span className="mdi mdi-upload" /> {t('settings_import')}
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
            <div className="settings-data-row">
              <button
                className="toolbar-btn"
                onClick={() => {
                  if (
                    confirm(t('settings_start_blank_confirm'))
                  ) {
                    onStartBlank();
                    onClose();
                  }
                }}
              >
                <span className="mdi mdi-broom" /> {t('settings_start_blank_btn')}
              </button>
              <button
                className="toolbar-btn danger"
                onClick={() => {
                  if (confirm(t('settings_reset_confirm'))) {
                    onResetLayout();
                    onClose();
                  }
                }}
              >
                <span className="mdi mdi-restore" /> {t('settings_reset_btn')}
              </button>
            </div>
            <small className="settings-hint">
              {t('settings_start_blank_hint')}
            </small>
          </section>

          {/* Support */}
          <section className="settings-section">
            <h4 className="settings-section-title">
              <span className="mdi mdi-heart" /> {t('settings_support')}
            </h4>
            <small className="settings-hint">
              {t('settings_support_desc')}
            </small>
            <a
              className="bmb-button"
              href="https://venmo.com/u/jvenuto"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="bmb-emoji">🍺</span>
              <span className="bmb-label">{t('settings_buy_beer')}</span>
              <span className="mdi mdi-open-in-new bmb-ext" />
            </a>
          </section>
        </div>

        <div className="ts-footer">
          <button className="toolbar-btn" onClick={cancel}>
            {t('settings_cancel')}
          </button>
          <button className="toolbar-btn primary" onClick={() => save(true)}>
            <span className="mdi mdi-content-save" /> {t('settings_save')}
          </button>
        </div>
      </div>
    </div>
  );
}
