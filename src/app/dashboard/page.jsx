'use client';

import { Alert, Card, Empty, Input, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import EnergyTimeseriesChart from '@/components/EnergyTimeseriesChart';
import LatestStatesTable from '@/components/LatestStatesTable';
import WeeklySummaryCards from '@/components/WeeklySummaryCards';

const { Title, Text } = Typography;

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

  const enabled = Boolean(homeId);
  const base = `/api/hub/stats/${encodeURIComponent(homeId)}`;

  const summary = useQuery({
    queryKey: ['weekly-summary', homeId],
    queryFn: () => fetchJson(`${base}/weekly-summary`),
    enabled,
  });
  const series = useQuery({
    queryKey: ['energy-timeseries', homeId],
    queryFn: () => fetchJson(`${base}/energy-timeseries`),
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
          <WeeklySummaryCards summary={summary.data} loading={summary.isLoading} />

          <Card title="Daily energy (last 7 days)" loading={series.isLoading}>
            <EnergyTimeseriesChart data={series.data} />
          </Card>

          <Card title="Current device states">
            <LatestStatesTable rows={states.data} loading={states.isLoading} />
          </Card>
        </>
      )}
    </Space>
  );
}
