'use client';

import { Alert, Card, Empty, Input, Segmented, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import DeviceStatesByType from '@/components/DeviceStatesByType';
import EnergyTimeseriesChart from '@/components/EnergyTimeseriesChart';
import WeeklySummaryCards from '@/components/WeeklySummaryCards';

const { Title, Text } = Typography;

const PERIOD_OPTIONS = [
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];
const PERIOD_DAYS = { week: 7, month: 30 };

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || body?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export default function DashboardPage() {
  const [homeId, setHomeId] = useState(
    process.env.NEXT_PUBLIC_DEFAULT_HOME_ID || '',
  );

  const [summaryPeriod, setSummaryPeriod] = useState('week');
  const [seriesPeriod, setSeriesPeriod] = useState('week');

  const enabled = Boolean(homeId);
  const base = `/api/hub/stats/${encodeURIComponent(homeId)}`;

  const summary = useQuery({
    queryKey: ['weekly-summary', homeId, summaryPeriod],
    queryFn: () => fetchJson(`${base}/weekly-summary?period=${summaryPeriod}`),
    enabled,
  });
  const series = useQuery({
    queryKey: ['energy-timeseries', homeId, seriesPeriod],
    queryFn: () => fetchJson(`${base}/energy-timeseries?period=${seriesPeriod}`),
    enabled,
  });
  const states = useQuery({
    queryKey: ['latest-states', homeId],
    queryFn: () => fetchJson(`${base}/latest-states`),
    enabled,
  });

  const anyError = summary.error || series.error || states.error;

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Energy dashboard
        </Title>
        <Text type="secondary">Live energy metrics for a selected home.</Text>
      </div>

      <Space direction="vertical" size={4}>
        <Text strong>Home ID</Text>
        <Input.Search
          placeholder="Enter a home_id (e.g. home-123)"
          defaultValue={homeId}
          allowClear
          enterButton="Load"
          style={{ maxWidth: 420 }}
          onSearch={(v) => setHomeId(v.trim())}
        />
      </Space>

      {!enabled && (
        <Card>
          <Empty description="Enter a home ID to load its dashboard" />
        </Card>
      )}

      {enabled && anyError && (
        <Alert
          type="error"
          showIcon
          message="Could not load metrics"
          description={String(anyError.message)}
        />
      )}

      {enabled && (
        <>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Text strong>Summary</Text>
              <Segmented
                options={PERIOD_OPTIONS}
                value={summaryPeriod}
                onChange={setSummaryPeriod}
              />
            </div>
            <WeeklySummaryCards summary={summary.data} loading={summary.isLoading} />
          </div>

          <Card
            title={`Daily energy (last ${PERIOD_DAYS[seriesPeriod]} days)`}
            loading={series.isLoading}
            extra={
              <Segmented
                options={PERIOD_OPTIONS}
                value={seriesPeriod}
                onChange={setSeriesPeriod}
              />
            }
          >
            <EnergyTimeseriesChart data={series.data} />
          </Card>

          <Card title="Current device states">
            <DeviceStatesByType rows={states.data} loading={states.isLoading} />
          </Card>
        </>
      )}
    </Space>
  );
}
