'use client';

import { MobileOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Modal, QRCode, Space, Table, Tag, Typography } from 'antd';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { fetchJson, mutateJson } from '@/lib/api';
import { readUserCookie } from '@/lib/user';

const { Title, Text, Paragraph } = Typography;

const PAGE_SIZE = 10;

/** Whole seconds left until `expiresAt` (ms epoch), ticking every second; 0 once past. */
function useSecondsLeft(expiresAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
}

/**
 * Confirm the operator's password, then show a one-time QR code that signs the
 * phone that scans it into the Equilux app as `target`. Mounted only while open,
 * so closing it discards the link.
 */
function PhoneLoginModal({ target, onClose }) {
  const [form] = Form.useForm();
  const [qr, setQr] = useState(null); // { link, expiresAt }
  const secondsLeft = useSecondsLeft(qr?.expiresAt);
  const expired = Boolean(qr) && secondsLeft === 0;
  const name = target.full_name || target.email;

  const create = useMutation({
    mutationFn: ({ password }) =>
      mutateJson(`/api/users/${encodeURIComponent(target.username)}/phone-login`, 'POST', { password }),
    onSuccess: (data) => {
      form.resetFields();
      setQr({ link: data.link, expiresAt: Date.now() + data.expiresIn * 1000 });
    },
    onError: (error) => {
      // The operator's own session ended: nothing to retry here.
      if (error.status === 401) window.location.assign('/login');
    },
  });

  const startOver = () => {
    setQr(null);
    create.reset();
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <Modal open title={`Log in on phone as ${name}`} onCancel={onClose} footer={null} width={420}>
      {qr ? (
        <Space direction="vertical" align="center" style={{ width: '100%' }}>
          <QRCode value={qr.link} size={240} status={expired ? 'expired' : 'active'} onRefresh={startOver} />
          <Text strong={!expired} type={expired ? 'secondary' : undefined}>
            {expired ? 'Expired. Refresh to make a new code.' : `Expires in ${minutes}:${seconds} · works once`}
          </Text>
          <Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 0 }}>
            Scan with the phone&apos;s camera to open the Equilux app as {name}. The session lasts 1 hour and
            can&apos;t change their password or sign-in methods.
          </Paragraph>
        </Space>
      ) : (
        <Form form={form} layout="vertical" requiredMark={false} onFinish={create.mutate}>
          <Paragraph type="secondary">
            Confirm your password to create a one-time QR code. Every code and login is recorded in the audit
            log.
          </Paragraph>
          {create.isError && create.error.status !== 401 && (
            <Alert type="error" showIcon message={create.error.message} style={{ marginBottom: 16 }} />
          )}
          <Form.Item
            name="password"
            label="Your password"
            rules={[{ required: true, message: 'Enter your password.' }]}
          >
            <Input.Password autoFocus autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={create.isPending} block>
            Create QR code
          </Button>
        </Form>
      )}
    </Modal>
  );
}

export default function UsersPage() {
  // undefined until the cookie is read on the client; null when signed out.
  const [me, setMe] = useState(undefined);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState(null);

  useEffect(() => {
    setMe(readUserCookie());
  }, []);

  const users = useQuery({
    queryKey: ['auth-users', search, page],
    queryFn: () =>
      fetchJson(`/api/users?${new URLSearchParams({ search, page: String(page), page_size: String(PAGE_SIZE) })}`),
    enabled: Boolean(me?.isSuperadmin),
    placeholderData: keepPreviousData,
  });

  if (me === undefined) return null;
  if (!me?.isSuperadmin) {
    return <Alert type="info" showIcon message="Only superadmins can use this page." />;
  }

  const columns = [
    { title: 'Name', dataIndex: 'full_name', render: (v) => v || <Text type="secondary">—</Text> },
    { title: 'Email', dataIndex: 'email' },
    {
      title: 'Role',
      dataIndex: 'roles',
      render: (roles) => (roles?.length ? roles.map((r) => <Tag key={r}>{r}</Tag>) : <Tag>USER</Tag>),
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      render: (active) => (active ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, user) => (
        <Button
          size="small"
          icon={<MobileOutlined />}
          disabled={!user.is_active || user.username === me.username}
          onClick={() => setTarget(user)}
        >
          Log in on phone
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Users
        </Title>
        <Text type="secondary">
          Open the Equilux app on a phone as a user, to see what they see. Each QR code works once, for 2
          minutes, and gives a 1-hour session.
        </Text>
      </div>

      <Input.Search
        allowClear
        placeholder="Search name or email"
        style={{ maxWidth: 360 }}
        onSearch={(value) => {
          setSearch(value.trim());
          setPage(1);
        }}
      />

      {users.isError && <Alert type="error" showIcon message={users.error.message} />}

      <Table
        rowKey="username"
        columns={columns}
        dataSource={users.data?.results ?? []}
        loading={users.isFetching}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: users.data?.count ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      {target && <PhoneLoginModal target={target} onClose={() => setTarget(null)} />}
    </Space>
  );
}
