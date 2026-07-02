import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { haptic } from '../lib/haptics';
import type { ConversationResult } from '../hooks/useHomeAssistant';

export type Converse = (
  text: string,
  opts?: { conversationId?: string; language?: string },
) => Promise<ConversationResult>;

interface Props {
  converse: Converse;
  onClose: () => void;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assist';
  text: string;
  /** Assist replied with response_type 'error' (intent failed, unknown device…). */
  isError?: boolean;
}

// ── Browser speech recognition (voice input) ─────────────────────────────────
// Chrome/Edge/Safari expose it (usually as webkitSpeechRecognition); it needs a
// secure context for mic access. Where it's missing the flyout degrades to
// text-only input. lib.dom has no types for it, so declare the minimal shape.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined' || !window.isSecureContext) return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

/** BCP-47 speech locale for each UI language. */
const SPEECH_LANG: Record<string, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  de: 'de-DE',
  fr: 'fr-FR',
  pl: 'pl-PL',
  nl: 'nl-NL',
};

/** Touch-first device: focusing the input pops the on-screen keyboard, so
 *  autofocus is hostile there (#26) — the user taps the mic or the field. */
const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * HA Assist flyout (issue #19): a chat-style panel over the dashboard. Voice
 * input via the browser's SpeechRecognition when available; always a text box.
 * Commands go to the server's conversation agent (`conversation/process`), and
 * follow-ups reuse the returned conversation_id so context carries over.
 */
export function AssistFlyout({ converse, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const conversationId = useRef<string | undefined>(undefined);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const speechCtor = getSpeechRecognitionCtor();

  // Keep the newest message in view as the transcript grows.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, interim, busy]);

  // Esc closes, matching the other flyouts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isTouchDevice()) inputRef.current?.focus();
    // Abort any in-flight recognition when the flyout unmounts.
    return () => recRef.current?.abort();
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setInput('');
      setInterim('');
      const userMsg: ChatMessage = { id: nextId.current++, role: 'user', text };
      setMessages((m) => [...m, userMsg]);
      setBusy(true);
      try {
        const res = await converse(text, {
          conversationId: conversationId.current,
          language: i18n.language,
        });
        conversationId.current = res.conversation_id ?? conversationId.current;
        const speech = res.response?.speech?.plain?.speech?.trim();
        setMessages((m) => [
          ...m,
          {
            id: nextId.current++,
            role: 'assist',
            text: speech || t('assist_done'),
            isError: res.response?.response_type === 'error',
          },
        ]);
      } catch {
        setMessages((m) => [
          ...m,
          { id: nextId.current++, role: 'assist', text: t('assist_error'), isError: true },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [converse, i18n.language, t],
  );

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!speechCtor || listening) return;
    const rec = new speechCtor();
    recRef.current = rec;
    rec.lang = SPEECH_LANG[i18n.language] ?? i18n.language;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let liveText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else liveText += r[0].transcript;
      }
      setInterim(finalText + liveText);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
      if (finalText.trim()) send(finalText);
    };
    rec.onerror = () => {
      setListening(false);
      setInterim('');
    };
    setListening(true);
    haptic(12);
    rec.start();
  }, [speechCtor, listening, i18n.language, send]);

  return (
    <div className="assist-overlay" onClick={onClose}>
      <div
        className="assist-panel"
        role="dialog"
        aria-label={t('assist_title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="assist-head">
          <h3>
            <span className="mdi mdi-comment-processing-outline" /> {t('assist_title')}
          </h3>
          <button className="detail-close" onClick={onClose} title={t('assist_close')}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="assist-messages" ref={listRef}>
          {messages.length === 0 && !interim && (
            <div className="assist-empty">
              <span className="mdi mdi-comment-question-outline" />
              <p>{t('assist_hint')}</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`assist-msg ${m.role} ${m.isError ? 'error' : ''}`}>
              {m.text}
            </div>
          ))}
          {interim && <div className="assist-msg user interim">{interim}</div>}
          {busy && (
            <div className="assist-msg assist thinking">
              <span className="assist-dot" />
              <span className="assist-dot" />
              <span className="assist-dot" />
            </div>
          )}
        </div>

        <form
          className="assist-input-row"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {speechCtor && (
            <button
              type="button"
              className={`assist-mic ${listening ? 'listening' : ''}`}
              title={t('assist_speak')}
              onClick={listening ? stopListening : startListening}
            >
              <span className={`mdi ${listening ? 'mdi-microphone' : 'mdi-microphone-outline'}`} />
            </button>
          )}
          <input
            ref={inputRef}
            className="assist-input"
            type="text"
            placeholder={listening ? t('assist_listening') : t('assist_placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={listening}
          />
          <button
            type="submit"
            className="assist-send"
            title={t('assist_send')}
            disabled={busy || !input.trim()}
          >
            <span className="mdi mdi-send" />
          </button>
        </form>
        {!speechCtor && <div className="assist-note">{t('assist_speech_unavailable')}</div>}
      </div>
    </div>
  );
}

/** The floating mic button that opens the Assist flyout. */
export function AssistFab({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="assist-fab" title={t('assist_open')} onClick={onOpen}>
      <span className="mdi mdi-microphone" />
    </button>
  );
}
