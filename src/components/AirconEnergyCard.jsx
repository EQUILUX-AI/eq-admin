'use client';

import { Alert, Empty, Spin, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';

import { airconSystems, systemWh } from '@/lib/aircon';
import { fetchJson } from '@/lib/api';

const { Text } = Typography;

// Categorical slots 1-5 from the data-viz reference palette (validated light +
// dark), assigned by system in its stable order -- never by rank. Light mode sits
// under 3:1 for slots 3-5, so the totals table below is the required relief.
const SLOTS = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
  { light: '#e87ba4', dark: '#d55181' },
];

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

const kwh = (wh) => (wh == null ? null : wh / 1000);
const fmt = (v) => `${Number(v).toFixed(1)} kWh`;

/**
 * Daily aircon energy per condenser (outdoor unit) over the window, stacked.
 * Daikin rows are one per indoor unit per local day (stamped at local midnight);
 * indoor units sharing a condenser are folded into one system (see lib/aircon).
 * Today's bar is partial.
 */
export default function AirconEnergyCard({ homeId, win, units, groups }) {
  const dark = useDark();
  const axis = dark ? '#c3c2b7' : '#52514e';
  const grid = dark ? '#2a2a28' : '#e5e5e2';
  const surface = dark ? '#1a1a19' : '#ffffff';

  // Rows are stamped at local midnight, so send local-midnight instants (with
  // offset) rather than bare dates, which eq-ai would read as UTC midnight.
  const params = new URLSearchParams({
    source: 'daikin',
    metric: 'energy_wh',
    direction: 'consumed',
    start: dayjs(win.start).format(),
    end: dayjs(win.end).format(),
    limit: '5000',
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['aircon-energy', homeId, win.start, win.end],
    queryFn: () =>
      fetchJson(`/api/hub/stats/${encodeURIComponent(homeId)}/readings?${params.toString()}`),
    enabled: Boolean(homeId),
  });

  if (isLoading) return <Spin style={{ display: 'block', margin: '24px auto' }} />;
  if (error) {
    return <Alert type="warning" showIcon message="Could not load aircon energy" description={String(error.message)} />;
  }
  if (!data || data.length === 0 || units.length === 0) {
    return <Empty description="No aircon energy in this window" />;
  }

  const systems = airconSystems(units, groups);
  const byDay = new Map(); // YYYY-MM-DD -> {entity: Wh}
  for (const row of data) {
    if (row.value == null) continue;
    const day = dayjs(row.ts).format('YYYY-MM-DD');
    if (!byDay.has(day)) byDay.set(day, {});
    byDay.get(day)[row.source_entity_id] = Number(row.value);
  }
  const today = dayjs().format('YYYY-MM-DD');
  const points = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, whBy]) => {
      const point = { day };
      for (const s of systems) point[s.key] = kwh(systemWh(s.members, whBy));
      return point;
    });

  const fullDays = points.filter((p) => p.day !== today);
  const totals = systems.map((s, i) => {
    const total = points.reduce((acc, p) => acc + (p[s.key] ?? 0), 0);
    const full = fullDays.reduce((acc, p) => acc + (p[s.key] ?? 0), 0);
    return { ...s, slot: SLOTS[i % SLOTS.length], total, perDay: fullDays.length ? full / fullDays.length : null };
  });
  const grand = totals.reduce((acc, t) => acc + t.total, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d) => (d === today ? 'today' : d.slice(5))}
            tick={{ fill: axis, fontSize: 12 }}
            stroke={grid}
          />
          <YAxis
            tick={{ fill: axis, fontSize: 12 }}
            stroke={grid}
            width={48}
            label={{ value: 'kWh', angle: -90, position: 'insideLeft', fill: axis, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: grid, opacity: 0.4 }}
            contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8, color: axis }}
            itemStyle={{ color: axis }}
            labelFormatter={(d) => (d === today ? `${d} (so far)` : d)}
            formatter={(v, name) => [fmt(v), name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            // Text in ink, not the series colour -- the swatch carries identity.
            formatter={(value) => <span style={{ color: axis }}>{value}</span>}
          />
          {totals.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="ac"
              fill={dark ? s.slot.dark : s.slot.light}
              // 2px surface gap between stacked segments; rounded top on the last.
              stroke={surface}
              strokeWidth={2}
              radius={i === totals.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <Table
        size="small"
        rowKey="key"
        pagination={false}
        dataSource={totals}
        columns={[
          {
            title: 'System (outdoor unit)',
            key: 'label',
            render: (_, s) => (
              <span>
                <span
                  style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 8,
                    background: dark ? s.slot.dark : s.slot.light,
                  }}
                />
                {s.label} {s.shared && <Tag style={{ marginLeft: 4 }}>shared condenser</Tag>}
              </span>
            ),
          },
          { title: 'Total', dataIndex: 'total', align: 'right', render: fmt },
          {
            title: 'Avg / full day',
            dataIndex: 'perDay',
            align: 'right',
            render: (v) => (v == null ? '—' : fmt(v)),
          },
          {
            title: 'Share',
            key: 'share',
            align: 'right',
            render: (_, s) => (grand ? `${Math.round((100 * s.total) / grand)}%` : '—'),
          },
        ]}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        Daikin&apos;s own estimate per outdoor unit, read hourly; the last bar is today so far. Indoor
        units sharing a condenser report its total, so they&apos;re counted once — set the grouping on
        the home&apos;s Daikin connection.
      </Text>
    </div>
  );
}
