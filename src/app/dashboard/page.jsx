'use client';

import { Alert, Card, DatePicker, Empty, Input, Segmented, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
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

// Where the home id + period selections are remembered across refreshes.
const PREFS_KEY = 'eq.dashboard';

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

// A dayjs range round-trips through localStorage as a pair of ISO date strings.
const serializeRange = (r) => [r[0].format('YYYY-MM-DD'), r[1].format('YYYY-MM-DD')];
const parseRange = (a) =>
  Array.isArray(a) && a.length === 2 ? [dayjs(a[0]), dayjs(a[1])] : null;

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
  const defaultRange = () => [dayjs().startOf('month'), dayjs()];

  const [homeId, setHomeId] = useState('');
  // One global window drives the summary + daily-energy chart.
  const [period, setPeriod] = useState('week');
  const [range, setRange] = useState(defaultRange);
  // Device history charts keep their own window (shorter, higher-cadence data).
  const [devicePeriod, setDevicePeriod] = useState('week');
  const [deviceRange, setDeviceRange] = useState(defaultRange);

  // Hydrate saved preferences once on mount — kept out of the initial render so
  // server and client agree — then persist on every change.
  const hydrated = useRef(false);
  useEffect(() => {
    let prefs = {};
    try {
      prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
      prefs = {};
    }
    setHomeId(prefs.homeId || process.env.NEXT_PUBLIC_DEFAULT_HOME_ID || '');
    if (prefs.period) setPeriod(prefs.period);
    if (parseRange(prefs.range)) setRange(parseRange(prefs.range));
    if (prefs.devicePeriod) setDevicePeriod(prefs.devicePeriod);
    if (parseRange(prefs.deviceRange)) setDeviceRange(parseRange(prefs.deviceRange));
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        homeId,
        period,
        range: serializeRange(range),
        devicePeriod,
        deviceRange: serializeRange(deviceRange),
      }),
    );
  }, [homeId, period, range, devicePeriod, deviceRange]);

  const globalWin = resolveWindow(period, range);
  const deviceWin = resolveWindow(devicePeriod, deviceRange);

  const enabled = Boolean(homeId);
  const base = `/api/hub/stats/${encodeURIComponent(homeId)}`;

  const summary = useQuery({
    queryKey: ['weekly-summary', homeId, globalWin.start, globalWin.end],
    queryFn: () =>
      fetchJson(`${base}/weekly-summary?start=${globalWin.start}&end=${globalWin.end}`),
    enabled,
  });
  const series = useQuery({
    queryKey: ['energy-timeseries', homeId, globalWin.start, globalWin.end],
    queryFn: () =>
      fetchJson(`${base}/energy-timeseries?start=${globalWin.start}&end=${globalWin.end}`),
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

      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <Space direction="vertical" size={4}>
          <Text strong>Home ID</Text>
          <Input.Search
            key={homeId}
            placeholder="Enter a home_id (e.g. home-123)"
            defaultValue={homeId}
            allowClear
            enterButton="Load"
            style={{ maxWidth: 420, width: '60vw' }}
            onSearch={(v) => setHomeId(v.trim())}
          />
        </Space>
        {enabled && (
          <Space direction="vertical" size={4} style={{ alignItems: 'flex-end' }}>
            <Text strong>Period</Text>
            <PeriodControls
              period={period}
              onPeriod={setPeriod}
              range={range}
              onRange={setRange}
            />
          </Space>
        )}
      </div>

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
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
              Summary
            </Text>
            <WeeklySummaryCards summary={summary.data} loading={summary.isLoading} />
          </div>

          <Card
            title={`Daily energy (${windowDays(globalWin)} days)`}
            loading={series.isLoading}
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
