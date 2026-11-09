'use client';

import { Alert, Empty, Tabs, Typography } from 'antd';
import { sharedWith } from '@/lib/aircon';
import AirconUnitEnergyChart from './AirconUnitEnergyChart';
import DeviceHistoryChart from './DeviceHistoryChart';
import LatestStatesTable from './LatestStatesTable';

const { Text } = Typography;

// Sources whose energy_wh is one row per local day (Daikin's per-unit daily
// energy), not a meter counter: charted on its own, never as the primary metric.
const DAILY_ENERGY_SOURCES = new Set(['daikin']);

// Primary metric to chart per device, most-preferred first. A device that
// reports any of these (e.g. a solar inverter's power_w) gets a timeseries graph.
// session_kwh is deliberately excluded — it's charted separately (see below).
const CHARTABLE_METRICS = ['power_w', 'energy_wh', 'soc_pct', 'temperature_c'];
const METRIC_TITLES = {
  power_w: 'Power',
  energy_wh: 'Energy',
  soc_pct: 'State of charge',
  temperature_c: 'Temperature',
};

/** Friendly type ("Solar inverter") when eq-hub knew the device, else the raw
 *  provider (e.g. "fusionsolar"). */
const typeLabel = (row) => row.device_type_label || row.source;
/** Friendly device name when known, else the raw external id. */
const deviceLabel = (row) => row.device_name || row.source_entity_id || '—';

const pickChartMetric = (rows) =>
  CHARTABLE_METRICS.find((m) => rows.some((r) => r.metric === m && r.value != null));

/** Group rows into a stable, sorted map keyed by `key(row)`. */
function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = key(row) ?? '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** One device: its current-state table, plus timeseries graph(s) over the
 *  selected window when it reports chartable metrics. Charging energy
 *  (session_kwh) is drawn as its own separate graph. */
function DevicePanel({ homeId, rows, win, groups, nameOf }) {
  const first = rows[0];
  const dailyEnergy =
    DAILY_ENERGY_SOURCES.has(first.source) &&
    rows.some((r) => r.metric === 'energy_wh' && r.value != null);
  const metric = pickChartMetric(dailyEnergy ? rows.filter((r) => r.metric !== 'energy_wh') : rows);
  const hasSessions = rows.some((r) => r.metric === 'session_kwh' && r.value != null);
  const canChart = Boolean(homeId && win);
  const shared = dailyEnergy ? sharedWith(first.source_entity_id, groups, nameOf) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {shared.length > 0 && (
        <Alert
          type="info"
          showIcon
          message={`Shared outdoor unit with ${shared.join(', ')}`}
          description="Daikin reports the outdoor unit's total; this room's energy is its share by runtime, an estimate."
        />
      )}
      <LatestStatesTable rows={rows} />
      {canChart && metric && (
        <DeviceHistoryChart
          homeId={homeId}
          source={first.source}
          entityId={first.source_entity_id}
          metric={metric}
          win={win}
          title={METRIC_TITLES[metric] ?? metric}
        />
      )}
      {canChart && dailyEnergy && (
        <AirconUnitEnergyChart homeId={homeId} entityId={first.source_entity_id} win={win} />
      )}
      {canChart && hasSessions && (
        <DeviceHistoryChart
          homeId={homeId}
          source={first.source}
          entityId={first.source_entity_id}
          metric="session_kwh"
          win={win}
          title="Charging sessions"
        />
      )}
    </div>
  );
}

/**
 * Current device states broken up by device type. Each type is a stacked
 * section; a type with more than one device tabs through its devices (labelled
 * by their friendly name), otherwise the single device's panel renders directly.
 */
export default function DeviceStatesByType({ rows, loading, homeId, win, groups = [] }) {
  if (loading && (!rows || rows.length === 0)) {
    return <LatestStatesTable rows={[]} loading />;
  }
  if (!rows || rows.length === 0) {
    return <Empty description="No device states for this home" />;
  }

  const byType = groupBy(rows, typeLabel);
  const names = new Map(rows.map((r) => [r.source_entity_id, deviceLabel(r)]));
  const nameOf = (id) => names.get(id) ?? id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {byType.map(([type, typeRows]) => {
        // Key tabs by the stable entity id, but label them by friendly name.
        const byDevice = groupBy(typeRows, (r) => r.source_entity_id);
        return (
          <div key={type}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {type}
            </Text>
            {byDevice.length > 1 ? (
              <Tabs
                size="small"
                items={byDevice.map(([entityId, deviceRows]) => ({
                  key: entityId,
                  label: deviceLabel(deviceRows[0]),
                  children: (
                    <DevicePanel homeId={homeId} rows={deviceRows} win={win} groups={groups} nameOf={nameOf} />
                  ),
                }))}
              />
            ) : (
              <DevicePanel homeId={homeId} rows={typeRows} win={win} groups={groups} nameOf={nameOf} />
            )}
          </div>
        );
      })}
    </div>
  );
}
