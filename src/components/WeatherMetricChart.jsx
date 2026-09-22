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
import dayjs from 'dayjs';

// Two identities from the data-viz reference palette: observed vs forecast. Blue
// = actual, orange = forecast — non-adjacent categorical slots, reinforced by line
// style (actual solid, forecast dashed) so the pair reads without colour too.
const ACTUAL = { light: '#2a78d6', dark: '#3987e5' };
const FORECAST = { light: '#eb6834', dark: '#d95926' };

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
 * One weather metric over time as two same-unit series — Actual (observations,
 * past) and Forecast (future) — so it reads as a single continuous actual→forecast
 * line meeting at 'now'. One axis per metric by design; the panel renders a grid of
 * these rather than stacking scales onto one chart. `points` are the merged rows
 * from WeatherPanel, each carrying `${metricKey}_actual` / `${metricKey}_forecast`.
 */
export default function WeatherMetricChart({ points, metricKey, name, unit, height = 200 }) {
  const dark = useDark();
  const axis = dark ? '#c3c2b7' : '#52514e';
  const grid = dark ? '#2a2a28' : '#e5e5e2';
  const surface = dark ? '#1a1a19' : '#ffffff';
  const actual = dark ? ACTUAL.dark : ACTUAL.light;
  const forecast = dark ? FORECAST.dark : FORECAST.light;

  const aKey = `${metricKey}_actual`;
  const fKey = `${metricKey}_forecast`;
  const hasData = points?.some((p) => p[aKey] != null || p[fKey] != null);

  const heading = (
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
      {name} <span style={{ fontWeight: 400, opacity: 0.6 }}>({unit})</span>
    </div>
  );

  if (!hasData) {
    return (
      <div>
        {heading}
        <Empty description={`No ${name} data`} style={{ margin: '12px 0' }} />
      </div>
    );
  }

  const fmt = (v) =>
    `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`.trim();

  return (
    <div>
      {heading}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(t) => dayjs(t).format('MM-DD HH:mm')}
            tick={{ fill: axis, fontSize: 11 }}
            stroke={grid}
            minTickGap={44}
          />
          <YAxis tick={{ fill: axis, fontSize: 11 }} stroke={grid} width={52} />
          <Tooltip
            contentStyle={{
              background: surface,
              border: `1px solid ${grid}`,
              borderRadius: 8,
              color: axis,
            }}
            labelFormatter={(t) => dayjs(t).format('YYYY-MM-DD HH:mm')}
            formatter={(v, n) => [fmt(v), n]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: axis }} />
          <Line
            type="monotone"
            dataKey={aKey}
            name="Actual"
            stroke={actual}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey={fKey}
            name="Forecast"
            stroke={forecast}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
