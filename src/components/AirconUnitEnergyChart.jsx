'use client';

import { Alert, Empty, Spin, Typography } from 'antd';
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

import { fetchJson } from '@/lib/api';

const { Text } = Typography;

// Slot 1 for this room; the outdoor unit's total in the recessive grey so the
// room reads first.
const ROOM = { light: '#2a78d6', dark: '#3987e5' };
const SYSTEM = { light: '#b4b3ad', dark: '#5f5e5a' };

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

/**
 * One aircon's daily energy over the window, from eq-hub's aircon-energy rows.
 * On a shared outdoor unit the room's figure is its runtime split of the total
 * (estimated) and the total is drawn beside it; today is partial.
 */
export default function AirconUnitEnergyChart({ homeId, entityId, win }) {
  const dark = useDark();
  const axis = dark ? '#c3c2b7' : '#52514e';
  const grid = dark ? '#2a2a28' : '#e5e5e2';
  const surface = dark ? '#1a1a19' : '#ffffff';

  const params = new URLSearchParams({ start: win.start, end: win.end });
  const { data, isLoading, error } = useQuery({
    queryKey: ['aircon-energy', homeId, win.start, win.end],
    queryFn: () =>
      fetchJson(`/api/hub/stats/${encodeURIComponent(homeId)}/aircon-energy?${params.toString()}`),
    enabled: Boolean(homeId),
  });

  const rows = (data ?? []).filter((r) => r.source_entity_id === entityId);
  const estimated = rows.some((r) => r.estimated);
  const today = dayjs().format('YYYY-MM-DD');
  const points = rows
    .map((r) => ({ day: r.date, room: r.wh / 1000, system: r.system_wh / 1000, hours: r.runtime_h }))
    .sort((a, b) => a.day.localeCompare(b.day));

  let body;
  if (isLoading) {
    body = <Spin size="small" style={{ display: 'block', margin: '24px auto' }} />;
  } else if (error) {
    body = (
      <Alert type="warning" showIcon message="Could not load aircon energy"
        description={String(error.message)} style={{ marginTop: 8 }} />
    );
  } else if (points.length === 0) {
    body = <Empty description="No energy in this window" style={{ margin: '16px 0' }} />;
  } else {
    body = (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d) => (d === today ? 'today' : d.slice(5))}
            tick={{ fill: axis, fontSize: 11 }}
            stroke={grid}
          />
          <YAxis
            tick={{ fill: axis, fontSize: 11 }}
            stroke={grid}
            width={52}
            label={{ value: 'kWh', angle: -90, position: 'insideLeft', fill: axis, fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: grid, opacity: 0.4 }}
            contentStyle={{ background: surface, border: `1px solid ${grid}`, borderRadius: 8, color: axis }}
            itemStyle={{ color: axis }}
            labelFormatter={(d) => (d === today ? `${d} (so far)` : d)}
            formatter={(v, name, item) => [
              name === 'This room' && item.payload.hours != null
                ? `${Number(v).toFixed(1)} kWh (ran ${item.payload.hours.toFixed(1)} h)`
                : `${Number(v).toFixed(1)} kWh`,
              name,
            ]}
          />
          {estimated && (
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => <span style={{ color: axis }}>{value}</span>}
            />
          )}
          <Bar
            dataKey="room"
            name="This room"
            fill={dark ? ROOM.dark : ROOM.light}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          {estimated && (
            <Bar
              dataKey="system"
              name="Outdoor unit total"
              fill={dark ? SYSTEM.dark : SYSTEM.light}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {estimated
          ? 'Daily energy (estimated: outdoor unit total split by runtime; today so far)'
          : 'Daily energy (today so far)'}
      </Text>
      {body}
    </div>
  );
}
