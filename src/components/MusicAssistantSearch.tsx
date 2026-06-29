import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HassEntities } from 'home-assistant-js-websocket';
import {
  MA_MEDIA_TYPES,
  MA_RESULT_GROUPS,
  extractItems,
  type MaItem,
} from '../lib/musicAssistant';

export type SearchMusic = (opts: {
  term: string;
  mediaType?: string;
  limit?: number;
  libraryOnly?: boolean;
}) => Promise<Record<string, unknown>>;

export type PlayMusic = (player: string, mediaId: string, mediaType?: string) => Promise<void>;

export type GetMaPlayers = () => Promise<string[]>;

interface Props {
  entities: HassEntities;
  searchMusic: SearchMusic;
  playMusic: PlayMusic;
  /** Resolve the media players provided by Music Assistant (others can't be targeted). */
  getMaPlayers?: GetMaPlayers;
  /** Tile display name + icon (from the tile config / special-tile registry). */
  name: string;
  icon: string;
}

const PLAYER_KEY = 'ma-last-player';

/** Touch-first device (tablet/phone): focusing a text input pops the on-screen
 *  keyboard, so autofocus is hostile there (#26). */
const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * "Search in Music Assistant" — a launcher tile that opens a right-side flyout
 * (consistent with the entity detail panel). Searches via the
 * music_assistant.search service and plays a tapped result on the chosen media
 * player via music_assistant.play_media.
 */
export function MusicAssistantSearch({ entities, searchMusic, playMusic, getMaPlayers, name, icon }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Stable identity: an inline `() => setOpen(false)` changes every render
  // (i.e. every entity stream tick), and the panel's focus effect used to
  // re-run on it — re-stealing focus into the search box and popping the
  // tablet keyboard over and over (#26).
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="tile ma-tile" onClick={() => setOpen(true)}>
        <div className="tile-top">
          <span className={`mdi ${icon} tile-icon ma-tile-icon`} />
        </div>
        <div className="tile-info">
          <div className="tile-name">{name}</div>
          <div className="tile-sub">{t('music_search_play')}</div>
        </div>
        <span className="mdi mdi-magnify ma-tile-search" aria-hidden="true" />
      </button>

      <div className={`detail-overlay ${open ? 'open' : ''}`} onClick={close} />
      <div className={`detail-panel ma-flyout ${open ? 'open' : ''}`} aria-hidden={!open}>
        <MusicAssistantPanel
          entities={entities}
          searchMusic={searchMusic}
          playMusic={playMusic}
          getMaPlayers={getMaPlayers}
          open={open}
          onClose={close}
        />
      </div>
    </>
  );
}

function MusicAssistantPanel({
  entities,
  searchMusic,
  playMusic,
  getMaPlayers,
  open,
  onClose,
}: {
  entities: HassEntities;
  searchMusic: SearchMusic;
  playMusic: PlayMusic;
  getMaPlayers?: GetMaPlayers;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Load the player list when the flyout opens. Limited to Music Assistant
  // players (others can't be targeted by music_assistant.play_media); only falls
  // back to all media players if the entity registry can't be read at all.
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const nameOf = (eid: string) => String(entities[eid]?.attributes.friendly_name ?? eid);
      let ids: string[] = [];
      let resolvedFromMa = false;
      if (getMaPlayers) {
        try {
          ids = await getMaPlayers();
          resolvedFromMa = true;
        } catch {
          resolvedFromMa = false;
        }
      }
      // Only fall back to every media_player when the MA list couldn't be
      // resolved (e.g. a non-admin token can't read the registry). A successful
      // but empty MA list stays empty rather than showing unsupported players.
      if (!resolvedFromMa) {
        ids = Object.keys(entities).filter((k) => k.startsWith('media_player.'));
      }
      // Show only *active* players. Players disabled in Music Assistant stay in
      // the entity registry but drop out of the state machine (no entity) or
      // report `unavailable` and lose their MA attributes — so filter those out
      // and keep only entities that currently have a live, available state.
      const isActive = (id: string) => {
        const e = entities[id];
        return !!e && e.state !== 'unavailable' && e.state !== 'unknown';
      };
      const list = ids
        .filter(isActive)
        .map((id) => ({ id, name: nameOf(id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (!cancelled) setPlayers(list);
    })();
    return () => {
      cancelled = true;
    };
    // Refresh the snapshot each open; intentionally not reacting to entity streams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const [term, setTerm] = useState('');
  const [mediaType, setMediaType] = useState('');
  const [limit, setLimit] = useState(5);
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [player, setPlayer] = useState<string>(() => {
    const saved = localStorage.getItem(PLAYER_KEY);
    return saved ?? '';
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [searched, setSearched] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the search box only on the open *transition*, and never on touch
  // devices — there, focusing means popping the on-screen keyboard before the
  // user asked for it (#26). Guarding the transition (rather than focusing on
  // every effect run) also means a re-render can never steal focus back while
  // the user is working the dropdowns.
  const wasOpen = useRef(false);
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!open) return;
    if (justOpened && !isTouchDevice()) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(
    () => () => {
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // Default to the first player, or fix a saved selection that isn't a valid
  // Music Assistant player (e.g. left over from a previous list).
  useEffect(() => {
    if (!players.length) return;
    if (!player || !players.some((p) => p.id === player)) {
      setPlayer(players[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  const runSearch = async () => {
    const q = term.trim();
    if (!q) return;
    // Drop the on-screen keyboard so it doesn't bury the results (#26).
    if (isTouchDevice()) inputRef.current?.blur();
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await searchMusic({ term: q, mediaType: mediaType || undefined, limit, libraryOnly });
      setRaw(res);
    } catch (err) {
      setRaw(null);
      setError(err instanceof Error ? err.message : t('music_search_failed'));
    } finally {
      setLoading(false);
    }
  };

  const groups = useMemo(() => {
    if (!raw) return [];
    return MA_RESULT_GROUPS.map((g) => {
      let items = extractItems(raw, g.key, g.mediaType);
      if (favouritesOnly) items = items.filter((i) => i.favorite);
      return { ...g, items };
    }).filter((g) => g.items.length > 0);
  }, [raw, favouritesOnly]);

  const totalResults = groups.reduce((n, g) => n + g.items.length, 0);

  const flashToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const play = async (item: MaItem) => {
    if (!player) {
      flashToast(t('music_select_first'));
      return;
    }
    localStorage.setItem(PLAYER_KEY, player);
    try {
      await playMusic(player, item.uri, item.mediaType);
      const where = players.find((p) => p.id === player)?.name ?? 'player';
      flashToast(t('music_playing', { title: item.name, player: where }));
    } catch (err) {
      flashToast(err instanceof Error ? err.message : t('music_could_not_play'));
    }
  };

  return (
    <>
      <div className="detail-header">
        <h2 className="ma-flyout-title">
          <span className="ma-logo mdi mdi-music-circle" />
          {t('music_assistant')}
        </h2>
        <button className="detail-close" onClick={onClose} title={t('music_close')}>
          <span className="mdi mdi-close" />
        </button>
      </div>

      <div className="ma-flyout-body">
        <div className="ma-search-row">
          <span className="mdi mdi-magnify" />
          <input
            ref={inputRef}
            className="ma-search-input"
            placeholder={t('music_search_placeholder')}
            value={term}
            enterKeyHint="search"
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch();
            }}
          />
          <button className="ma-search-go" onClick={runSearch} disabled={loading || !term.trim()}>
            {loading ? <span className="mdi mdi-loading mdi-spin" /> : <span className="mdi mdi-magnify" />}
          </button>
        </div>

        <div className="ma-controls">
          <div className="ma-field">
            <span>{t('music_media_player')}</span>
            <MaSelect
              value={player}
              placeholder={players.length ? t('music_select_player') : t('music_no_players')}
              options={players.map((p) => ({ value: p.id, label: p.name }))}
              onChange={setPlayer}
            />
          </div>
          <div className="ma-controls-row">
            <div className="ma-field">
              <span>{t('music_media_type')}</span>
              <MaSelect
                value={mediaType}
                options={MA_MEDIA_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                onChange={setMediaType}
              />
            </div>
            <div className="ma-field ma-field-narrow">
              <span>{t('music_results')}</span>
              <MaSelect
                value={String(limit)}
                options={[5, 10, 15, 20, 30, 50].map((n) => ({ value: String(n), label: String(n) }))}
                onChange={(v) => setLimit(Number(v))}
              />
            </div>
          </div>
        </div>

        <div className="ma-toggles">
          <button
            type="button"
            className={`ma-chip ${libraryOnly ? 'on' : ''}`}
            aria-pressed={libraryOnly}
            onClick={() => setLibraryOnly((v) => !v)}
          >
            <span className={`mdi ${libraryOnly ? 'mdi-checkbox-marked' : 'mdi-checkbox-blank-outline'}`} />
            {t('music_local')}
          </button>
          <button
            type="button"
            className={`ma-chip ${favouritesOnly ? 'on' : ''}`}
            aria-pressed={favouritesOnly}
            onClick={() => setFavouritesOnly((v) => !v)}
          >
            <span className={`mdi ${favouritesOnly ? 'mdi-heart' : 'mdi-heart-outline'}`} />
            {t('music_favourites')}
          </button>
        </div>

        <div className="ma-results">
          {error && (
            <div className="ma-empty ma-error">
              <span className="mdi mdi-alert-circle" /> {error}
            </div>
          )}
          {!error && loading && (
            <div className="ma-empty">
              <span className="mdi mdi-loading mdi-spin" /> {t('music_searching')}
            </div>
          )}
          {!error && !loading && searched && totalResults === 0 && (
            <div className="ma-empty">
              <span className="mdi mdi-music-note-off" /> {t('music_no_results')}
            </div>
          )}
          {!error && !loading && !searched && (
            <div className="ma-empty ma-hint">
              <span className="mdi mdi-magnify" /> {t('music_search_desc')}
            </div>
          )}
          {!loading &&
            groups.map((g) => (
              <div className="ma-group" key={g.key}>
                <h4 className="ma-group-title">
                  <span className={`mdi ${g.icon}`} /> {g.label}
                </h4>
                <div className="ma-group-items">
                  {g.items.map((item) => (
                    <button
                      type="button"
                      className="ma-item"
                      key={item.uri}
                      onClick={() => play(item)}
                      title={t('music_play_on')}
                    >
                      <span className="ma-item-art">
                        {item.image ? (
                          <img src={item.image} alt="" loading="lazy" />
                        ) : (
                          <span className={`mdi ${g.icon}`} />
                        )}
                        <span className="ma-item-play mdi mdi-play-circle" />
                      </span>
                      <span className="ma-item-text">
                        <span className="ma-item-name">
                          {item.name}
                          {item.favorite && <span className="mdi mdi-heart ma-item-fav" />}
                        </span>
                        {item.subtitle && <span className="ma-item-sub">{item.subtitle}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      {toast && <div className="ma-toast">{toast}</div>}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Custom dropdown. A native <select> reopens-and-closes when the dashboard
// re-renders on every entity stream tick, and its option list uses OS styling
// (often unreadable on the dark theme). This React-controlled menu avoids both.
// ──────────────────────────────────────────────────────────────────────────
function MaSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className={`ma-dd ${open ? 'open' : ''}`} ref={ref}>
      <button
        type="button"
        className="ma-dd-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={options.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`ma-dd-value ${selected ? '' : 'placeholder'}`}>
          {selected ? selected.label : placeholder ?? t('music_select')}
        </span>
        <span className="mdi mdi-chevron-down ma-dd-caret" />
      </button>
      {open && (
        <div className="ma-dd-menu" role="listbox">
          {options.map((o) => (
            <button
              type="button"
              role="option"
              aria-selected={o.value === value}
              key={o.value}
              className={`ma-dd-option ${o.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="ma-dd-option-label">{o.label}</span>
              {o.value === value && <span className="mdi mdi-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
