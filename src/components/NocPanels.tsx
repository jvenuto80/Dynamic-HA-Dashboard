import { useEffect, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import type { NocApiStat, NocConfig, NocDonut, NocMetric, NocNode, NocPanel, NocPowerUnit } from '../types';
import { formatMetric, numericState } from '../lib/noc';
import { getJsonPath, proxyFetchJson, toNumber } from '../lib/apiProxy';

interface Props {
  noc: NocConfig;
  entities: HassEntities;
  getHistory?: (entityId: string, hours?: number) => Promise<number[]>;
}

const STAT_COLORS = ['#ff6b35', '#3b82f6', '#a855f7', '#06b6d4', '#10b981'];

const findMetric = (node: NocNode, re: RegExp): NocMetric | undefined =>
  node.metrics.find((m) => re.test(m.label) || re.test(m.entity_id));

function upsNodes(nodes: NocNode[]): NocNode[] {
  return nodes.filter((n) => findMetric(n, /runtime|battery|batt/i));
}

function storageMetrics(nodes: NocNode[]): { node: NocNode; metric: NocMetric }[] {
  const out: { node: NocNode; metric: NocMetric }[] = [];
  for (const n of nodes) {
    for (const m of n.metrics) {
      if (/storage|array|disk|used|capacity/i.test(m.label) && (m.unit === '%' || m.unit === undefined)) {
        out.push({ node: n, metric: m });
      }
    }
  }
  return out;
}

/** Build sensible default panels from the configured nodes. Used by the
 *  builder's "auto-populate" so the user gets editable starting points. */
export function deriveDefaultPanels(noc: NocConfig): NocPanel[] {
  const nodes = noc.nodes ?? [];
  const panels: NocPanel[] = [];
  const t = Date.now().toString(36);

  const wanIds = noc.wanLatency ?? [];
  if (wanIds.length) {
    panels.push({
      id: `panel-wan-${t}`,
      type: 'wan',
      title: 'Internet · WAN',
      subtitle: 'Live latency from your gateway',
      span: 1.5,
      stats: wanIds.map((id, i) => ({
        id: `stat-${i}`,
        entity_id: id,
        label: id.replace(/^sensor\./, '').replace(/_/g, ' '),
        color: STAT_COLORS[i % STAT_COLORS.length],
      })),
      series: [...wanIds],
    });
  }

  const storage = storageMetrics(nodes);
  if (storage.length) {
    panels.push({
      id: `panel-storage-${t}`,
      type: 'storage',
      title: 'Storage',
      subtitle: 'Capacity across your fleet',
      donuts: storage.map(({ node, metric }, i) => ({
        id: `donut-${i}`,
        entity_id: metric.entity_id,
        label: node.name,
        max: metric.max ?? 100,
        sublabel: metric.label,
      })),
    });
  }

  const ups = upsNodes(nodes);
  if (ups.length) {
    panels.push({
      id: `panel-power-${t}`,
      type: 'power',
      title: 'Power',
      subtitle: ups.length > 1 ? 'Dual UPS battery backup' : 'UPS battery backup',
      units: ups.map((n, i) => ({
        id: `unit-${i}`,
        name: n.name,
        batteryEntity: findMetric(n, /battery|batt/i)?.entity_id,
        runtimeEntity: findMetric(n, /runtime/i)?.entity_id,
        loadEntity: findMetric(n, /load/i)?.entity_id,
        drawEntity: findMetric(n, /draw|watt|power/i)?.entity_id,
        statusEntity: n.statusEntity,
      })),
    });
  }

  return panels;
}

/** Panels to actually render: explicit config when present, else derived. */
export function effectivePanels(noc: NocConfig): NocPanel[] {
  if (noc.panels && noc.panels.length) return noc.panels;
  return deriveDefaultPanels(noc);
}

export function defaultTitle(type: NocPanel['type']): string {
  return type === 'wan' ? 'Internet · WAN' : type === 'storage' ? 'Storage' : 'Power';
}

function useApiStats(apiStats: NocApiStat[]): Record<string, number | undefined> {
  const [values, setValues] = useState<Record<string, number | undefined>>({});
  const key = JSON.stringify(apiStats.map((a) => [a.id, a.url, a.token, a.path, a.multiplier, a.pollSeconds]));

  useEffect(() => {
    if (!apiStats.length) return;
    let active = true;
    const timers: ReturnType<typeof setInterval>[] = [];
    const load = (a: NocApiStat) => {
      if (!a.url || !a.path) return;
      proxyFetchJson(a.url, a.token)
        .then((doc) => {
          if (!active) return;
          const raw = toNumber(getJsonPath(doc, a.path));
          const val = raw !== undefined ? raw * (a.multiplier ?? 1) : undefined;
          setValues((prev) => ({ ...prev, [a.id]: val }));
        })
        .catch(() => active && setValues((prev) => ({ ...prev, [a.id]: undefined })));
    };
    for (const a of apiStats) {
      load(a);
      timers.push(setInterval(() => load(a), Math.max(15, a.pollSeconds ?? 60) * 1000));
    }
    return () => {
      active = false;
      timers.forEach(clearInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return values;
}

function WanPanel({ panel, entities, getHistory }: { panel: NocPanel; entities: HassEntities; getHistory?: Props['getHistory'] }) {
  const ids = panel.series ?? [];
  const stats = panel.stats ?? [];
  const apiStats = panel.apiStats ?? [];
  const apiValues = useApiStats(apiStats);
  const [series, setSeries] = useState<Record<string, number[]>>({});

  useEffect(() => {
    if (!getHistory || !ids.length) return;
    let active = true;
    Promise.all(
      ids.map((id) => getHistory(id, 12).then((d) => [id, d.slice(-80)] as const).catch(() => [id, [] as number[]] as const)),
    ).then((pairs) => active && setSeries(Object.fromEntries(pairs)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getHistory, ids.join(',')]);

  const all = ids.flatMap((id) => series[id] ?? []);
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const range = max - min || 1;
  const W = 520;
  const H = 120;
  const toPath = (data: number[]) => {
    if (data.length < 2) return '';
    const step = W / (data.length - 1);
    return data
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(H - ((v - min) / range) * (H - 16) - 8).toFixed(1)}`)
      .join(' ');
  };
  const colorFor = (i: number) => stats[i]?.color ?? STAT_COLORS[i % STAT_COLORS.length];

  return (
    <>
      <div className="noc-stats-row">
        {stats.map((s, i) => {
          const e = entities[s.entity_id];
          const unit = s.unit ?? (e?.attributes?.unit_of_measurement as string | undefined) ?? '';
          return (
            <div className="noc-stat" key={s.id}>
              <div className="noc-stat-n" style={{ color: s.color ?? STAT_COLORS[i % STAT_COLORS.length] }}>
                {formatMetric(numericState(e), '')}<small> {unit}</small>
              </div>
              <div className="noc-stat-k">{s.label}</div>
            </div>
          );
        })}
        {apiStats.map((a, i) => (
          <div className="noc-stat" key={a.id}>
            <div className="noc-stat-n" style={{ color: a.color ?? STAT_COLORS[(stats.length + i) % STAT_COLORS.length] }}>
              {formatMetric(apiValues[a.id], '')}<small> {a.unit ?? ''}</small>
            </div>
            <div className="noc-stat-k">{a.label}</div>
          </div>
        ))}
      </div>
      {ids.length > 0 && (
        <svg className="noc-wan-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          {ids.map((id, i) => {
            const path = toPath(series[id] ?? []);
            if (!path) return null;
            return <path key={id} d={path} fill="none" stroke={colorFor(i)} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />;
          })}
        </svg>
      )}
      {stats.length > 0 && ids.length > 0 && (
        <div className="noc-legend">
          {ids.map((id, i) => {
            const st = stats.find((s) => s.entity_id === id);
            return <span key={id}><i style={{ background: colorFor(stats.indexOf(st!)) }} />{st?.label ?? id}</span>;
          })}
        </div>
      )}
    </>
  );
}

function StoragePanel({ panel, entities }: { panel: NocPanel; entities: HassEntities }) {
  const donuts = panel.donuts ?? [];
  const color = (pct: number) => (pct >= 92 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981');
  return (
    <div className="noc-donuts">
      {donuts.map((d: NocDonut) => {
        const val = numericState(entities[d.entity_id]);
        const max = d.max ?? 100;
        const pct = val !== undefined ? Math.max(0, Math.min(100, Math.round((val / max) * 100))) : 0;
        const subEntity = d.sublabelEntity ? entities[d.sublabelEntity] : undefined;
        const subUnit = (subEntity?.attributes?.unit_of_measurement as string | undefined) ?? '';
        const subVal = subEntity ? formatMetric(numericState(subEntity), subUnit) : d.sublabel;
        const sub = subVal ? `${subVal}${d.sublabelSuffix ? ` ${d.sublabelSuffix}` : ''}` : undefined;
        const ringColor = d.informational ? '#3b82f6' : color(pct);
        return (
          <div className="noc-donut" key={d.id}>
            <div className="noc-ring" style={{ background: `conic-gradient(${ringColor} 0% ${pct}%, rgba(255,255,255,0.07) ${pct}% 100%)` }}>
              <div className="noc-ring-v">{pct}<small>%</small></div>
            </div>
            <div className="noc-donut-l">{d.label}</div>
            {sub && <div className="noc-donut-s">{sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

function PowerPanel({ panel, entities }: { panel: NocPanel; entities: HassEntities }) {
  const units = panel.units ?? [];
  return (
    <>
      {units.map((u: NocPowerUnit) => {
        const battery = u.batteryEntity ? numericState(entities[u.batteryEntity]) : undefined;
        const runtime = u.runtimeEntity ? numericState(entities[u.runtimeEntity]) : undefined;
        const load = u.loadEntity ? numericState(entities[u.loadEntity]) : undefined;
        const draw = u.drawEntity ? numericState(entities[u.drawEntity]) : undefined;
        const status = u.statusEntity ? entities[u.statusEntity]?.state : undefined;
        const online = status ? /online|ol|line/i.test(status) : true;
        const sub = [load !== undefined ? `${Math.round(load)}% load` : '', draw !== undefined ? `${Math.round(draw)} W` : '']
          .filter(Boolean)
          .join(' · ');
        return (
          <div className="noc-ups-unit" key={u.id}>
            <div className="noc-ups-top">
              <span className="noc-ups-name">{u.name}</span>
              <span className="noc-ups-status" style={{ color: online ? '#34d399' : '#f87171' }}>{online ? 'On line' : status}</span>
            </div>
            <div className="noc-ups-row">
              <div className="noc-batt"><i style={{ width: `${battery ?? 0}%` }} /></div>
              <div>
                <div className="noc-ups-big">{runtime !== undefined ? Math.round(runtime) : '—'}<small> min</small></div>
                {sub && <div className="noc-ups-k">{sub}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function NocPanels({ noc, entities, getHistory }: Props) {
  const panels = effectivePanels(noc);
  if (!panels.length) return null;

  return (
    <div className="noc-panels">
      {panels.map((panel) => (
        <div
          className="noc-panel"
          key={panel.id}
          style={{ gridColumn: (panel.span ?? 1) >= 1.5 ? 'span 2' : 'span 1' }}
        >
          <h3 className="noc-panel-h"><span className="noc-panel-dot" /> {panel.title ?? defaultTitle(panel.type)}</h3>
          {panel.subtitle && <div className="noc-panel-sub">{panel.subtitle}</div>}
          {panel.type === 'wan' && <WanPanel panel={panel} entities={entities} getHistory={getHistory} />}
          {panel.type === 'storage' && <StoragePanel panel={panel} entities={entities} />}
          {panel.type === 'power' && <PowerPanel panel={panel} entities={entities} />}
        </div>
      ))}
    </div>
  );
}
