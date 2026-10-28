'use client';

import { App, Button, Card, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { fetchJson, mutateJson } from '@/lib/api';
import { TEMPLATES_URL } from '@/lib/reports';

const { Title, Text } = Typography;

// DRF list endpoints may or may not be paginated.
const rows = (data) => (Array.isArray(data) ? data : data?.results ?? []);

/** Report templates: the monthly statements homes can open in the app (and
 *  download as PDF). Every published template is offered to every home; the
 *  default one is frozen each month and announced by push. */
export default function ReportTemplatesPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const templates = useQuery({ queryKey: ['report-templates'], queryFn: () => fetchJson(TEMPLATES_URL) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['report-templates'] });
  const duplicate = useMutation({
    mutationFn: (id) => mutateJson(`${TEMPLATES_URL}/${id}/duplicate`, 'POST'),
    onSuccess: (copy) => {
      refresh();
      router.push(`/dashboard/report-templates/${copy.id}`);
    },
    onError: (e) => message.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id) => mutateJson(`${TEMPLATES_URL}/${id}`, 'DELETE'),
    onSuccess: () => {
      message.success('Template deleted');
      refresh();
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (name, t) => (
        <Space direction="vertical" size={0}>
          <Link href={`/dashboard/report-templates/${t.id}`}>{name}</Link>
          {t.description ? <Text type="secondary">{t.description}</Text> : null}
        </Space>
      ),
    },
    {
      title: 'Status',
      render: (_, t) => (
        <Space>
          {t.published ? <Tag color="green">Published</Tag> : <Tag>Draft</Tag>}
          {t.is_default ? <Tag color="blue">Default</Tag> : null}
        </Space>
      ),
    },
    { title: 'Sections', render: (_, t) => t.layout?.sections?.length ?? 0 },
    { title: 'Updated', dataIndex: 'modified', render: (v) => dayjs(v).format('D MMM YYYY, HH:mm') },
    {
      title: '',
      align: 'right',
      render: (_, t) => (
        <Space>
          <Button size="small" onClick={() => duplicate.mutate(t.id)} loading={duplicate.isPending}>
            Duplicate
          </Button>
          <Popconfirm
            title="Delete this template?"
            description="Its frozen statements are deleted with it. Unpublish instead to keep them."
            onConfirm={() => remove.mutate(t.id)}
          >
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Report templates
          </Title>
          <Text type="secondary">
            Monthly statements in the app and as PDF. Published templates are offered to every home.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/dashboard/report-templates/new')}>
          New template
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={templates.isLoading}
        dataSource={rows(templates.data)}
        columns={columns}
        pagination={false}
      />
    </Card>
  );
}
