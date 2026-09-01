'use client';

import { Alert, Empty, Spin, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';

const { Text } = Typography;

const METRIC_UNITS = {
  power_w: 'W',
  energy_wh: 'Wh',
  session_kwh: 'kWh',
  temperature_c: '°C',
  setpoint_c: '°C',
  soc_pct: '%',
};

// One colour per direction, from the data-viz reference palette. `value` is the
// undirected series (direction 'none').
const DIR_COLORS = {
  produced: { light: '#008300', dark: '#008300' },
  imported: { light: '#2a78d6', dark: '#3987e5' },
  exported: { light: '#eb6834', dark: '#d95926' },
  consumed: { light: '#4a3aa7', dark: '#7a6ce0' },
  value: { light: '#2a78d6', dark: '#3987e5' },
};
const dirKey = (row) =>
  row.direction && row.direction !== 'none' ? row.direction : 'value';

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setDark(mq.matches);
    const on = (e) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || body?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

/**
 * Timeseries of one device's numeric metric over a window, one line per
 * direction (e.g. a utility meter's imported vs exported energy). Pulls raw rows
 * from eq-hub's `readings` surface for exactly this (source, entity, metric).
 */
export default function DeviceHistoryChart({ homeId, source, entityId, metric, win, title }) {
  const dark = useDark();
  const axis = dark ? '#c3c2b7' : '#52514e';
  const grid = dark ? '#2a2a28' : '#e5e5e2';
  const surface = dark ? '#1a1a19' : '#ffffff';
  const unit = METRIC_UNITS[metric] ?? '';

  const base = `/api/hub/stats/${encodeURIComponent(homeId)}/readings`;
  const params = new URLSearchParams({
    source,
    source_entity_id: entityId,
    metric,
    start: win.start,
    end: win.end,
    limit: '5000',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['device-history', homeId, source, entityId, metric, win.start, win.end],
    queryFn: () => fetchJson(`${base}?${params.toString()}`),
    enabled: Boolean(homeId && source && entityId && metric),
  });

  const heading = title && (
    <Text type="secondary" style={{ fontSize: 12 }}>
      {title}
    </Text>
  );

  let body;
  if (isLoading) {
    body = <Spin size="small" style={{ display: 'block', margin: '24px auto' }} />;
  } else if (error) {
    body = (
      <Alert type="warning" showIcon message="Could not load device history"
        description={String(error.message)} style={{ marginTop: 8 }} />
    );
  } else if (!data || data.length === 0) {
    body = <Empty description="No history in this window" style={{ margin: '16px 0' }} />;
  } else {
    // Fold rows into one point per timestamp with a column per direction, so
    // recharts can draw a separate line for each. readings come newest-first.
    const byTs = new Map();
    const dirs = new Set();
    for (const row of data) {
      if (row.value == null) continue;
      const dir = dirKey(row);
      dirs.add(dir);
      let point = byTs.get(row.ts);
      if (!point) {
        point = { ts: row.ts };
        byTs.set(row.ts, point);
      }
      point[dir] = Number(row.value);
    }
    const points = [...byTs.values()].sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const series = [...dirs];

    body = (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={(t) => dayjs(t).format('MM-DD HH:mm')}
            tick={{ fill: axis, fontSize: 11 }}
            stroke={grid}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: axis, fontSize: 11 }}
            stroke={grid}
            width={52}
            label={{ value: unit, angle: -90, position: 'insideLeft', fill: axis, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              background: surface,
              border: `1px solid ${grid}`,
              borderRadius: 8,
              color: axis,
            }}
            labelFormatter={(t) => dayjs(t).format('YYYY-MM-DD HH:mm')}
            formatter={(v, name) => [`${Number(v).toLocaleString()} ${unit}`.trim(), name]}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: axis }} />}
          {series.map((dir) => (
            <Line
              key={dir}
              type="monotone"
              dataKey={dir}
              name={dir === 'value' ? metric : dir}
              stroke={dark ? DIR_COLORS[dir]?.dark : DIR_COLORS[dir]?.light}
              strokeWidth={2}
              dot={metric === 'session_kwh' ? { r: 3 } : false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {heading}
      {body}
    </div>
  );
}
