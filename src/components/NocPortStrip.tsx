import type { HassEntities } from 'home-assistant-js-websocket';
import type { NocPort, NocPortRole } from '../types';
import { PORT_SPEED_META, isSfpPort, portPoeOn, portSpeedClass } from '../lib/noc';

const ROLE_ICON: Record<NocPortRole, string> = {
  uplink: 'mdi-arrow-up-bold',
  aggregate: 'mdi-vector-link',
  mirror: 'mdi-eye-outline',
};

/** A single UniFi-style port cell, color-coded by its resolved speed/state. */
export function NocPortCell({
  port,
  entities,
  onClick,
  active,
}: {
  port: NocPort;
  entities: HassEntities;
  onClick?: () => void;
  active?: boolean;
}) {
  const speed = portSpeedClass(port, entities);
  const poeOn = portPoeOn(port, entities);
  const meta = PORT_SPEED_META[speed];
  const title = [
    `Port ${port.num}`,
    port.client,
    meta.label,
    port.poe ? port.poe.toUpperCase() : undefined,
    poeOn === false ? 'PoE off' : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`noc-port noc-port-${speed}${active ? ' is-active' : ''}${
        poeOn === false ? ' poe-off' : ''
      }`}
      title={title}
      onClick={onClick}
      aria-label={title}
    >
      {port.poe && <span className="noc-port-poe mdi mdi-flash" />}
      {port.role && <span className={`noc-port-role mdi ${ROLE_ICON[port.role]}`} />}
      <span className="noc-port-num">{port.num}</span>
    </Tag>
  );
}

/**
 * A compact, color-coded row of switch ports (matches the UniFi port panel).
 * Shared by the node tile (read-only) and the flyout (interactive). When
 * `onPort` is set each cell is a button.
 */
export function NocPortStrip({
  ports,
  entities,
  onPort,
  activeId,
  large = false,
}: {
  ports: NocPort[];
  entities: HassEntities;
  onPort?: (port: NocPort) => void;
  activeId?: string | null;
  large?: boolean;
}) {
  if (!ports.length) return null;
  // Insert a one-port-wide gap at the first RJ45 → SFP boundary, like a real
  // switch faceplate. Based on each port's configured type so a disconnected
  // SFP still sits with the SFP cage.
  return (
    <div className={`noc-ports${large ? ' noc-ports-lg' : ''}`} role="group" aria-label="Switch ports">
      {ports.map((p, i) => {
        const gap = isSfpPort(p) && i > 0 && !isSfpPort(ports[i - 1]);
        return (
          <span key={p.id} className="noc-port-wrap">
            {gap && <span className="noc-port-gap" aria-hidden="true" />}
            <NocPortCell
              port={p}
              entities={entities}
              active={activeId === p.id}
              onClick={onPort ? () => onPort(p) : undefined}
            />
          </span>
        );
      })}
    </div>
  );
}
