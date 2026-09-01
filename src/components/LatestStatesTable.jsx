'use client';

import { Table, Tag } from 'antd';

const columns = [
  { title: 'Source', dataIndex: 'source', key: 'source', render: (s) => <Tag>{s}</Tag> },
  {
    title: 'Device',
    dataIndex: 'source_entity_id',
    key: 'entity',
    ellipsis: true,
    // Prefer eq-hub's friendly name (with model) over the raw external id.
    render: (id, row) => {
      const name = row.device_name || id;
      return row.device_model ? `${name} · ${row.device_model}` : name;
    },
  },
  { title: 'Metric', dataIndex: 'metric', key: 'metric' },
  {
    title: 'Direction',
    dataIndex: 'direction',
    key: 'direction',
    render: (d) => (d && d !== 'none' ? d : '—'),
  },
  {
    title: 'Value',
    dataIndex: 'value',
    key: 'value',
    align: 'right',
    render: (v, row) =>
      v != null ? Number(v).toLocaleString() : (row.text_value ?? '—'),
  },
  {
    title: 'As of',
    dataIndex: 'ts',
    key: 'ts',
    render: (ts) => (ts ? new Date(ts).toLocaleString() : '—'),
  },
];

/** Current device snapshot — most recent reading per (source, entity, metric). */
export default function LatestStatesTable({ rows, loading }) {
  return (
    <Table
      size="small"
      loading={loading}
      dataSource={(rows ?? []).map((r, i) => ({ key: i, ...r }))}
      columns={columns}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
    />
  );
}
