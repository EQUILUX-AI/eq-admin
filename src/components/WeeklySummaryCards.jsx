'use client';

import { Card, Col, Row, Statistic } from 'antd';

/** KPI stat-tile row for the weekly summary — headline numbers, not a plot. */
export default function WeeklySummaryCards({ summary, loading }) {
  const tiles = [
    { title: 'Imported', value: summary?.imported_kwh, suffix: 'kWh', color: '#2a78d6' },
    { title: 'Generated', value: summary?.generated_kwh, suffix: 'kWh', color: '#008300' },
    { title: 'Exported', value: summary?.exported_kwh, suffix: 'kWh', color: '#eb6834' },
    {
      title: 'Self-consumption',
      value: summary?.self_consumption_pct,
      suffix: '%',
      color: '#1baf7a',
    },
    {
      title: 'Bill (month-to-date)',
      value: summary?.bill_estimate_month_to_date_local,
      prefix: '$',
      precision: 2,
      color: '#4a3aa7',
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      {tiles.map((t) => (
        <Col key={t.title} xs={12} sm={12} md={8} lg={Math.floor(24 / 5) || 4} xl={4}>
          <Card loading={loading} styles={{ body: { padding: 20 } }}>
            <Statistic
              title={t.title}
              value={t.value ?? 0}
              precision={t.precision ?? 1}
              prefix={t.prefix}
              suffix={t.suffix}
              valueStyle={{ color: t.color, fontVariantNumeric: 'tabular-nums' }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
