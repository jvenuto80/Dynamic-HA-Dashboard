import { useMemo, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import type { DashView, NocNode } from '../types';
import type { LayoutActions } from './DashboardView';
import { NocNodeFlyout } from './NocNodeFlyout';
import { NocBuilder } from './NocBuilder';
import { NocPanels } from './NocPanels';
import { NocNodeTile } from './NocNodeTile';
import {
  dockerDownCount,
  isUp,
  nodeStatus,
  numericState,
} from '../lib/noc';

interface Props {
  view: DashView;
  entities: HassEntities;
  editing: boolean;
  layout: LayoutActions;
  getHistory?: (entityId: string, hours?: number) => Promise<number[]>;
  onOpenDetail: (entityId: string) => void;
  callHA?: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: { entity_id: string | string[] },
  ) => Promise<void>;
}


/** Whether a node counts as "up/reachable" for the banner tally. */
function deviceUp(node: NocNode, entities: HassEntities): boolean {
  if (node.statusEntity) return isUp(entities[node.statusEntity]);
  return nodeStatus(node, entities) !== 'unknown';
}


export function NocView({ view, entities, editing, layout, getHistory, onOpenDetail, callHA }: Props) {
  const noc = view.noc;
  const [openNode, setOpenNode] = useState<string | null>(null);

  const nodes = noc?.nodes ?? [];

  const summary = useMemo(() => {
    let up = 0;
    let issues = 0;
    let watched = 0;
    let containersDown = 0;
    for (const n of nodes) {
      if (deviceUp(n, entities)) up += 1;
      const s = nodeStatus(n, entities);
      if (s === 'warn' || s === 'crit') issues += 1;
      watched += n.dockerWatch?.length ?? 0;
      containersDown += dockerDownCount(n, entities);
    }
    const latency = (noc?.wanLatency ?? [])
      .map((id) => numericState(entities[id]))
      .filter((v): v is number => v !== undefined);
    const avgLatency = latency.length ? Math.round(latency.reduce((a, b) => a + b, 0) / latency.length) : undefined;
    const clients = noc?.clientsEntity ? numericState(entities[noc.clientsEntity]) : undefined;
    return { up, total: nodes.length, issues, watched, containersDown, avgLatency, clients };
  }, [nodes, entities, noc]);

  if (editing) {
    return <NocBuilder view={view} entities={entities} layout={layout} getHistory={getHistory} />;
  }

  if (!noc || nodes.length === 0) {
    return (
      <div className="view-rows">
        <div className="page-empty">
          <span className="mdi mdi-server-network page-empty-icon" />
          <h3>Build your NOC</h3>
          <p>Add devices, assign sensors and pick which containers to watch — all in edit mode.</p>
        </div>
      </div>
    );
  }

  const allClear = summary.issues === 0 && summary.containersDown === 0;
  const active = nodes.find((n) => n.id === openNode) ?? null;

  return (
    <div className="noc">
      <div className={`noc-banner ${allClear ? 'is-ok' : 'is-alert'}`}>
        <span className="noc-pulse" />
        <div className="noc-banner-text">
          <h2>{allClear ? 'All Systems Operational' : `${summary.issues} device${summary.issues === 1 ? '' : 's'} need attention`}</h2>
          <div className="noc-banner-sub">
            {summary.total} device{summary.total === 1 ? '' : 's'} monitored
            {summary.containersDown > 0 && ` · ${summary.containersDown} container${summary.containersDown === 1 ? '' : 's'} down`}
          </div>
        </div>
        <div className="noc-chips">
          <div className="noc-chip">
            <div className={`noc-chip-v ${summary.up === summary.total ? 'ok' : 'warn'}`}>
              {summary.up}/{summary.total}
            </div>
            <div className="noc-chip-l">Devices Up</div>
          </div>
          {summary.avgLatency !== undefined && (
            <div className="noc-chip">
              <div className="noc-chip-v info">{summary.avgLatency} ms</div>
              <div className="noc-chip-l">WAN Latency</div>
            </div>
          )}
          {summary.clients !== undefined && (
            <div className="noc-chip">
              <div className="noc-chip-v ok">{summary.clients}</div>
              <div className="noc-chip-l">Clients</div>
            </div>
          )}
          {summary.watched > 0 && (
            <div className="noc-chip">
              <div className={`noc-chip-v ${summary.containersDown ? 'crit' : 'ok'}`}>
                {summary.watched - summary.containersDown}/{summary.watched}
              </div>
              <div className="noc-chip-l">Containers</div>
            </div>
          )}
        </div>
      </div>

      <div className="noc-eyebrow">Infrastructure · live</div>
      <div className="noc-nodes">
        {nodes.map((n) => (
          <NocNodeTile
            key={n.id}
            node={n}
            entities={entities}
            getHistory={getHistory}
            onOpen={() => setOpenNode(n.id)}
          />
        ))}
      </div>

      <NocPanels noc={noc} entities={entities} getHistory={getHistory} />

      {active && (
        <NocNodeFlyout
          key={active.id}
          node={active}
          nodes={nodes}
          entities={entities}
          getHistory={getHistory}
          onOpenDetail={onOpenDetail}
          onOpenNode={(id) => setOpenNode(id)}
          callHA={callHA}
          onClose={() => setOpenNode(null)}
        />
      )}
    </div>
  );
}
