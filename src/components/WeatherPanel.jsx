'use client';

import { Empty, Typography } from 'antd';

import WeatherMetricChart from './WeatherMetricChart';

const { Text } = Typography;

// GHI drives PV, so it leads full-width; everything else is a grouped grid of
// small multiples. Each entry is a column on both the forecast and observation
// rows returned by eq-ai's metrics_weather.
const HERO = { key: 'ghi_w_m2', name: 'Global horizontal irradiance (GHI)', unit: 'W/m²' };

const GROUPS = [
  {
    title: 'Irradiance',
    metrics: [
      { key: 'dni_w_m2', name: 'DNI (direct)', unit: 'W/m²' },
      { key: 'dhi_w_m2', name: 'DHI (diffuse)', unit: 'W/m²' },
      { key: 'gti_w_m2', name: 'GTI (tilted)', unit: 'W/m²' },
    ],
  },
  {
    title: 'Temperature',
    metrics: [
      { key: 'temp_c', name: 'Air temp', unit: '°C' },
      { key: 'dewpoint_c', name: 'Dew point', unit: '°C' },
    ],
  },
  {
    title: 'Humidity & cloud',
    metrics: [
      { key: 'cloud_cover_pct', name: 'Cloud cover', unit: '%' },
      { key: 'humidity_pct', name: 'Relative humidity', unit: '%' },
    ],
  },
  {
    title: 'Wind',
    metrics: [
      { key: 'wind_ms', name: 'Wind speed', unit: 'm/s' },
      { key: 'wind_gust_ms', name: 'Wind gust', unit: 'm/s' },
    ],
  },
  {
    title: 'Pressure & precipitation',
    metrics: [
      { key: 'pressure_hpa', name: 'Surface pressure', unit: 'hPa' },
      { key: 'precip_mm', name: 'Precipitation', unit: 'mm/h' },
    ],
  },
  {
    title: 'Air quality',
    metrics: [
      { key: 'pm2_5_ug_m3', name: 'PM2.5', unit: 'µg/m³' },
      { key: 'pm10_ug_m3', name: 'PM10', unit: 'µg/m³' },
    ],
  },
];

/** Fold the two series into one point per timestamp, tagging each numeric column
 *  `<col>_actual` / `<col>_forecast`. Observations are past, forecast is future, so
 *  the merged series joins at 'now' and each metric reads as one continuous line. */
function buildPoints(data) {
  const byTime = new Map();
  const put = (rows, suffix) => {
    for (const row of rows || []) {
      const t = row.valid_time;
      if (!t) continue;
      let point = byTime.get(t);
      if (!point) {
        point = { t };
        byTime.set(t, point);
      }
      for (const [col, value] of Object.entries(row)) {
        if (col === 'valid_time' || typeof value !== 'number') continue;
        point[`${col}_${suffix}`] = value;
      }
    }
  };
  put(data?.observations, 'actual');
  put(data?.forecast, 'forecast');
  return [...byTime.values()].sort((a, b) => new Date(a.t) - new Date(b.t));
}

export default function WeatherPanel({ data }) {
  const points = buildPoints(data);
  if (!points.length) {
    return <Empty description="No weather data for this home" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <WeatherMetricChart
        points={points}
        metricKey={HERO.key}
        name={HERO.name}
        unit={HERO.unit}
        height={300}
      />
      {GROUPS.map((group) => (
        <div key={group.title}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {group.title}
          </Text>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {group.metrics.map((m) => (
              <WeatherMetricChart
                key={m.key}
                points={points}
                metricKey={m.key}
                name={m.name}
                unit={m.unit}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
