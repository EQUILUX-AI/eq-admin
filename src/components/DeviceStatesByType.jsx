'use client';

import { Empty, Tabs, Typography } from 'antd';

import LatestStatesTable from './LatestStatesTable';

const { Text } = Typography;

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

/**
 * Current device states broken up by device type (`source`). Each type is a
 * stacked section; a type with more than one device (`source_entity_id`) tabs
 * through its devices, otherwise the single device's table renders directly.
 */
export default function DeviceStatesByType({ rows, loading }) {
  if (loading && (!rows || rows.length === 0)) {
    return <LatestStatesTable rows={[]} loading />;
  }
  if (!rows || rows.length === 0) {
    return <Empty description="No device states for this home" />;
  }

  const byType = groupBy(rows, (r) => r.source);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {byType.map(([source, typeRows]) => {
        const byDevice = groupBy(typeRows, (r) => r.source_entity_id);
        return (
          <div key={source}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {source}
            </Text>
            {byDevice.length > 1 ? (
              <Tabs
                size="small"
                items={byDevice.map(([entityId, deviceRows]) => ({
                  key: entityId,
                  label: entityId,
                  children: <LatestStatesTable rows={deviceRows} />,
                }))}
              />
            ) : (
              <LatestStatesTable rows={typeRows} />
            )}
          </div>
        );
      })}
    </div>
  );
}
