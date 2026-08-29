'use client';

import { Empty } from 'antd';
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

// Series colours assigned by entity (never by rank), from the data-viz
// reference palette. Solar reads green, grid-draw blue, grid-export orange —
// non-adjacent categorical slots, validated in both modes.
const SERIES = [
  { key: 'produced_kwh', name: 'Produced (solar)', light: '#008300', dark: '#008300' },
  { key: 'imported_kwh', name: 'Imported (grid)', light: '#2a78d6', dark: '#3987e5' },
  { key: 'exported_kwh', name: 'Exported (grid)', light: '#eb6834', dark: '#d95926' },
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

const fmtDay = (d) => (typeof d === 'string' ? d.slice(5) : d); // MM-DD

export default function EnergyTimeseriesChart({ data }) {
  const dark = useDark();
  const axis = dark ? '#c3c2b7' : '#52514e';
  const grid = dark ? '#2a2a28' : '#e5e5e2';
  const surface = dark ? '#1a1a19' : '#ffffff';

  if (!data || data.length === 0) {
    return <Empty description="No energy readings in this window" />;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDay}
          tick={{ fill: axis, fontSize: 12 }}
          stroke={grid}
        />
        <YAxis
          tick={{ fill: axis, fontSize: 12 }}
          stroke={grid}
          width={48}
          label={{
            value: 'kWh',
            angle: -90,
            position: 'insideLeft',
            fill: axis,
            fontSize: 12,
          }}
        />
        <Tooltip
          contentStyle={{
            background: surface,
            border: `1px solid ${grid}`,
            borderRadius: 8,
            color: axis,
          }}
          formatter={(v, name) => [`${Number(v).toFixed(2)} kWh`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: axis }} />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={dark ? s.dark : s.light}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
