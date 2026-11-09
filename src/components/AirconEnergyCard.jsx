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

import { airconSystems } from '@/lib/aircon';
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
 * Daily aircon energy per outdoor unit over the window, stacked, plus a per-room
 * table. eq-hub's aircon-energy rows are one per indoor unit per local day, with
 * a shared outdoor unit's total split across its rooms by runtime (`estimated`).
 * Today's bar is partial.
 */
export default function AirconEnergyCard({ homeId, win, units, groups }) {
  const dark = useDark();
  const axis = dark ? '#c3c2b7' : '#52514e';
  const grid = dark ? '#2a2a28' : '#e5e5e2';
  const surface = dark ? '#1a1a19' : '#ffffff';

  // One row per indoor unit per local day; units sharing an outdoor unit carry
  // its total split by runtime (`estimated`), so a system is the sum of its rooms.
  const params = new URLSearchParams({ start: win.start, end: win.end });
  const { data, isLoading, error } = useQuery({
    queryKey: ['aircon-energy', homeId, win.start, win.end],
    queryFn: () =>
      fetchJson(`/api/hub/stats/${encodeURIComponent(homeId)}/aircon-energy?${params.toString()}`),
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
  const estimated = new Set();
  for (const row of data) {
    if (!byDay.has(row.date)) byDay.set(row.date, {});
    byDay.get(row.date)[row.source_entity_id] = Number(row.wh);
    if (row.estimated) estimated.add(row.source_entity_id);
  }
  const sumWh = (members, whBy) => {
    const vals = members.map((m) => whBy[m]).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const today = dayjs().format('YYYY-MM-DD');
  const points = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, whBy]) => {
      const point = { day };
      for (const s of systems) point[s.key] = kwh(sumWh(s.members, whBy));
      for (const u of units) point[u.id] = kwh(whBy[u.id] ?? null);
      return point;
    });

  const fullDays = points.filter((p) => p.day !== today);
  const totalOf = (key) => points.reduce((acc, p) => acc + (p[key] ?? 0), 0);
  const perDayOf = (key) =>
    fullDays.length ? fullDays.reduce((acc, p) => acc + (p[key] ?? 0), 0) / fullDays.length : null;
  const totals = systems.map((s, i) => ({
    ...s, slot: SLOTS[i % SLOTS.length], total: totalOf(s.key), perDay: perDayOf(s.key),
  }));
  const nameOf = Object.fromEntries(units.map((u) => [u.id, u.name || u.id]));
  // Table: one row per room, under its outdoor unit's colour.
  const rooms = totals.flatMap((s) =>
    s.members.map((m) => ({
      key: m, name: nameOf[m] ?? m, system: s, estimated: estimated.has(m),
      total: totalOf(m), perDay: perDayOf(m),
    })),
  );
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
        dataSource={rooms}
        columns={[
          {
            title: 'Room',
            key: 'name',
            render: (_, r) => (
              <span>
                <span
                  style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: 2, marginRight: 8,
                    background: dark ? r.system.slot.dark : r.system.slot.light,
                  }}
                />
                {r.name} {r.estimated && <Tag style={{ marginLeft: 4 }}>estimated</Tag>}
              </span>
            ),
          },
          {
            title: 'Outdoor unit',
            key: 'system',
            render: (_, r) => (r.system.shared ? `Shared · ${fmt(r.system.total)}` : 'Own'),
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
            render: (_, r) => (grand ? `${Math.round((100 * r.total) / grand)}%` : '—'),
          },
        ]}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        Daikin&apos;s own estimate per outdoor unit, read hourly; the last bar is today so far. Rooms
        sharing an outdoor unit get its total split by how long each ran that day (estimated) — set
        the grouping on the home&apos;s Daikin connection.
      </Text>
    </div>
  );
}
