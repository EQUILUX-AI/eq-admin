'use client';

import { Alert, Card, DatePicker, Empty, Input, Segmented, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';

import DeviceStatesByType from '@/components/DeviceStatesByType';
import EnergyTimeseriesChart from '@/components/EnergyTimeseriesChart';
import WeeklySummaryCards from '@/components/WeeklySummaryCards';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const PERIOD_OPTIONS = [
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
  { label: 'Custom', value: 'custom' },
];

/** Resolve a period selection to the stats API's window contract: an inclusive
 *  `start` and an exclusive `end`, both as ISO (YYYY-MM-DD) strings.
 *
 *  Week/Month are calendar-to-date — this ISO week (from Monday) / this calendar
 *  month (from the 1st), up to and including today. Custom is the picked range. */
function resolveWindow(period, range) {
  const endExclusive = dayjs().add(1, 'day').startOf('day'); // include today
  if (period === 'custom') {
    const [from, to] = range;
    return {
      start: from.format('YYYY-MM-DD'),
      end: to.add(1, 'day').format('YYYY-MM-DD'),
    };
  }
  const start =
    period === 'month'
      ? dayjs().startOf('month')
      : dayjs().subtract((dayjs().day() + 6) % 7, 'day').startOf('day'); // Monday
  return { start: start.format('YYYY-MM-DD'), end: endExclusive.format('YYYY-MM-DD') };
}

const windowDays = (win) => dayjs(win.end).diff(dayjs(win.start), 'day');

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail || body?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

/** Segmented Week/Month/Custom plus a range picker revealed only for Custom. */
function PeriodControls({ period, onPeriod, range, onRange }) {
  return (
    <Space>
      {period === 'custom' && (
        <RangePicker
          value={range}
          onChange={(r) => r && onRange(r)}
          allowClear={false}
          maxDate={dayjs()}
        />
      )}
      <Segmented options={PERIOD_OPTIONS} value={period} onChange={onPeriod} />
    </Space>
  );
}

export default function DashboardPage() {
  const [homeId, setHomeId] = useState(
    process.env.NEXT_PUBLIC_DEFAULT_HOME_ID || '',
  );

  const defaultRange = () => [dayjs().startOf('month'), dayjs()];
  const [summaryPeriod, setSummaryPeriod] = useState('week');
  const [summaryRange, setSummaryRange] = useState(defaultRange);
  const [seriesPeriod, setSeriesPeriod] = useState('week');
  const [seriesRange, setSeriesRange] = useState(defaultRange);
  const [devicePeriod, setDevicePeriod] = useState('week');
  const [deviceRange, setDeviceRange] = useState(defaultRange);

  const summaryWin = resolveWindow(summaryPeriod, summaryRange);
  const seriesWin = resolveWindow(seriesPeriod, seriesRange);
  const deviceWin = resolveWindow(devicePeriod, deviceRange);

  const enabled = Boolean(homeId);
  const base = `/api/hub/stats/${encodeURIComponent(homeId)}`;

  const summary = useQuery({
    queryKey: ['weekly-summary', homeId, summaryWin.start, summaryWin.end],
    queryFn: () =>
      fetchJson(`${base}/weekly-summary?start=${summaryWin.start}&end=${summaryWin.end}`),
    enabled,
  });
  const series = useQuery({
    queryKey: ['energy-timeseries', homeId, seriesWin.start, seriesWin.end],
    queryFn: () =>
      fetchJson(`${base}/energy-timeseries?start=${seriesWin.start}&end=${seriesWin.end}`),
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
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <Text strong>Summary</Text>
              <PeriodControls
                period={summaryPeriod}
                onPeriod={setSummaryPeriod}
                range={summaryRange}
                onRange={setSummaryRange}
              />
            </div>
            <WeeklySummaryCards summary={summary.data} loading={summary.isLoading} />
          </div>

          <Card
            title={`Daily energy (${windowDays(seriesWin)} days)`}
            loading={series.isLoading}
            extra={
              <PeriodControls
                period={seriesPeriod}
                onPeriod={setSeriesPeriod}
                range={seriesRange}
                onRange={setSeriesRange}
              />
            }
          >
            <EnergyTimeseriesChart data={series.data} />
          </Card>

          <Card
            title="Current device states"
            extra={
              <PeriodControls
                period={devicePeriod}
                onPeriod={setDevicePeriod}
                range={deviceRange}
                onRange={setDeviceRange}
              />
            }
          >
            <DeviceStatesByType
              rows={states.data}
              loading={states.isLoading}
              homeId={homeId}
              win={deviceWin}
            />
          </Card>
        </>
      )}
    </Space>
  );
}
