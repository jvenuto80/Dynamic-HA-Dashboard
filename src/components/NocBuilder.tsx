import { useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import type { DashView, NocConfig, NocNode, NocApiStat, NocPanel, NocPanelType, NocPill, NocPort, NocPortPoe, NocPortRole, NocPortSpeed, NocValueFormat } from '../types';
import { EntityPicker, type LayoutActions } from './DashboardView';
import { entityName, isUp, nodeSlug, runningContainers, suggestNocNodes, suggestPorts } from '../lib/noc';
import { deriveDefaultPanels, defaultTitle, effectivePanels } from './NocPanels';
import { NocNodeTile } from './NocNodeTile';

interface Props {
  view: DashView;
  entities: HassEntities;
  layout: LayoutActions;
  getHistory?: (entityId: string, hours?: number) => Promise<number[]>;
}

const ACCENTS = ['#3b82f6', '#06b6d4', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

const VALUE_FORMATS: { id: NocValueFormat; label: string }[] = [
  { id: 'auto', label: 'Auto (smart)' },
  { id: 'elapsed', label: 'Elapsed / uptime' },
  { id: 'datetime', label: 'Date + time' },
  { id: 'date', label: 'Date only' },
  { id: 'time', label: 'Time only' },
  { id: 'duration', label: 'Duration' },
  { id: 'raw', label: 'Raw value' },
];

const PORT_SPEEDS: { id: NocPortSpeed; label: string }[] = [
  { id: 'gbe', label: 'GbE (1G)' },
  { id: 'fe', label: 'FE (100M)' },
  { id: '2.5gbe', label: '2.5 GbE' },
  { id: '5gbe', label: '5 GbE' },
  { id: '10gbe', label: '10 GbE' },
  { id: 'sfp', label: 'SFP' },
  { id: 'sfp+', label: 'SFP+' },
  { id: 'disconnected', label: 'Disconnected' },
  { id: 'disabled', label: 'Disabled' },
];

const PORT_POE: { id: NocPortPoe | ''; label: string }[] = [
  { id: '', label: 'No PoE badge' },
  { id: 'poe', label: 'PoE' },
  { id: 'poe+', label: 'PoE+' },
  { id: 'poe++', label: 'PoE++' },
];

const PORT_ROLES: { id: NocPortRole | ''; label: string }[] = [
  { id: '', label: 'Standard' },
  { id: 'uplink', label: 'Uplink' },
  { id: 'aggregate', label: 'Aggregate' },
  { id: 'mirror', label: 'Mirror' },
];

type PickerTarget =
  | { kind: 'metric'; nodeId: string }
  | { kind: 'temp'; nodeId: string }
  | { kind: 'uptime'; nodeId: string }
  | { kind: 'status'; nodeId: string }
  | { kind: 'docker'; nodeId: string }
  | { kind: 'pill'; nodeId: string }
  | { kind: 'portEntity'; nodeId: string; portId: string; field: 'speedEntity' | 'linkEntity' | 'poeEntity' | 'poeCycleEntity' }
  | { kind: 'wan' }
  | { kind: 'clients' }
  | { kind: 'wanStat'; panelId: string }
  | { kind: 'wanSeries'; panelId: string }
  | { kind: 'donut'; panelId: string }
  | { kind: 'donutSub'; panelId: string; donutId: string }
  | { kind: 'powerField'; panelId: string; unitId: string; field: 'batteryEntity' | 'runtimeEntity' | 'loadEntity' | 'drawEntity' | 'statusEntity' };

export function NocBuilder({ view, entities, layout, getHistory }: Props) {
  const noc: NocConfig = view.noc ?? { nodes: [] };
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  const patchNoc = (patch: Partial<NocConfig>) =>
    layout.setNoc(view.id, { ...noc, ...patch });

  const autoDetect = () => {
    const { nodes, wanLatency } = suggestNocNodes(entities);
    if (!nodes.length && !wanLatency.length) return;
    layout.setNoc(view.id, {
      nodes: [...noc.nodes, ...nodes],
      wanLatency: noc.wanLatency?.length ? noc.wanLatency : wanLatency.length ? wanLatency : undefined,
      clientsEntity: noc.clientsEntity,
    });
  };

  const num = (s: string): number | undefined => {
    if (s.trim() === '') return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };

  // ── Footer pills (per node) ──
  const nodePills = (nodeId: string): NocPill[] => noc.nodes.find((n) => n.id === nodeId)?.pills ?? [];
  const setPills = (nodeId: string, pills: NocPill[]) =>
    layout.updateNocNode(view.id, nodeId, { pills: pills.length ? pills : undefined });
  const addPill = (nodeId: string, entityId: string) =>
    setPills(nodeId, [...nodePills(nodeId), { id: `pill-${Date.now().toString(36)}`, entity_id: entityId, icon: 'mdi-information-outline' }]);
  const updatePill = (nodeId: string, pillId: string, patch: Partial<NocPill>) =>
    setPills(nodeId, nodePills(nodeId).map((p) => (p.id === pillId ? { ...p, ...patch } : p)));
  const removePill = (nodeId: string, pillId: string) =>
    setPills(nodeId, nodePills(nodeId).filter((p) => p.id !== pillId));

  // ── Switch ports (per node) ──
  const nodePorts = (nodeId: string): NocPort[] => noc.nodes.find((n) => n.id === nodeId)?.ports ?? [];
  const setPorts = (nodeId: string, ports: NocPort[]) =>
    layout.updateNocNode(view.id, nodeId, { ports: ports.length ? ports : undefined });
  const addPort = (nodeId: string) => {
    const ports = nodePorts(nodeId);
    setPorts(nodeId, [
      ...ports,
      { id: `port-${Date.now().toString(36)}-${ports.length}`, num: String(ports.length + 1), speed: 'gbe' },
    ]);
  };
  const addPorts = (nodeId: string, count: number) => {
    const ports = nodePorts(nodeId);
    const next: NocPort[] = [];
    for (let i = 0; i < count; i++) {
      next.push({ id: `port-${Date.now().toString(36)}-${ports.length + i}`, num: String(ports.length + i + 1), speed: 'gbe' });
    }
    setPorts(nodeId, [...ports, ...next]);
  };
  const updatePort = (nodeId: string, portId: string, patch: Partial<NocPort>) =>
    setPorts(nodeId, nodePorts(nodeId).map((p) => (p.id === portId ? { ...p, ...patch } : p)));
  const removePort = (nodeId: string, portId: string) =>
    setPorts(nodeId, nodePorts(nodeId).filter((p) => p.id !== portId));
  const movePort = (nodeId: string, idx: number, to: number) => {
    const arr = [...nodePorts(nodeId)];
    if (to < 0 || to >= arr.length) return;
    const [p] = arr.splice(idx, 1);
    arr.splice(to, 0, p);
    setPorts(nodeId, arr);
  };
  // Auto-detect: enumerate live per-port entities (UniFi PoE switches + any
  // port sensors) for this node and merge in any port numbers not already set.
  const autoDetectPorts = (nodeId: string) => {
    const node = noc.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const found = suggestPorts(entities, nodeSlug(node.name));
    if (!found.length) {
      window.alert(
        `No port entities found for “${node.name}”.\n\nThis looks for PoE switches and per-port sensors named like “…port 5 PoE”. Add ports manually, or rename the device to match your switch's entities.`,
      );
      return;
    }
    const existing = nodePorts(nodeId);
    const have = new Set(existing.map((p) => p.num));
    const additions = found
      .filter((p) => !have.has(p.num))
      .map((p, i) => ({ ...p, id: `port-${Date.now().toString(36)}-${existing.length + i}` }));
    if (!additions.length) {
      window.alert(`All ${found.length} detected port(s) are already added.`);
      return;
    }
    setPorts(nodeId, [...existing, ...additions]);
  };

  // ── Bottom-row panels ──
  // Materialize derived panels into explicit config the first time the user
  // edits, so what they see becomes fully editable.
  const panels: NocPanel[] = noc.panels ?? [];
  const setPanels = (next: NocPanel[]) => patchNoc({ panels: next });
  const ensurePanels = (): NocPanel[] => (noc.panels && noc.panels.length ? noc.panels : effectivePanels(noc));
  const updatePanel = (panelId: string, patch: Partial<NocPanel>) =>
    setPanels(ensurePanels().map((p) => (p.id === panelId ? { ...p, ...patch } : p)));
  const addPanel = (type: NocPanelType) => {
    const id = `panel-${type}-${Date.now().toString(36)}`;
    const base: NocPanel = { id, type, title: defaultTitle(type), span: type === 'wan' ? 1.5 : 1 };
    if (type === 'wan') Object.assign(base, { stats: [], series: [] });
    if (type === 'storage') base.donuts = [];
    if (type === 'power') base.units = [];
    setPanels([...ensurePanels(), base]);
  };
  const removePanel = (panelId: string) => setPanels(ensurePanels().filter((p) => p.id !== panelId));
  const movePanel = (idx: number, to: number) => {
    const arr = [...ensurePanels()];
    if (to < 0 || to >= arr.length) return;
    const [p] = arr.splice(idx, 1);
    arr.splice(to, 0, p);
    setPanels(arr);
  };
  const autoPopulatePanels = () => setPanels(deriveDefaultPanels(noc));
  const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

  // API stats (external HTTP source, e.g. Speedtest-Tracker) on a WAN panel.
  const updateApiStat = (panelId: string, statId: string, patch: Partial<NocApiStat>) => {
    const p = ensurePanels().find((x) => x.id === panelId);
    updatePanel(panelId, { apiStats: (p?.apiStats ?? []).map((a) => (a.id === statId ? { ...a, ...patch } : a)) });
  };
  const addApiStat = (panelId: string, preset?: Partial<NocApiStat>) => {
    const p = ensurePanels().find((x) => x.id === panelId);
    const stat: NocApiStat = {
      id: uid('api'),
      label: 'Download',
      url: '',
      path: 'data.download',
      unit: 'Mbps',
      multiplier: 1,
      pollSeconds: 60,
      ...preset,
    };
    updatePanel(panelId, { apiStats: [...(p?.apiStats ?? []), stat] });
  };
  const addSpeedtestPreset = (panelId: string) => {
    const p = ensurePanels().find((x) => x.id === panelId);
    const existing = p?.apiStats ?? [];
    // Speedtest-Tracker (linuxserver) /api/v1/results/latest stores download/
    // upload in bytes/s; Mbps = bytes/s * 8 / 1e6. URL/token entered by the user.
    const dl: NocApiStat = { id: uid('api'), label: 'Download', url: '', token: '', path: 'data.download', unit: 'Mbps', multiplier: 8e-6, pollSeconds: 300, color: '#10b981' };
    const ul: NocApiStat = { id: uid('api'), label: 'Upload', url: '', token: '', path: 'data.upload', unit: 'Mbps', multiplier: 8e-6, pollSeconds: 300, color: '#06b6d4' };
    updatePanel(panelId, { apiStats: [...existing, dl, ul] });
  };
  const removeApiStat = (panelId: string, statId: string) => {
    const p = ensurePanels().find((x) => x.id === panelId);
    updatePanel(panelId, { apiStats: (p?.apiStats ?? []).filter((a) => a.id !== statId) });
  };

  // Resolve the picker config (domains + handler) for the active picker target.
  const pickerProps = () => {
    if (!picker) return null;
    if (picker.kind === 'metric') {
      return {
        title: 'Add a metric sensor…',
        domainFilter: ['sensor'],
        existing: new Set<string>(),
        keepOpen: false,
        onPick: (id: string) => {
          layout.addNocMetric(view.id, picker.nodeId, id);
          setPicker(null);
        },
      };
    }
    if (picker.kind === 'temp' || picker.kind === 'uptime') {
      const field = picker.kind === 'temp' ? 'tempEntity' : 'uptimeEntity';
      return {
        title: picker.kind === 'temp' ? 'Pick a temperature sensor…' : 'Pick an uptime/info sensor…',
        domainFilter: ['sensor'],
        existing: new Set<string>(),
        keepOpen: false,
        onPick: (id: string) => {
          layout.updateNocNode(view.id, picker.nodeId, { [field]: id } as Partial<NocNode>);
          setPicker(null);
        },
      };
    }
    if (picker.kind === 'status') {
      return {
        title: 'Pick a reachability binary_sensor…',
        domainFilter: ['binary_sensor', 'sensor', 'switch'],
        existing: new Set<string>(),
        keepOpen: false,
        onPick: (id: string) => {
          layout.updateNocNode(view.id, picker.nodeId, { statusEntity: id });
          setPicker(null);
        },
      };
    }
    if (picker.kind === 'docker') {
      const node = noc.nodes.find((n) => n.id === picker.nodeId);
      const current = node?.dockerWatch ?? [];
      return {
        title: 'Add containers to monitor…',
        domainFilter: ['binary_sensor', 'switch'],
        existing: new Set(current),
        keepOpen: true,
        onPick: (id: string) => {
          layout.setNocDockerWatch(view.id, picker.nodeId, [...current, id]);
        },
      };
    }
    if (picker.kind === 'pill') {
      return {
        title: 'Pick a sensor for this pill…',
        domainFilter: ['sensor', 'binary_sensor'],
        existing: new Set(nodePills(picker.nodeId).map((p) => p.entity_id)),
        keepOpen: true,
        onPick: (id: string) => addPill(picker.nodeId, id),
      };
    }
    if (picker.kind === 'portEntity') {
      const titles: Record<string, string> = {
        speedEntity: 'Pick a link-speed sensor (Mbps)…',
        linkEntity: 'Pick a connectivity entity…',
        poeEntity: 'Pick the PoE switch entity…',
        poeCycleEntity: 'Pick the port power-cycle button…',
      };
      const domains: Record<string, string[]> = {
        speedEntity: ['sensor'],
        linkEntity: ['binary_sensor', 'sensor', 'device_tracker', 'switch'],
        poeEntity: ['switch'],
        poeCycleEntity: ['button'],
      };
      return {
        title: titles[picker.field],
        domainFilter: domains[picker.field],
        existing: new Set<string>(),
        keepOpen: false,
        onPick: (id: string) => {
          updatePort(picker.nodeId, picker.portId, { [picker.field]: id } as Partial<NocPort>);
          setPicker(null);
        },
      };
    }
    if (picker.kind === 'wan') {
      const current = noc.wanLatency ?? [];
      return {
        title: 'Add a WAN latency sensor…',
        domainFilter: ['sensor'],
        existing: new Set(current),
        keepOpen: true,
        onPick: (id: string) => patchNoc({ wanLatency: [...current, id] }),
      };
    }
    if (picker.kind === 'wanStat') {
      const panel = ensurePanels().find((p) => p.id === picker.panelId);
      return {
        title: 'Add a stat sensor…',
        domainFilter: ['sensor'],
        existing: new Set((panel?.stats ?? []).map((s) => s.entity_id)),
        keepOpen: true,
        onPick: (id: string) => {
          const pp = ensurePanels().find((p) => p.id === picker.panelId);
          const stats = [...(pp?.stats ?? []), { id: uid('stat'), entity_id: id, label: entityName(entities, id) }];
          updatePanel(picker.panelId, { stats });
        },
      };
    }
    if (picker.kind === 'wanSeries') {
      const panel = ensurePanels().find((p) => p.id === picker.panelId);
      return {
        title: 'Add a chart line sensor…',
        domainFilter: ['sensor'],
        existing: new Set(panel?.series ?? []),
        keepOpen: true,
        onPick: (id: string) => {
          const pp = ensurePanels().find((p) => p.id === picker.panelId);
          updatePanel(picker.panelId, { series: [...(pp?.series ?? []), id] });
        },
      };
    }
    if (picker.kind === 'donut') {
      const panel = ensurePanels().find((p) => p.id === picker.panelId);
      return {
        title: 'Add a capacity sensor…',
        domainFilter: ['sensor'],
        existing: new Set((panel?.donuts ?? []).map((d) => d.entity_id)),
        keepOpen: true,
        onPick: (id: string) => {
          const pp = ensurePanels().find((p) => p.id === picker.panelId);
          const donuts = [...(pp?.donuts ?? []), { id: uid('donut'), entity_id: id, label: entityName(entities, id), max: 100 }];
          updatePanel(picker.panelId, { donuts });
        },
      };
    }
    if (picker.kind === 'donutSub') {
      return {
        title: 'Pick a sublabel sensor (free space, days…)…',
        domainFilter: ['sensor'],
        existing: new Set<string>(),
        keepOpen: false,
        onPick: (id: string) => {
          const pp = ensurePanels().find((p) => p.id === picker.panelId);
          const donuts = (pp?.donuts ?? []).map((d) => (d.id === picker.donutId ? { ...d, sublabelEntity: id } : d));
          updatePanel(picker.panelId, { donuts });
          setPicker(null);
        },
      };
    }
    if (picker.kind === 'powerField') {
      return {
        title: 'Pick a sensor…',
        domainFilter: ['sensor', 'binary_sensor'],
        existing: new Set<string>(),
        keepOpen: false,
        onPick: (id: string) => {
          const pp = ensurePanels().find((p) => p.id === picker.panelId);
          const units = (pp?.units ?? []).map((u) => (u.id === picker.unitId ? { ...u, [picker.field]: id } : u));
          updatePanel(picker.panelId, { units });
          setPicker(null);
        },
      };
    }
    // clients
    return {
      title: 'Pick a clients-connected sensor…',
      domainFilter: ['sensor'],
      existing: new Set<string>(),
      keepOpen: false,
      onPick: (id: string) => {
        patchNoc({ clientsEntity: id });
        setPicker(null);
      },
    };
  };
  const pp = pickerProps();

  return (
    <div className="noc-builder">
      <div className="media-edit-intro">
        <span className="mdi mdi-information-outline" /> Build your NOC: add devices, assign each
        a few sensors, set warning thresholds, and choose which containers to monitor.
      </div>

      {/* Header widgets visible on THIS page */}
      <div className="noc-build-card noc-build-header-card">
        <h3 className="noc-build-h3"><span className="mdi mdi-view-headline" /> Page header widgets</h3>
        <div className="noc-header-toggles">
          {([
            ['hideGreeting', 'Greeting', 'mdi-hand-wave'],
            ['hideWeather', 'Weather', 'mdi-weather-partly-cloudy'],
            ['hidePeople', 'People', 'mdi-account-group'],
          ] as const).map(([key, label, icon]) => {
            const shown = !view[key];
            return (
              <button
                key={key}
                type="button"
                className={`noc-header-toggle ${shown ? 'on' : ''}`}
                onClick={() => layout.setHeaderVisibility(view.id, { [key]: !view[key] })}
              >
                <span className={`mdi ${icon}`} />
                <span className="noc-header-toggle-label">{label}</span>
                <span className={`mdi ${shown ? 'mdi-eye' : 'mdi-eye-off'} noc-header-toggle-eye`} />
              </button>
            );
          })}
        </div>
        <div className="noc-build-hint">Hidden widgets are removed from the top of this page only.</div>
      </div>

      <button className="noc-autodetect" onClick={autoDetect}>
        <span className="mdi mdi-auto-fix" /> Auto-detect devices from my sensors
        <span className="noc-autodetect-sub">Scans your entities and suggests devices &amp; metrics — fully editable after</span>
      </button>

      {/* Banner data sources */}
      <div className="noc-build-card">
        <h3 className="noc-build-h3"><span className="mdi mdi-gauge" /> Banner data <span className="noc-build-opt">optional</span></h3>
        <div className="noc-build-row">
          <span className="noc-build-label">WAN latency</span>
          <div className="noc-chip-list">
            {(noc.wanLatency ?? []).map((id) => (
              <span className="noc-edit-chip" key={id}>
                {entityName(entities, id)}
                <button onClick={() => patchNoc({ wanLatency: (noc.wanLatency ?? []).filter((x) => x !== id) })}>
                  <span className="mdi mdi-close" />
                </button>
              </span>
            ))}
            <button className="noc-add-mini" onClick={() => setPicker({ kind: 'wan' })}>
              <span className="mdi mdi-plus" /> Add
            </button>
          </div>
        </div>
        <div className="noc-build-row">
          <span className="noc-build-label">Clients connected</span>
          <div className="noc-chip-list">
            {noc.clientsEntity ? (
              <span className="noc-edit-chip">
                {entityName(entities, noc.clientsEntity)}
                <button onClick={() => patchNoc({ clientsEntity: undefined })}>
                  <span className="mdi mdi-close" />
                </button>
              </span>
            ) : (
              <button className="noc-add-mini" onClick={() => setPicker({ kind: 'clients' })}>
                <span className="mdi mdi-plus" /> Pick sensor
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Nodes */}
      {noc.nodes.map((node, idx) => (
        <div className="noc-build-card noc-build-node-card" key={node.id} style={{ ['--accent' as string]: node.accent ?? '#3b82f6' }}>
          <div className="noc-build-node-form">
          <div className="noc-build-node-head">
            <input
              className="noc-build-icon"
              value={node.icon ?? ''}
              placeholder="mdi-server or 🖥️"
              spellCheck={false}
              onChange={(e) => layout.updateNocNode(view.id, node.id, { icon: e.target.value })}
            />
            <div className="noc-build-names">
              <input
                className="noc-build-name"
                value={node.name}
                placeholder="Device name"
                onChange={(e) => layout.updateNocNode(view.id, node.id, { name: e.target.value })}
              />
              <input
                className="noc-build-sub"
                value={node.sub ?? ''}
                placeholder="Subtitle (e.g. UniFi Gateway)"
                onChange={(e) => layout.updateNocNode(view.id, node.id, { sub: e.target.value })}
              />
            </div>
            <div className="noc-build-node-tools">
              <button className="edit-icon-btn" title="Move up" disabled={idx === 0} onClick={() => layout.moveNocNode(view.id, idx, idx - 1)}>
                <span className="mdi mdi-chevron-up" />
              </button>
              <button className="edit-icon-btn" title="Move down" disabled={idx === noc.nodes.length - 1} onClick={() => layout.moveNocNode(view.id, idx, idx + 1)}>
                <span className="mdi mdi-chevron-down" />
              </button>
              <button className="edit-icon-btn danger" title="Remove device" onClick={() => layout.removeNocNode(view.id, node.id)}>
                <span className="mdi mdi-trash-can-outline" />
              </button>
            </div>
          </div>

          <div className="noc-build-accents">
            {ACCENTS.map((c) => (
              <button
                key={c}
                className={`noc-accent-dot ${node.accent === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => layout.updateNocNode(view.id, node.id, { accent: c })}
              />
            ))}
          </div>

          {/* Metrics */}
          <div className="noc-build-sub-h">Metrics</div>
          {node.metrics.map((m) => (
            <div className="noc-build-metric" key={m.id}>
              <div className="noc-build-metric-top">
                <input
                  className="noc-build-metric-label"
                  value={m.label}
                  placeholder={entityName(entities, m.entity_id)}
                  onChange={(e) => layout.updateNocMetric(view.id, node.id, m.id, { label: e.target.value })}
                />
                <span className="noc-build-metric-id">{m.entity_id}</span>
                <button
                  className={`noc-mini-toggle ${m.primary ? 'on' : ''}`}
                  title="Show on the compact tile"
                  onClick={() => layout.updateNocMetric(view.id, node.id, m.id, { primary: !m.primary })}
                >
                  <span className="mdi mdi-star" /> Tile
                </button>
                <button
                  className={`noc-mini-toggle ${(node.sparkMetricId ?? (node.metrics.filter((x) => x.primary)[0] ?? node.metrics[0])?.id) === m.id ? 'on' : ''}`}
                  title="Track this metric in the tile's mini line graph"
                  onClick={() => layout.updateNocNode(view.id, node.id, { sparkMetricId: m.id })}
                >
                  <span className="mdi mdi-chart-line" /> Graph
                </button>
                <button className="edit-icon-btn danger" title="Remove metric" onClick={() => layout.removeNocMetric(view.id, node.id, m.id)}>
                  <span className="mdi mdi-close" />
                </button>
              </div>
              <div className="noc-build-thresholds">
                <label>Unit<input value={m.unit ?? ''} placeholder="auto" onChange={(e) => layout.updateNocMetric(view.id, node.id, m.id, { unit: e.target.value || undefined })} /></label>
                <label>Max<input type="number" value={m.max ?? ''} placeholder="100" onChange={(e) => layout.updateNocMetric(view.id, node.id, m.id, { max: num(e.target.value) })} /></label>
                <label>Warn<input type="number" value={m.warn ?? ''} placeholder="—" onChange={(e) => layout.updateNocMetric(view.id, node.id, m.id, { warn: num(e.target.value) })} /></label>
                <label>Crit<input type="number" value={m.crit ?? ''} placeholder="—" onChange={(e) => layout.updateNocMetric(view.id, node.id, m.id, { crit: num(e.target.value) })} /></label>
                <button
                  className={`noc-mini-toggle ${m.higherIsWorse === false ? 'on' : ''}`}
                  title="Lower value is worse (e.g. battery %, runtime)"
                  onClick={() => layout.updateNocMetric(view.id, node.id, m.id, { higherIsWorse: m.higherIsWorse === false ? true : false })}
                >
                  <span className="mdi mdi-arrow-down-bold" /> Lower=bad
                </button>
                <button
                  className={`noc-mini-toggle ${m.informational ? 'on' : ''}`}
                  title="Informational only — show the gauge but never alert (e.g. an NVR's continuous-recording disk)"
                  onClick={() => layout.updateNocMetric(view.id, node.id, m.id, { informational: !m.informational })}
                >
                  <span className="mdi mdi-information-outline" /> Info only
                </button>
              </div>
            </div>
          ))}
          <button className="noc-add-mini" onClick={() => setPicker({ kind: 'metric', nodeId: node.id })}>
            <span className="mdi mdi-plus" /> Add metric
          </button>

          {/* Pills + status */}
          <div className="noc-build-sub-h">Pills &amp; reachability</div>
          <div className="noc-build-entity-row">
            {(['temp', 'uptime', 'status'] as const).map((k) => {
              const id = k === 'temp' ? node.tempEntity : k === 'uptime' ? node.uptimeEntity : node.statusEntity;
              const labels = { temp: 'Temperature', uptime: 'Uptime/info', status: 'Reachability' };
              const clear = () =>
                layout.updateNocNode(view.id, node.id, {
                  [k === 'temp' ? 'tempEntity' : k === 'uptime' ? 'uptimeEntity' : 'statusEntity']: undefined,
                } as Partial<NocNode>);
              return (
                <div className="noc-build-pill-pick" key={k}>
                  <span className="noc-build-label">{labels[k]}</span>
                  {id ? (
                    <span className="noc-edit-chip">
                      {entityName(entities, id)}
                      <button onClick={clear}><span className="mdi mdi-close" /></button>
                    </span>
                  ) : (
                    <button className="noc-add-mini" onClick={() => setPicker({ kind: k, nodeId: node.id })}>
                      <span className="mdi mdi-plus" /> Pick
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {node.uptimeEntity && (
            <div className="noc-build-row noc-build-fmt-row">
              <span className="noc-build-label" title="How the uptime/info value is shown. Auto turns a boot timestamp into elapsed uptime.">
                <span className="mdi mdi-clock-outline" /> Uptime format
              </span>
              <select
                className="noc-build-fmt-select"
                value={node.uptimeFormat ?? 'auto'}
                onChange={(e) =>
                  layout.updateNocNode(view.id, node.id, {
                    uptimeFormat: e.target.value === 'auto' ? undefined : (e.target.value as NocValueFormat),
                  })
                }
              >
                {VALUE_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          )}

          {node.statusEntity && (
            <div className="noc-build-status-kw">
              <div className="noc-build-row">
                <span className="noc-build-label" title="Comma-separated words. If the status text contains one, the node alerts.">
                  <span className="mdi mdi-alert-circle-outline" /> Critical words
                </span>
                <input
                  className="noc-build-pill-label"
                  value={(node.statusCrit ?? []).join(', ')}
                  placeholder="replacement, alarm, on battery, low battery, overload"
                  onChange={(e) =>
                    layout.updateNocNode(view.id, node.id, {
                      statusCrit: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="noc-build-row">
                <span className="noc-build-label">
                  <span className="mdi mdi-alert-outline" /> Warning words
                </span>
                <input
                  className="noc-build-pill-label"
                  value={(node.statusWarn ?? []).join(', ')}
                  placeholder="bypass, boost, trim, calibrating"
                  onChange={(e) =>
                    layout.updateNocNode(view.id, node.id, {
                      statusWarn: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="noc-build-hint" style={{ margin: 0 }}>
                Matched against “{entityName(entities, node.statusEntity)}” (currently:
                {' '}{entities[node.statusEntity]?.state ?? '—'}). Great for UPS NUT flags like “Replace Battery”.
              </div>
            </div>
          )}

          {/* Footer pills */}
          <div className="noc-build-sub-h">
            <span className="mdi mdi-tag-multiple-outline" /> At-a-glance pills
            <span className="noc-build-opt">ports, cams, docker count, draw…</span>
          </div>
          {(node.pills ?? []).map((p) => (
            <div className="noc-build-pill-edit" key={p.id}>
              <input
                className="noc-build-pill-icon"
                value={p.icon ?? ''}
                placeholder="mdi-…/emoji"
                spellCheck={false}
                onChange={(e) => updatePill(node.id, p.id, { icon: e.target.value })}
              />
              <span className="noc-build-pill-ent">{entityName(entities, p.entity_id)}</span>
              <input
                className="noc-build-pill-label"
                value={p.label ?? ''}
                placeholder="label (e.g. ports)"
                onChange={(e) => updatePill(node.id, p.id, { label: e.target.value })}
              />
              <input
                className="noc-build-pill-unit"
                value={p.unit ?? ''}
                placeholder="unit"
                onChange={(e) => updatePill(node.id, p.id, { unit: e.target.value || undefined })}
              />
              <button
                className={`noc-mini-toggle ${p.prefix ? 'on' : ''}`}
                title="Show label before the value"
                onClick={() => updatePill(node.id, p.id, { prefix: !p.prefix })}
              >
                pre
              </button>
              <select
                className="noc-build-fmt-select"
                title="Date/duration format (Auto detects timestamps & uptime counters)"
                value={p.format ?? 'auto'}
                onChange={(e) =>
                  updatePill(node.id, p.id, {
                    format: e.target.value === 'auto' ? undefined : (e.target.value as NocValueFormat),
                  })
                }
              >
                {VALUE_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <button className="edit-icon-btn danger" title="Remove pill" onClick={() => removePill(node.id, p.id)}>
                <span className="mdi mdi-close" />
              </button>
            </div>
          ))}
          <button className="noc-add-mini" onClick={() => setPicker({ kind: 'pill', nodeId: node.id })}>
            <span className="mdi mdi-plus" /> Add pill
          </button>

          {/* Docker */}
          <div className="noc-build-sub-h">
            <span className="mdi mdi-docker" /> Monitored containers
            <span className="noc-build-opt">alert if any go down</span>
          </div>
          <div className="noc-chip-list">
            {(node.dockerWatch ?? []).map((id) => {
              const up = isUp(entities[id]);
              return (
                <span className={`noc-edit-chip ${up ? '' : 'is-down'}`} key={id}>
                  <span className={`noc-led noc-led-${up ? 'ok' : 'crit'}`} />
                  {entityName(entities, id)}
                  <button onClick={() => layout.setNocDockerWatch(view.id, node.id, (node.dockerWatch ?? []).filter((x) => x !== id))}>
                    <span className="mdi mdi-close" />
                  </button>
                </span>
              );
            })}
            <button className="noc-add-mini" onClick={() => setPicker({ kind: 'docker', nodeId: node.id })}>
              <span className="mdi mdi-plus" /> Add containers
            </button>
            <button
              className="noc-add-mini"
              title={`Add every running switch/binary_sensor matching “${nodeSlug(node.name)}”`}
              onClick={() => {
                const found = runningContainers(entities, nodeSlug(node.name));
                const merged = [...new Set([...(node.dockerWatch ?? []), ...found])];
                layout.setNocDockerWatch(view.id, node.id, merged);
              }}
            >
              <span className="mdi mdi-auto-fix" /> Add all running
            </button>
          </div>
          {(node.dockerWatch?.length ?? 0) > 0 && (
            <button
              className="noc-clear-link"
              onClick={() => layout.setNocDockerWatch(view.id, node.id, [])}
            >
              Clear all
            </button>
          )}

          {/* Switch ports */}
          <div className="noc-build-sub-h">
            <span className="mdi mdi-ethernet" /> Switch ports
            <span className="noc-build-opt">color-coded strip + PoE power-cycle</span>
          </div>
          {(node.ports ?? []).map((p, pi) => (
            <div className="noc-build-port-edit" key={p.id}>
              <span className={`noc-port-swatch noc-port-${p.speed ?? 'gbe'}`} />
              <input
                className="noc-build-port-num"
                value={p.num}
                placeholder="#"
                onChange={(e) => updatePort(node.id, p.id, { num: e.target.value })}
              />
              <input
                className="noc-build-port-client"
                value={p.client ?? ''}
                placeholder="what's connected (e.g. AP — Office)"
                onChange={(e) => updatePort(node.id, p.id, { client: e.target.value || undefined })}
              />
              <select
                className="noc-build-port-sel"
                title="Link speed / state (used when no live sensor is bound)"
                value={p.speed ?? 'gbe'}
                onChange={(e) => updatePort(node.id, p.id, { speed: e.target.value as NocPortSpeed })}
              >
                {PORT_SPEEDS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select
                className="noc-build-port-sel"
                title="PoE badge"
                value={p.poe ?? ''}
                onChange={(e) => updatePort(node.id, p.id, { poe: (e.target.value || undefined) as NocPortPoe | undefined })}
              >
                {PORT_POE.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select
                className="noc-build-port-sel"
                title="Special role"
                value={p.role ?? ''}
                onChange={(e) => updatePort(node.id, p.id, { role: (e.target.value || undefined) as NocPortRole | undefined })}
              >
                {PORT_ROLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select
                className="noc-build-port-sel"
                title="Link this port to another device — its flyout gets a jump to that node, and back"
                value={p.linkNodeId ?? ''}
                onChange={(e) => updatePort(node.id, p.id, { linkNodeId: e.target.value || undefined })}
              >
                <option value="">No link</option>
                {noc.nodes.filter((n) => n.id !== node.id).map((n) => (
                  <option key={n.id} value={n.id}>→ {n.name}</option>
                ))}
              </select>
              <button
                className={`noc-port-bind ${p.speedEntity ? 'on' : ''}`}
                title={p.speedEntity ? `Live speed: ${entityName(entities, p.speedEntity)} (click to change)` : 'Bind a live Mbps sensor'}
                onClick={() => setPicker({ kind: 'portEntity', nodeId: node.id, portId: p.id, field: 'speedEntity' })}
              >
                <span className="mdi mdi-speedometer" />
              </button>
              <button
                className={`noc-port-bind ${p.linkEntity ? 'on' : ''}`}
                title={p.linkEntity ? `Link: ${entityName(entities, p.linkEntity)} (click to change)` : 'Bind a connectivity entity'}
                onClick={() => setPicker({ kind: 'portEntity', nodeId: node.id, portId: p.id, field: 'linkEntity' })}
              >
                <span className="mdi mdi-lan-connect" />
              </button>
              <button
                className={`noc-port-bind ${p.poeEntity ? 'on' : ''}`}
                title={p.poeEntity ? `PoE switch: ${entityName(entities, p.poeEntity)} (click to change)` : 'Bind the PoE switch entity (on/off toggle)'}
                onClick={() => setPicker({ kind: 'portEntity', nodeId: node.id, portId: p.id, field: 'poeEntity' })}
              >
                <span className="mdi mdi-flash" />
              </button>
              <button
                className={`noc-port-bind ${p.poeCycleEntity ? 'on' : ''}`}
                title={p.poeCycleEntity ? `Power-cycle: ${entityName(entities, p.poeCycleEntity)} (click to change)` : 'Bind the port power-cycle button'}
                onClick={() => setPicker({ kind: 'portEntity', nodeId: node.id, portId: p.id, field: 'poeCycleEntity' })}
              >
                <span className="mdi mdi-restart" />
              </button>
              <button className="edit-icon-btn" title="Move left" disabled={pi === 0} onClick={() => movePort(node.id, pi, pi - 1)}>
                <span className="mdi mdi-chevron-left" />
              </button>
              <button className="edit-icon-btn" title="Move right" disabled={pi === (node.ports?.length ?? 0) - 1} onClick={() => movePort(node.id, pi, pi + 1)}>
                <span className="mdi mdi-chevron-right" />
              </button>
              <button className="edit-icon-btn danger" title="Remove port" onClick={() => removePort(node.id, p.id)}>
                <span className="mdi mdi-close" />
              </button>
            </div>
          ))}
          <div className="noc-build-port-add">
            <button className="noc-add-mini" onClick={() => autoDetectPorts(node.id)} title="Find PoE switches & per-port sensors for this device">
              <span className="mdi mdi-auto-fix" /> Auto-detect ports
            </button>
            <button className="noc-add-mini" onClick={() => addPort(node.id)}>
              <span className="mdi mdi-plus" /> Add port
            </button>
            <button className="noc-add-mini" onClick={() => addPorts(node.id, 8)}>
              <span className="mdi mdi-plus" /> +8
            </button>
            <button className="noc-add-mini" onClick={() => addPorts(node.id, 24)}>
              <span className="mdi mdi-plus" /> +24
            </button>
            {(node.ports?.length ?? 0) > 0 && (
              <label className="noc-build-port-cycle" title="Seconds PoE stays off during a power-cycle">
                cycle
                <input
                  type="number"
                  min={1}
                  value={node.portCycleSeconds ?? 5}
                  onChange={(e) => layout.updateNocNode(view.id, node.id, { portCycleSeconds: num(e.target.value) })}
                />
                s
              </label>
            )}
            {(node.ports?.length ?? 0) > 0 && (
              <button className="noc-clear-link" onClick={() => setPorts(node.id, [])}>Clear all</button>
            )}
          </div>
          </div>

          <aside className="noc-build-node-preview">
            <div className="noc-build-preview-label"><span className="mdi mdi-eye-outline" /> Live preview</div>
            <NocNodeTile node={node} entities={entities} getHistory={getHistory} preview />
            <div className="noc-build-preview-hint">Updates as you type — no save needed.</div>
          </aside>
        </div>
      ))}

      <button className="add-tile-btn pm-add" onClick={() => layout.addNocNode(view.id)}>
        <span className="mdi mdi-plus" /> Add Device
      </button>

      {/* ── Bottom-row panels ── */}
      <div className="noc-build-section-h">
        <span className="mdi mdi-view-dashboard-variant-outline" /> Bottom panels
        <button className="noc-add-mini" style={{ marginLeft: 'auto' }} onClick={autoPopulatePanels}>
          <span className="mdi mdi-auto-fix" /> Auto-populate from devices
        </button>
      </div>

      {panels.length === 0 && (
        <div className="noc-build-hint">
          No panels yet. Auto-populate from your devices, or add one below — Internet/WAN, Storage and Power are all editable.
        </div>
      )}

      {panels.map((panel, idx) => (
        <div className="noc-build-card noc-build-panel" key={panel.id}>
          <div className="noc-build-node-head">
            <span className="noc-build-panel-type">{panel.type}</span>
            <div className="noc-build-names">
              <input
                className="noc-build-name"
                value={panel.title ?? ''}
                placeholder={defaultTitle(panel.type)}
                onChange={(e) => updatePanel(panel.id, { title: e.target.value })}
              />
              <input
                className="noc-build-sub"
                value={panel.subtitle ?? ''}
                placeholder="Subtitle"
                onChange={(e) => updatePanel(panel.id, { subtitle: e.target.value })}
              />
            </div>
            <div className="noc-build-node-tools">
              <button
                className={`noc-mini-toggle ${(panel.span ?? 1) >= 1.5 ? 'on' : ''}`}
                title="Make this panel double-width"
                onClick={() => updatePanel(panel.id, { span: (panel.span ?? 1) >= 1.5 ? 1 : 1.5 })}
              >
                Wide
              </button>
              <button className="edit-icon-btn" title="Move up" disabled={idx === 0} onClick={() => movePanel(idx, idx - 1)}>
                <span className="mdi mdi-chevron-up" />
              </button>
              <button className="edit-icon-btn" title="Move down" disabled={idx === panels.length - 1} onClick={() => movePanel(idx, idx + 1)}>
                <span className="mdi mdi-chevron-down" />
              </button>
              <button className="edit-icon-btn danger" title="Remove panel" onClick={() => removePanel(panel.id)}>
                <span className="mdi mdi-trash-can-outline" />
              </button>
            </div>
          </div>

          {panel.type === 'wan' && (
            <>
              <div className="noc-build-sub-h">Stats (big numbers)</div>
              {(panel.stats ?? []).map((s) => (
                <div className="noc-build-pill-edit" key={s.id}>
                  <input
                    className="noc-build-pill-label"
                    value={s.label}
                    placeholder={entityName(entities, s.entity_id)}
                    onChange={(e) =>
                      updatePanel(panel.id, { stats: (panel.stats ?? []).map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)) })
                    }
                  />
                  <span className="noc-build-pill-ent">{s.entity_id}</span>
                  <input
                    className="noc-build-pill-unit"
                    value={s.unit ?? ''}
                    placeholder="unit"
                    onChange={(e) =>
                      updatePanel(panel.id, { stats: (panel.stats ?? []).map((x) => (x.id === s.id ? { ...x, unit: e.target.value || undefined } : x)) })
                    }
                  />
                  <button
                    className="edit-icon-btn danger"
                    title="Remove stat"
                    onClick={() => updatePanel(panel.id, { stats: (panel.stats ?? []).filter((x) => x.id !== s.id) })}
                  >
                    <span className="mdi mdi-close" />
                  </button>
                </div>
              ))}
              <button className="noc-add-mini" onClick={() => setPicker({ kind: 'wanStat', panelId: panel.id })}>
                <span className="mdi mdi-plus" /> Add stat
              </button>

              <div className="noc-build-sub-h">Chart lines</div>
              <div className="noc-chip-list">
                {(panel.series ?? []).map((id) => (
                  <span className="noc-edit-chip" key={id}>
                    {entityName(entities, id)}
                    <button onClick={() => updatePanel(panel.id, { series: (panel.series ?? []).filter((x) => x !== id) })}>
                      <span className="mdi mdi-close" />
                    </button>
                  </span>
                ))}
                <button className="noc-add-mini" onClick={() => setPicker({ kind: 'wanSeries', panelId: panel.id })}>
                  <span className="mdi mdi-plus" /> Add line
                </button>
              </div>

              <div className="noc-build-sub-h">
                <span className="mdi mdi-api" /> API stats
                <span className="noc-build-opt">pull from a service like Speedtest-Tracker</span>
              </div>
              {(panel.apiStats ?? []).map((a) => (
                <div className="noc-build-api" key={a.id}>
                  <div className="noc-build-pill-edit">
                    <input
                      className="noc-build-pill-label"
                      value={a.label}
                      placeholder="Download"
                      onChange={(e) => updateApiStat(panel.id, a.id, { label: e.target.value })}
                    />
                    <input
                      className="noc-build-pill-unit"
                      value={a.unit ?? ''}
                      placeholder="unit"
                      onChange={(e) => updateApiStat(panel.id, a.id, { unit: e.target.value || undefined })}
                    />
                    <button className="edit-icon-btn danger" title="Remove API stat" onClick={() => removeApiStat(panel.id, a.id)}>
                      <span className="mdi mdi-close" />
                    </button>
                  </div>
                  <input
                    className="noc-build-api-url"
                    value={a.url}
                    placeholder="https://speedtest.tower.lan/api/v1/results/latest"
                    spellCheck={false}
                    onChange={(e) => updateApiStat(panel.id, a.id, { url: e.target.value })}
                  />
                  <input
                    className="noc-build-api-url"
                    value={a.token ?? ''}
                    placeholder="Bearer token (optional)"
                    spellCheck={false}
                    type="password"
                    onChange={(e) => updateApiStat(panel.id, a.id, { token: e.target.value || undefined })}
                  />
                  <div className="noc-build-thresholds">
                    <label>JSON path<input value={a.path} placeholder="data.download" onChange={(e) => updateApiStat(panel.id, a.id, { path: e.target.value })} /></label>
                    <label>×<input type="number" value={a.multiplier ?? 1} title="Multiplier (e.g. 0.000001 for bits→Mbps)" onChange={(e) => updateApiStat(panel.id, a.id, { multiplier: num(e.target.value) })} /></label>
                    <label>Poll s<input type="number" value={a.pollSeconds ?? 60} onChange={(e) => updateApiStat(panel.id, a.id, { pollSeconds: num(e.target.value) })} /></label>
                  </div>
                </div>
              ))}
              <div className="noc-build-add-panel-row">
                <button className="noc-add-mini" onClick={() => addSpeedtestPreset(panel.id)}>
                  <span className="mdi mdi-speedometer" /> Speedtest preset (↓/↑)
                </button>
                <button className="noc-add-mini" onClick={() => addApiStat(panel.id)}>
                  <span className="mdi mdi-plus" /> Add API stat
                </button>
              </div>
            </>
          )}

          {panel.type === 'storage' && (
            <>
              <div className="noc-build-sub-h">Capacity rings</div>
              {(panel.donuts ?? []).map((d) => (
                <div className="noc-build-donut-edit" key={d.id}>
                  <div className="noc-build-pill-edit">
                    <input
                      className="noc-build-pill-label"
                      value={d.label}
                      placeholder={entityName(entities, d.entity_id)}
                      onChange={(e) =>
                        updatePanel(panel.id, { donuts: (panel.donuts ?? []).map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)) })
                      }
                    />
                    <span className="noc-build-pill-ent">{d.entity_id}</span>
                    <label className="noc-build-inline-num">
                      max
                      <input
                        type="number"
                        value={d.max ?? 100}
                        onChange={(e) =>
                          updatePanel(panel.id, { donuts: (panel.donuts ?? []).map((x) => (x.id === d.id ? { ...x, max: num(e.target.value) } : x)) })
                        }
                      />
                    </label>
                    <button
                      className="edit-icon-btn danger"
                      title="Remove ring"
                      onClick={() => updatePanel(panel.id, { donuts: (panel.donuts ?? []).filter((x) => x.id !== d.id) })}
                    >
                      <span className="mdi mdi-close" />
                    </button>
                  </div>
                  <div className="noc-build-row">
                    <button
                      className={`noc-mini-toggle ${d.informational ? 'on' : ''}`}
                      title="Informational only — neutral color, never reads as an alert (e.g. continuous-recording NVR)"
                      onClick={() => updatePanel(panel.id, { donuts: (panel.donuts ?? []).map((x) => (x.id === d.id ? { ...x, informational: !x.informational } : x)) })}
                    >
                      <span className="mdi mdi-information-outline" /> Info only
                    </button>
                  </div>
                  <div className="noc-build-row">
                    <span className="noc-build-label">Sublabel</span>
                    {d.sublabelEntity ? (
                      <span className="noc-edit-chip">
                        {entityName(entities, d.sublabelEntity)}
                        <button onClick={() => updatePanel(panel.id, { donuts: (panel.donuts ?? []).map((x) => (x.id === d.id ? { ...x, sublabelEntity: undefined } : x)) })}>
                          <span className="mdi mdi-close" />
                        </button>
                      </span>
                    ) : (
                      <>
                        <input
                          className="noc-build-pill-label"
                          value={d.sublabel ?? ''}
                          placeholder="text (e.g. 12.4 TB)"
                          onChange={(e) =>
                            updatePanel(panel.id, { donuts: (panel.donuts ?? []).map((x) => (x.id === d.id ? { ...x, sublabel: e.target.value || undefined } : x)) })
                          }
                        />
                        <button className="noc-add-mini" onClick={() => setPicker({ kind: 'donutSub', panelId: panel.id, donutId: d.id })}>
                          <span className="mdi mdi-plus" /> or sensor
                        </button>
                      </>
                    )}
                  </div>
                  <div className="noc-build-row">
                    <span className="noc-build-label">Sublabel word</span>
                    <input
                      className="noc-build-pill-unit"
                      style={{ width: 96 }}
                      value={d.sublabelSuffix ?? ''}
                      placeholder="used / free"
                      onChange={(e) =>
                        updatePanel(panel.id, { donuts: (panel.donuts ?? []).map((x) => (x.id === d.id ? { ...x, sublabelSuffix: e.target.value || undefined } : x)) })
                      }
                    />
                    <span className="noc-build-hint" style={{ margin: 0 }}>appended after the value to clarify it</span>
                  </div>
                </div>
              ))}
              <button className="noc-add-mini" onClick={() => setPicker({ kind: 'donut', panelId: panel.id })}>
                <span className="mdi mdi-plus" /> Add ring
              </button>
            </>
          )}

          {panel.type === 'power' && (
            <>
              <div className="noc-build-sub-h">UPS gauges</div>
              {(panel.units ?? []).map((u) => (
                <div className="noc-build-unit-edit" key={u.id}>
                  <div className="noc-build-pill-edit">
                    <input
                      className="noc-build-pill-label"
                      value={u.name}
                      placeholder="UPS name"
                      onChange={(e) => updatePanel(panel.id, { units: (panel.units ?? []).map((x) => (x.id === u.id ? { ...x, name: e.target.value } : x)) })}
                    />
                    <button
                      className="edit-icon-btn danger"
                      title="Remove gauge"
                      onClick={() => updatePanel(panel.id, { units: (panel.units ?? []).filter((x) => x.id !== u.id) })}
                    >
                      <span className="mdi mdi-close" />
                    </button>
                  </div>
                  <div className="noc-build-entity-row">
                    {(['batteryEntity', 'runtimeEntity', 'loadEntity', 'drawEntity', 'statusEntity'] as const).map((f) => {
                      const labels = { batteryEntity: 'Battery', runtimeEntity: 'Runtime', loadEntity: 'Load', drawEntity: 'Draw (W)', statusEntity: 'Status' };
                      const val = u[f];
                      return (
                        <div className="noc-build-pill-pick" key={f}>
                          <span className="noc-build-label">{labels[f]}</span>
                          {val ? (
                            <span className="noc-edit-chip">
                              {entityName(entities, val)}
                              <button onClick={() => updatePanel(panel.id, { units: (panel.units ?? []).map((x) => (x.id === u.id ? { ...x, [f]: undefined } : x)) })}>
                                <span className="mdi mdi-close" />
                              </button>
                            </span>
                          ) : (
                            <button className="noc-add-mini" onClick={() => setPicker({ kind: 'powerField', panelId: panel.id, unitId: u.id, field: f })}>
                              <span className="mdi mdi-plus" /> Pick
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button
                className="noc-add-mini"
                onClick={() => updatePanel(panel.id, { units: [...(panel.units ?? []), { id: uid('unit'), name: 'UPS' }] })}
              >
                <span className="mdi mdi-plus" /> Add UPS gauge
              </button>
            </>
          )}
        </div>
      ))}

      <div className="noc-build-add-panel-row">
        <span className="noc-build-label">Add panel:</span>
        <button className="noc-add-mini" onClick={() => addPanel('wan')}><span className="mdi mdi-web" /> Internet/WAN</button>
        <button className="noc-add-mini" onClick={() => addPanel('storage')}><span className="mdi mdi-harddisk" /> Storage</button>
        <button className="noc-add-mini" onClick={() => addPanel('power')}><span className="mdi mdi-power-plug" /> Power</button>
      </div>

      {pp && (
        <EntityPicker
          entities={entities}
          existing={pp.existing}
          domainFilter={pp.domainFilter}
          title={pp.title}
          onPick={pp.onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
