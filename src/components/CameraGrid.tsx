import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cameras } from '../config';
import { cameraProxyUrl, useCameraFeed } from '../hooks/useCameraFeed';
import { useSignedUrlsFresh } from '../hooks/useHomeAssistant';
import type { HassEntities } from 'home-assistant-js-websocket';

interface Props {
  entities: HassEntities;
}

/** Choose a column count so a handful of cameras grow to fill the space,
 *  and more cameras shrink into a tighter grid. */
function columnsFor(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  if (count <= 9) return 3;
  return 4;
}

/** Grid thumbnail. `url` is undefined while the camera is unavailable or the
 *  signed URLs are suspect (post-wake, pre-verify) — then the last successfully
 *  requested frame stays up instead, so no stale-token request is ever fired
 *  (HA logs each one as "invalid authentication"). Mounting during the suspect
 *  window (the screensaver's shortcut can land here at the instant of wake)
 *  shows the offline glyph until verification lands. A failed frame hides
 *  itself until HA rotates the URL. */
function CameraThumb({ url, name }: { url: string | undefined; name: string }) {
  const lastGood = useRef<string | undefined>(undefined);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (url) lastGood.current = url;
  const src = url ?? lastGood.current;
  if (!src || src === failedSrc) {
    return (
      <div className="camera-offline">
        <span className="mdi mdi-camera-off" />
      </div>
    );
  }
  return <img src={src} alt={name} loading="lazy" onError={() => setFailedSrc(src)} />;
}

export function CameraGrid({ entities }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const signedFresh = useSignedUrlsFresh();

  // Close popup on Escape.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const cols = columnsFor(cameras.length);
  const selectedCam = cameras.find((c) => c.entity_id === selected) || null;
  const selectedEntity = selectedCam ? entities[selectedCam.entity_id] : null;
  const selectedAvailable = !!selectedEntity && selectedEntity.state !== 'unavailable';

  // Live popup feed. useCameraFeed owns the refresh loop: it pauses on failed
  // frames, hidden tabs, and socket drops so a since-rotated signed token never
  // gets hammered against HA (each attempt is logged as "invalid
  // authentication" by http.ban).
  const modalBase = selectedCam && selectedEntity && selectedAvailable
    ? cameraProxyUrl(selectedEntity, selectedCam.entity_id)
    : undefined;
  const modalFeed = useCameraFeed(modalBase, 1000);

  return (
    <>
      <div
        className="camera-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cameras.map((cam) => {
          const entity = entities[cam.entity_id];
          const isAvailable = entity && entity.state !== 'unavailable';
          // Grid thumbnails use the un-busted signed URL: they refresh whenever
          // HA rotates the token (a new entity_picture) — but only while the
          // cached URL is trusted; see CameraThumb.
          const imgUrl =
            isAvailable && signedFresh ? cameraProxyUrl(entity, cam.entity_id) : undefined;

          return (
            <div
              key={cam.entity_id}
              className="camera-card"
              onClick={() => isAvailable && setSelected(cam.entity_id)}
            >
              {isAvailable ? (
                <CameraThumb url={imgUrl} name={cam.name} />
              ) : (
                <div className="camera-offline">
                  <span className="mdi mdi-camera-off" />
                </div>
              )}
              <div className="camera-label">
                <span>{cam.name}</span>
                <span className={`status-badge ${isAvailable ? '' : 'offline'}`}>
                  {isAvailable ? t('cam_live') : t('cam_offline')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedCam && (
        <div className="camera-modal-overlay" onClick={() => setSelected(null)}>
          <div className="camera-modal" onClick={(e) => e.stopPropagation()}>
            <div className="camera-modal-head">
              <span className="camera-modal-title">{selectedCam.name}</span>
              <button
                className="camera-modal-close"
                title={t('cam_close')}
                onClick={() => setSelected(null)}
              >
                <span className="mdi mdi-close" />
              </button>
            </div>
            <div className="camera-modal-body">
              {modalFeed.src ? (
                <img
                  src={modalFeed.src}
                  alt={selectedCam.name}
                  onError={modalFeed.onError}
                  onLoad={modalFeed.onLoad}
                />
              ) : (
                <div className="camera-offline">
                  <span className="mdi mdi-camera-off" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
