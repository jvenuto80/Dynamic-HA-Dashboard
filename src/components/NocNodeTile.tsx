import { useEffect, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import type { NocNode } from '../types';
import { Sparkline } from './Sparkline';
import { NocPortStrip } from './NocPortStrip';
import {
  dockerDownCount,
  formatMetric,
  formatPill,
  metricFraction,
  metricStatus,
  metricUnit,
  nodeStatus,
  numericState,
  statusAlert,
  type NocStatus,
} from '../lib/noc';
import { smartFormatState } from '../lib/format';

function ledClass(status: NocStatus): string {
  return `noc-led noc-led-${status}`;
}

/**
 * A compact device node tile. Summary only — detail lives in the flyout.
 * Reused by both the live NOC view and the edit-mode builder's live preview.
 * Pass `preview` to make it non-interactive (no click handler, not focusable).
 */
export function NocNodeTile({
  node,
  entities,
  getHistory,
  onOpen,
  preview = false,
}: {
  node: NocNode;
  entities: HassEntities;
  getHistory?: (entityId: string, hours?: number) => Promise<number[]>;
  onOpen?: () => void;
  preview?: boolean;
}) {
  const status = nodeStatus(node, entities);
  const accent = node.accent ?? '#3b82f6';
  const primary = node.metrics.filter((m) => m.primary);
  const shown = (primary.length ? primary : node.metrics).slice(0, 3);

  // One lightweight sparkline per tile. The user can choose which metric it
  // tracks (sparkMetricId); otherwise it defaults to the first shown metric.
  // HA only records a point when a value changes, so a steady metric (e.g. a
  // UPS pinned at 100%) comes back with a single point. Fall back to the live
  // value and pad to a flat line so every tile shows a consistent sparkline.
  const sparkMetric =
    (node.sparkMetricId && node.metrics.find((m) => m.id === node.sparkMetricId)) || shown[0];
  const leadId = sparkMetric?.entity_id;
  const leadLabel = sparkMetric
    ? sparkMetric.label || String(entities[sparkMetric.entity_id]?.attributes?.friendly_name ?? sparkMetric.entity_id)
    : '';
  const leadLive = leadId ? numericState(entities[leadId]) : undefined;
  const [spark, setSpark] = useState<number[]>([]);
  useEffect(() => {
    if (!getHistory || !leadId) return;
    let active = true;
    getHistory(leadId, 6)
      .then((d) => {
        if (!active) return;
        let pts = d.slice(-40);
        if (pts.length === 1 && leadLive !== undefined) pts = [leadLive, leadLive];
        else if (pts.length === 1) pts = [pts[0], pts[0]];
        setSpark(pts);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [getHistory, leadId, leadLive]);

  const tempVal = node.tempEntity ? numericState(entities[node.tempEntity]) : undefined;
  const tempUnit = node.tempEntity ? metricUnit({ id: '', entity_id: node.tempEntity, label: '' }, entities[node.tempEntity]) : '';
  const uptimeEnt = node.uptimeEntity ? entities[node.uptimeEntity] : undefined;
  const uptime = uptimeEnt
    ? smartFormatState(uptimeEnt, node.uptimeFormat ?? 'auto', { isUptimeField: true }) ?? uptimeEnt.state
    : undefined;
  const down = dockerDownCount(node, entities);
  const watched = node.dockerWatch?.length ?? 0;
  const alert = statusAlert(node, entities);
  const isEmoji = node.icon && !node.icon.startsWith('mdi-');

  return (
    <button
      type="button"
      className={`noc-node noc-node-${status}`}
      style={{ ['--accent' as string]: accent }}
      onClick={preview ? undefined : onOpen}
      tabIndex={preview ? -1 : undefined}
      aria-hidden={preview || undefined}
    >
      <div className="noc-node-head">
        <div className="noc-node-ico">
          {isEmoji ? node.icon : <span className={`mdi ${node.icon ?? 'mdi-server'}`} />}
        </div>
        <div className="noc-node-id">
          <div className="noc-node-name">{node.name}</div>
          {node.sub && <div className="noc-node-sub">{node.sub}</div>}
        </div>
        <span className={ledClass(status)} />
      </div>

      {alert && (
        <div className={`noc-status-chip is-${alert.level}`}>
          <span className="mdi mdi-alert" /> {alert.text}
        </div>
      )}

      {watched > 0 && (
        <div className={`noc-docker-chip ${down ? 'is-down' : 'is-ok'}`}>
          <span className={`mdi ${down ? 'mdi-alert-circle' : 'mdi-docker'}`} />
          {down ? `${down} of ${watched} down` : `${watched} container${watched > 1 ? 's' : ''} up`}
        </div>
      )}

      {shown.map((m) => {
        const val = numericState(entities[m.entity_id]);
        const st = metricStatus(m, val);
        const unit = metricUnit(m, entities[m.entity_id]);
        const label = m.label || String(entities[m.entity_id]?.attributes?.friendly_name ?? m.entity_id);
        return (
          <div className="noc-metric" key={m.id}>
            <div className="noc-metric-top">
              <span className="noc-metric-label">{label}</span>
              <span className="noc-metric-val">{formatMetric(val, unit)}</span>
            </div>
            <div className={`noc-bar noc-bar-${st === 'unknown' ? 'ok' : st}`}>
              <i style={{ width: `${metricFraction(m, val) * 100}%` }} />
            </div>
          </div>
        );
      })}

      {shown.length === 0 && watched === 0 && (
        <div className="noc-node-empty">No metrics yet</div>
      )}

      <div className="noc-node-foot">
        {tempVal !== undefined && (
          <span className="noc-pill">
            <span className="mdi mdi-thermometer" /> {formatMetric(tempVal, tempUnit || '°')}
          </span>
        )}
        {uptime && <span className="noc-pill">{uptime}</span>}
        {(node.pills ?? []).map((p) => {
          const isEmojiIcon = p.icon && !p.icon.startsWith('mdi-');
          return (
            <span className="noc-pill" key={p.id}>
              {p.icon && (isEmojiIcon ? <span>{p.icon}</span> : <span className={`mdi ${p.icon}`} />)} {formatPill(p, entities)}
            </span>
          );
        })}
        {spark.length > 1 && (
          <span className="noc-spark-wrap">
            <span className="noc-spark-key">{leadLabel}</span>
            <span className="noc-spark" style={{ ['--spark-color' as string]: accent }}>
              <Sparkline data={spark} width={88} height={26} />
            </span>
          </span>
        )}
      </div>

      {node.ports && node.ports.length > 0 && (
        <NocPortStrip ports={node.ports} entities={entities} />
      )}
    </button>
  );
}
