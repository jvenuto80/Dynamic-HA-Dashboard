import { useEffect, useMemo, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import type { NocNode, NocPort } from '../types';
import { Sparkline } from './Sparkline';
import { NocPortCell } from './NocPortStrip';
import {
  entityName,
  formatMetric,
  isUp,
  isSfpPort,
  metricFraction,
  metricStatus,
  metricUnit,
  numericState,
  PORT_SPEED_META,
  portPoeOn,
  portSpeedClass,
} from '../lib/noc';
import { smartFormatState } from '../lib/format';

type CallHA = (
  domain: string,
  service: string,
  data?: Record<string, unknown>,
  target?: { entity_id: string | string[] },
) => Promise<void>;

interface Props {
  node: NocNode;
  nodes?: NocNode[];
  entities: HassEntities;
  getHistory?: (entityId: string, hours?: number) => Promise<number[]>;
  onOpenDetail: (entityId: string) => void;
  onOpenNode?: (nodeId: string) => void;
  callHA?: CallHA;
  onClose: () => void;
}

/** A metric row in the flyout with full label, value, threshold bar and history. */
function MetricRow({
  entityId,
  label,
  value,
  unit,
  status,
  fraction,
  accent,
  history,
  onOpenDetail,
}: {
  entityId: string;
  label: string;
  value: number | undefined;
  unit: string;
  status: string;
  fraction: number;
  accent: string;
  history: number[];
  onOpenDetail: (id: string) => void;
}) {
  return (
    <button type="button" className="noc-fly-metric" onClick={() => onOpenDetail(entityId)}>
      <div className="noc-fly-metric-top">
        <span className="noc-fly-metric-label">{label}</span>
        <span className="noc-fly-metric-val">{formatMetric(value, unit)}</span>
      </div>
      <div className={`noc-bar noc-bar-${status === 'unknown' ? 'ok' : status}`}>
        <i style={{ width: `${fraction * 100}%` }} />
      </div>
      {history.length > 1 && (
        <span className="noc-fly-spark" style={{ ['--spark-color' as string]: accent }}>
          <Sparkline data={history} width={260} height={34} />
        </span>
      )}
    </button>
  );
}

/** The Ports section: a UniFi-style strip plus a detail card for the selected
 *  port with a PoE on/off toggle and a power-cycle action. */
function PortsSection({
  node,
  nodes,
  entities,
  callHA,
  onOpenDetail,
  onOpenNode,
}: {
  node: NocNode;
  nodes: NocNode[];
  entities: HassEntities;
  callHA?: CallHA;
  onOpenDetail: (entityId: string) => void;
  onOpenNode?: (nodeId: string) => void;
}) {
  const ports = node.ports ?? [];
  const [selId, setSelId] = useState<string | null>(ports[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const sel = ports.find((p) => p.id === selId) ?? null;

  const cycleSeconds = node.portCycleSeconds ?? 5;
  const upCount = ports.filter((p) => portSpeedClass(p, entities) !== 'disconnected' && portSpeedClass(p, entities) !== 'disabled').length;

  async function setPoe(port: NocPort, on: boolean) {
    if (!callHA || !port.poeEntity || busy) return;
    setBusy(port.id);
    try {
      await callHA('switch', on ? 'turn_on' : 'turn_off', undefined, { entity_id: port.poeEntity });
    } finally {
      setBusy(null);
    }
  }

  async function powerCycle(port: NocPort) {
    if (!callHA || busy) return;
    const hasButton = !!port.poeCycleEntity;
    const hasSwitch = !!port.poeEntity;
    if (!hasButton && !hasSwitch) return;
    const ok = window.confirm(
      `Power-cycle port ${port.num}${port.client ? ` (${port.client})` : ''}?\n\n${
        hasButton
          ? "This presses the port's Power-cycle button — PoE drops briefly, then restores."
          : `PoE will turn OFF for ${cycleSeconds}s, then back ON.`
      }`,
    );
    if (!ok) return;
    setBusy(port.id);
    try {
      if (hasButton) {
        await callHA('button', 'press', undefined, { entity_id: port.poeCycleEntity! });
      } else {
        await callHA('switch', 'turn_off', undefined, { entity_id: port.poeEntity! });
        await new Promise((r) => setTimeout(r, cycleSeconds * 1000));
        await callHA('switch', 'turn_on', undefined, { entity_id: port.poeEntity! });
      }
    } finally {
      setBusy(null);
    }
  }

  if (!ports.length) return null;

  const speed = sel ? portSpeedClass(sel, entities) : undefined;
  const poeOn = sel ? portPoeOn(sel, entities) : undefined;
  const selLinkNode = sel?.linkNodeId ? nodes.find((n) => n.id === sel.linkNodeId && n.id !== node.id) ?? null : null;
  // The entity worth opening in HA for full history/attributes. Prefer the live
  // readings (link speed, then connectivity, then the PoE power sensor) over the
  // control entities, since those have the useful graphs.
  const infoEntityId = sel
    ? sel.speedEntity ?? sel.linkEntity ?? sel.poeEntity ?? sel.poeCycleEntity
    : undefined;
  const infoEntityName = infoEntityId ? entityName(entities, infoEntityId) : '';

  return (
    <div className="noc-fly-section">
      <h3 className="noc-fly-h3">
        <span className="mdi mdi-ethernet" /> Ports
        <span className="noc-fly-count ok">{upCount}/{ports.length} up</span>
      </h3>
      <div className="noc-ports noc-ports-lg">
        {ports.map((p, i) => {
          const gap = isSfpPort(p) && i > 0 && !isSfpPort(ports[i - 1]);
          return (
            <span key={p.id} className="noc-port-wrap">
              {gap && <span className="noc-port-gap" aria-hidden="true" />}
              <NocPortCell
                port={p}
                entities={entities}
                active={p.id === selId}
                onClick={() => setSelId(p.id)}
              />
            </span>
          );
        })}
      </div>

      {sel && speed && (
        <div className="noc-port-detail">
          <div className="noc-port-detail-head">
            <span className={`noc-port-swatch noc-port-${speed}`} />
            <div className="noc-port-detail-id">
              <strong>Port {sel.num}</strong>
              {sel.client && <span>{sel.client}</span>}
            </div>
            <span className="noc-port-detail-speed">{PORT_SPEED_META[speed].label}</span>
          </div>

          <div className="noc-port-detail-grid">
            <div><span>Link</span><b>{PORT_SPEED_META[speed].short}</b></div>
            {sel.poe && <div><span>PoE class</span><b>{sel.poe.toUpperCase()}</b></div>}
            {poeOn !== undefined && (
              <div><span>PoE power</span><b className={poeOn ? 'ok' : 'crit'}>{poeOn ? 'On' : 'Off'}</b></div>
            )}
            {sel.role && <div><span>Role</span><b>{sel.role}</b></div>}
          </div>

          {(sel.poeEntity || sel.poeCycleEntity || infoEntityId || selLinkNode) && (
            <div className="noc-port-actions">
              {selLinkNode && onOpenNode && (
                <button
                  type="button"
                  className="noc-port-btn is-link"
                  onClick={() => onOpenNode(selLinkNode.id)}
                >
                  <span className="mdi mdi-transit-connection-variant" /> Open {selLinkNode.name}
                </button>
              )}
              {sel.poeEntity && (
                <button
                  type="button"
                  className="noc-port-btn"
                  disabled={busy === sel.id || !callHA}
                  onClick={() => setPoe(sel, !(poeOn ?? true))}
                >
                  <span className={`mdi ${poeOn ? 'mdi-flash-off' : 'mdi-flash'}`} />
                  {poeOn ? 'PoE off' : 'PoE on'}
                </button>
              )}
              {(sel.poeCycleEntity || sel.poeEntity) && (
                <button
                  type="button"
                  className="noc-port-btn is-warn"
                  disabled={busy === sel.id || !callHA}
                  onClick={() => powerCycle(sel)}
                >
                  <span className="mdi mdi-restart" />
                  {busy === sel.id ? 'Cycling…' : 'Power cycle'}
                </button>
              )}
              {infoEntityId && (
                <button
                  type="button"
                  className="noc-port-btn is-ghost"
                  title={`Open ${infoEntityName} in Home Assistant (history & attributes)`}
                  onClick={() => onOpenDetail(infoEntityId)}
                >
                  <span className="mdi mdi-open-in-new" /> <span>{infoEntityName || 'Open in HA'}</span>
                </button>
              )}
            </div>
          )}
          {(sel.poeEntity || sel.poeCycleEntity) && !callHA && (
            <div className="noc-port-note">Connect to Home Assistant to control PoE.</div>
          )}
        </div>
      )}
    </div>
  );
}

export function NocNodeFlyout({ node, nodes = [], entities, getHistory, onOpenDetail, onOpenNode, callHA, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [hist, setHist] = useState<Record<string, number[]>>({});
  const accent = node.accent ?? '#3b82f6';

  // Reverse links: other nodes whose ports link to THIS node (so an uplink set
  // on the switch's SFP port also surfaces a jump back from the gateway's
  // flyout, with no duplicate configuration).
  const incomingLinks = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string; via: string }[] = [];
    for (const n of nodes) {
      if (n.id === node.id) continue;
      for (const p of n.ports ?? []) {
        if (p.linkNodeId === node.id && !seen.has(n.id)) {
          seen.add(n.id);
          out.push({ id: n.id, name: n.name, via: p.client || `Port ${p.num}` });
        }
      }
    }
    return out;
  }, [nodes, node.id]);

  useEffect(() => {
    requestAnimationFrame(() => setOpen(true));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fetch recent history for each metric once.
  useEffect(() => {
    if (!getHistory) return;
    let active = true;
    Promise.all(
      node.metrics.map((m) =>
        getHistory(m.entity_id, 12)
          .then((d) => [m.entity_id, d.slice(-60)] as const)
          .catch(() => [m.entity_id, [] as number[]] as const),
      ),
    ).then((pairs) => {
      if (active) setHist(Object.fromEntries(pairs));
    });
    return () => {
      active = false;
    };
  }, [getHistory, node.metrics]);

  const containers = useMemo(() => {
    return (node.dockerWatch ?? []).map((id) => ({
      id,
      name: entityName(entities, id),
      up: isUp(entities[id]),
    }));
  }, [node.dockerWatch, entities]);
  const downCount = containers.filter((c) => !c.up).length;

  const tempVal = node.tempEntity ? numericState(entities[node.tempEntity]) : undefined;
  const tempUnit = node.tempEntity
    ? metricUnit({ id: '', entity_id: node.tempEntity, label: '' }, entities[node.tempEntity])
    : '';
  const uptimeEnt = node.uptimeEntity ? entities[node.uptimeEntity] : undefined;
  const uptime = uptimeEnt
    ? smartFormatState(uptimeEnt, node.uptimeFormat ?? 'auto', { isUptimeField: true }) ?? uptimeEnt.state
    : undefined;
  const isEmoji = node.icon && !node.icon.startsWith('mdi-');

  return (
    <>
      <div className={`noc-fly-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`noc-fly ${open ? 'open' : ''}`} style={{ ['--accent' as string]: accent }}>
        <div className="noc-fly-head">
          <div className="noc-fly-ico">
            {isEmoji ? node.icon : <span className={`mdi ${node.icon ?? 'mdi-server'}`} />}
          </div>
          <div className="noc-fly-title">
            <h2>{node.name}</h2>
            {node.sub && <p>{node.sub}</p>}
          </div>
          <button className="detail-close" onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        {(tempVal !== undefined || uptime) && (
          <div className="noc-fly-pills">
            {tempVal !== undefined && (
              <span className="noc-pill">
                <span className="mdi mdi-thermometer" /> {formatMetric(tempVal, tempUnit || '°')}
              </span>
            )}
            {uptime && <span className="noc-pill"><span className="mdi mdi-clock-outline" /> {uptime}</span>}
          </div>
        )}

        {incomingLinks.length > 0 && (
          <div className="noc-fly-links">
            {incomingLinks.map((l) => (
              <button
                key={l.id}
                type="button"
                className="noc-port-btn is-link"
                onClick={() => onOpenNode?.(l.id)}
                title={`Connected via ${l.via}`}
              >
                <span className="mdi mdi-transit-connection-variant" /> {l.name}
              </button>
            ))}
          </div>
        )}

        <PortsSection
          node={node}
          nodes={nodes}
          entities={entities}
          callHA={callHA}
          onOpenDetail={onOpenDetail}
          onOpenNode={onOpenNode}
        />

        {containers.length > 0 && (
          <div className="noc-fly-section">
            <h3 className="noc-fly-h3">
              <span className="mdi mdi-docker" /> Containers
              <span className={`noc-fly-count ${downCount ? 'crit' : 'ok'}`}>
                {downCount ? `${downCount} down` : 'all up'}
              </span>
            </h3>
            <div className="noc-fly-containers">
              {containers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`noc-container ${c.up ? 'is-up' : 'is-down'}`}
                  onClick={() => onOpenDetail(c.id)}
                >
                  <span className={`noc-led noc-led-${c.up ? 'ok' : 'crit'}`} />
                  <span className="noc-container-name">{c.name}</span>
                  <span className="noc-container-state">{c.up ? 'running' : 'down'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="noc-fly-section">
          <h3 className="noc-fly-h3"><span className="mdi mdi-chart-line" /> Metrics</h3>
          {node.metrics.length === 0 && <div className="noc-fly-empty">No metrics configured.</div>}
          {node.metrics.map((m) => {
            const e = entities[m.entity_id];
            const val = numericState(e);
            return (
              <MetricRow
                key={m.id}
                entityId={m.entity_id}
                label={m.label || entityName(entities, m.entity_id)}
                value={val}
                unit={metricUnit(m, e)}
                status={metricStatus(m, val)}
                fraction={metricFraction(m, val)}
                accent={accent}
                history={hist[m.entity_id] ?? []}
                onOpenDetail={onOpenDetail}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
