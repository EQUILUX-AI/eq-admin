'use client';

import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

import { outdoorUnits } from '@/lib/aircon';
import { fetchJson, mutateJson } from '@/lib/api';

const { Title, Text } = Typography;

const ACCOUNTS_URL = '/api/hub/admin/provider-accounts';
const CONNECTIONS_URL = '/api/hub/admin/provider-connections';

// Shared with the dashboard page — the operator's last-viewed home id.
const PREFS_KEY = 'eq.dashboard';

// Providers whose credentials are managed here. SP Digital is deliberately
// absent: its connections are script-seeded and shown read-only.
const PROVIDERS = [
  { value: 'fusionsolar', label: 'FusionSolar' },
  { value: 'wallbox', label: 'Wallbox' },
  { value: 'daikin', label: 'Daikin' },
];
const PROVIDER_LABELS = { ...Object.fromEntries(PROVIDERS.map((p) => [p.value, p.label])), sp_digital: 'SP Digital' };

// Credential shape per provider (see eq-ai adapters). `secret` renders a password input.
const CREDENTIAL_FIELDS = {
  fusionsolar: [
    { name: 'username', label: 'Username' },
    { name: 'system_code', label: 'System code', secret: true },
  ],
  wallbox: [
    { name: 'email', label: 'Email' },
    { name: 'password', label: 'Password', secret: true },
  ],
  daikin: [
    { name: 'user_id', label: 'User id' },
    { name: 'password', label: 'Password', secret: true },
    { name: 'client_id', label: 'Client id' },
    { name: 'client_secret', label: 'Client secret', secret: true },
    { name: 'uuid', label: 'UUID' },
  ],
};

// DRF list endpoints may or may not be paginated.
const rows = (data) => (Array.isArray(data) ? data : data?.results ?? []);

const STATUS_COLORS = {
  requested: 'gold',
  connected: 'green',
  pending: 'blue',
  expired: 'orange',
  error: 'red',
  revoked: 'default',
};

/** Create/edit a provider account. Credentials are required on create; on edit
 *  they're only sent when every field is filled in. */
function AccountModal({ open, account, onClose }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const provider = Form.useWatch('provider', form);
  const editing = Boolean(account);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      account
        ? { provider: account.provider, label: account.label, aggregated: account.aggregated, base_url: account.base_url }
        : { provider: 'fusionsolar', aggregated: true, base_url: '' },
    );
  }, [open, account, form]);

  const save = useMutation({
    mutationFn: (body) =>
      editing
        ? mutateJson(`${ACCOUNTS_URL}/${account.id}`, 'PATCH', body)
        : mutateJson(ACCOUNTS_URL, 'POST', body),
    onSuccess: () => {
      message.success(editing ? 'Account updated' : 'Account created');
      queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });
      onClose();
    },
  });

  const onFinish = (values) => {
    const fields = CREDENTIAL_FIELDS[values.provider] ?? [];
    const creds = values.credentials ?? {};
    const filled = fields.filter((f) => creds[f.name]?.trim());
    const body = {
      provider: values.provider,
      label: values.label,
      aggregated: Boolean(values.aggregated),
      base_url: values.base_url ?? '',
    };
    if (filled.length === fields.length) {
      body.credentials = Object.fromEntries(fields.map((f) => [f.name, creds[f.name].trim()]));
    } else if (filled.length > 0) {
      form.setFields([{ name: ['credentials', fields[0].name], errors: ['Fill in every credential field, or none to keep the current ones.'] }]);
      return;
    }
    save.mutate(body);
  };

  return (
    <Modal
      open={open}
      title={editing ? `Edit account — ${account.label}` : 'New provider account'}
      okText="Save"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      {save.isError && <Alert type="error" showIcon message={save.error.message} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
          <Select
            options={PROVIDERS}
            disabled={editing}
            onChange={(v) => form.setFieldValue('aggregated', v === 'fusionsolar')}
          />
        </Form.Item>
        <Form.Item name="label" label="Label" rules={[{ required: true }]}>
          <Input placeholder="e.g. Equilux installer account" />
        </Form.Item>
        <Form.Item
          name="aggregated"
          label="Aggregated (one account covering many homes)"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item name="base_url" label="Base URL">
          <Input placeholder="https://…" />
        </Form.Item>
        <Text type="secondary">
          {editing ? 'Credentials — leave blank to keep the current ones.' : 'Credentials'}
        </Text>
        {(CREDENTIAL_FIELDS[provider] ?? []).map((f) => (
          <Form.Item
            key={`${provider}-${f.name}`}
            name={['credentials', f.name]}
            label={f.label}
            rules={editing ? [] : [{ required: true, whitespace: true }]}
            style={{ marginTop: 8 }}
          >
            {f.secret ? <Input.Password autoComplete="new-password" /> : <Input autoComplete="off" />}
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}

function AccountsSection({ accounts }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState({ open: false, account: null });

  const remove = useMutation({
    mutationFn: (id) => mutateJson(`${ACCOUNTS_URL}/${id}`, 'DELETE'),
    onSuccess: () => {
      message.success('Account deleted');
      queryClient.invalidateQueries({ queryKey: ['provider-accounts'] });
    },
    onError: (e) => message.error(e.message),
  });

  const list = rows(accounts.data);
  const hasCount = list.some((a) => a.connection_count !== undefined);

  const columns = [
    { title: 'Label', dataIndex: 'label' },
    { title: 'Provider', dataIndex: 'provider', render: (p) => PROVIDER_LABELS[p] ?? p },
    {
      title: 'Aggregated',
      dataIndex: 'aggregated',
      render: (v) => (v ? <Tag color="purple">Aggregated</Tag> : <Tag>Per user</Tag>),
    },
    { title: 'Base URL', dataIndex: 'base_url', render: (v) => v || <Text type="secondary">default</Text> },
    ...(hasCount ? [{ title: 'Connections', dataIndex: 'connection_count' }] : []),
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, a) => (
        <Space>
          <Button size="small" onClick={() => setModal({ open: true, account: a })}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this account?"
            description="Only possible once no connection uses it."
            onConfirm={() => remove.mutate(a.id)}
          >
            <Button size="small" danger loading={remove.isPending && remove.variables === a.id}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Provider accounts"
      extra={
        <Button type="primary" onClick={() => setModal({ open: true, account: null })}>
          New account
        </Button>
      }
    >
      {accounts.isError && <Alert type="error" showIcon message={accounts.error.message} style={{ marginBottom: 16 }} />}
      <Table rowKey="id" size="small" loading={accounts.isLoading} dataSource={list} columns={columns} pagination={false} />
      <AccountModal
        open={modal.open}
        account={modal.account}
        onClose={() => setModal({ open: false, account: null })}
      />
    </Card>
  );
}

/** Groups of the home's aircons that share one outdoor unit (condenser), saved
 *  as the Daikin connection's `scope.outdoor_units`. Units left out each have
 *  their own; shared units all report the condenser's total energy. */
function OutdoorUnitsField({ homeId, open }) {
  const states = useQuery({
    queryKey: ['latest-states', homeId],
    queryFn: () => fetchJson(`/api/hub/stats/${encodeURIComponent(homeId)}/latest-states`),
    enabled: open && Boolean(homeId),
  });
  const options = [
    ...new Map(
      (states.data ?? [])
        .filter((r) => r.source === 'daikin')
        .map((r) => [r.source_entity_id, { value: r.source_entity_id, label: r.device_name || r.source_entity_id }]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <Form.Item
      label="Shared outdoor units"
      extra="One row per condenser serving two or more aircons. Aircons not listed have their own."
    >
      <Form.List
        name="outdoor_units"
        rules={[
          {
            validator: async (_, groups) => {
              const all = (groups ?? []).flat().filter(Boolean);
              if (new Set(all).size !== all.length) throw new Error('An aircon can only be on one outdoor unit.');
            },
          },
        ]}
      >
        {(fields, { add, remove }, { errors }) => (
          <>
            {fields.map((field) => (
              <Space key={field.key} align="baseline" style={{ display: 'flex' }}>
                <Form.Item
                  {...field}
                  rules={[{ required: true, type: 'array', min: 2, message: 'Pick at least two aircons.' }]}
                  style={{ width: 360, marginBottom: 8 }}
                >
                  <Select mode="multiple" placeholder="Aircons on this condenser" options={options}
                    loading={states.isLoading} optionFilterProp="label" />
                </Form.Item>
                <MinusCircleOutlined onClick={() => remove(field.name)} />
              </Space>
            ))}
            <Button type="dashed" onClick={() => add([])} icon={<PlusOutlined />}>
              Add shared outdoor unit
            </Button>
            <Form.ErrorList errors={errors} />
          </>
        )}
      </Form.List>
    </Form.Item>
  );
}

/** Equilux's shared (aggregated) account id for a provider, when there's exactly one. */
function sharedAccount(accounts, provider) {
  const shared = accounts.filter((a) => a.provider === provider && a.aggregated);
  return shared.length === 1 ? shared[0].id : undefined;
}

/** Owners who agreed in the app to Equilux linking a staff-linked vendor
 *  (FusionSolar): connections in status `requested`, oldest first. Once the
 *  vendor has added the home to the Equilux account, Connect fills in the
 *  account + plant; saving moves it to pending and off this list. Decline
 *  deletes the request (the owner can ask again). */
function RequestedConnectionsSection({ accounts }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState({ open: false, connection: null });
  const requested = useQuery({
    queryKey: ['requested-connections'],
    queryFn: () => fetchJson(`${CONNECTIONS_URL}?status=requested`),
  });
  const decline = useMutation({
    mutationFn: (c) => mutateJson(`${CONNECTIONS_URL}/${c.id}?home=${encodeURIComponent(c.home)}`, 'DELETE'),
    onSuccess: (_, c) => {
      message.success('Request declined');
      queryClient.invalidateQueries({ queryKey: ['requested-connections'] });
      queryClient.invalidateQueries({ queryKey: ['provider-connections', c.home] });
    },
    onError: (e) => message.error(e.message),
  });

  const columns = [
    { title: 'Home', key: 'home', render: (_, c) => (
      <Space direction="vertical" size={0}>
        {c.home_name || <Text type="secondary">unnamed</Text>}
        <Text type="secondary" copyable style={{ fontSize: 12 }}>{c.home}</Text>
      </Space>
    ) },
    { title: 'Owner', dataIndex: 'owner_email', render: (v) => (v ? <Text copyable>{v}</Text> : '—') },
    { title: 'Provider', dataIndex: 'provider', render: (p) => PROVIDER_LABELS[p] ?? p },
    { title: 'Agreed', dataIndex: 'created', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, c) => (
        <Space>
          <Button size="small" type="primary" onClick={() => setModal({ open: true, connection: c })}>
            Connect
          </Button>
          <Popconfirm
            title="Decline this request?"
            description="It leaves this list; the owner can ask again from the app."
            onConfirm={() => decline.mutate(c)}
          >
            <Button size="small" danger loading={decline.isPending && decline.variables?.id === c.id}>
              Decline
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card title="Waiting to be linked">
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        These owners agreed in the app to Equilux linking their home. FusionSolar: ask Huawei to add the
        plant to the Equilux account, then Connect and pick the plant.
      </Text>
      {requested.isError && <Alert type="error" showIcon message={requested.error.message} style={{ marginBottom: 16 }} />}
      <Table
        rowKey="id"
        size="small"
        loading={requested.isLoading}
        dataSource={rows(requested.data)}
        columns={columns}
        pagination={false}
        locale={{ emptyText: 'No one waiting' }}
        scroll={{ x: true }}
      />
      <ConnectionModal
        open={modal.open}
        connection={modal.connection}
        homeId={modal.connection?.home ?? ''}
        accounts={accounts}
        onClose={() => setModal({ open: false, connection: null })}
      />
    </Card>
  );
}

/** Create/edit one home's connection: provider, account, (for an aggregated
 *  FusionSolar account) the station codes this home is scoped to, and (for
 *  Daikin) which aircons share an outdoor unit. */
function ConnectionModal({ open, connection, homeId, accounts, onClose }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const provider = Form.useWatch('provider', form);
  const accountId = Form.useWatch('account', form);
  const editing = Boolean(connection);
  // Completing an owner's request: provider fixed, account defaults to the
  // shared one (derived id, so a refetch of the list doesn't reset the form).
  const completing = connection?.status === 'requested';
  const defaultAccount = completing ? sharedAccount(accounts, connection.provider) : undefined;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      connection
        ? {
            provider: connection.provider,
            // A FusionSolar request has no account yet: it always goes on
            // Equilux's shared one, so pick that.
            account: connection.account ?? defaultAccount,
            enabled: connection.enabled ?? true,
            station_codes: connection.scope?.station_codes ?? [],
            outdoor_units: outdoorUnits([connection]),
          }
        : { provider: 'fusionsolar', enabled: true, station_codes: [], outdoor_units: [] },
    );
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [open, connection, defaultAccount, form]);

  const account = accounts.find((a) => a.id === accountId);
  const needsStations = account?.aggregated && account?.provider === 'fusionsolar';

  const stations = useQuery({
    queryKey: ['account-stations', accountId],
    queryFn: () => fetchJson(`${ACCOUNTS_URL}/${accountId}/stations`),
    enabled: open && Boolean(needsStations),
    retry: false,
  });

  const save = useMutation({
    mutationFn: (body) =>
      editing
        ? mutateJson(`${CONNECTIONS_URL}/${connection.id}?home=${encodeURIComponent(homeId)}`, 'PATCH', body)
        : mutateJson(CONNECTIONS_URL, 'POST', body),
    onSuccess: () => {
      message.success(editing ? 'Connection updated' : 'Connection created');
      queryClient.invalidateQueries({ queryKey: ['provider-connections', homeId] });
      queryClient.invalidateQueries({ queryKey: ['requested-connections'] });
      onClose();
    },
  });

  const onFinish = (values) => {
    // Keep any other scope keys (e.g. charger_ids) the connection already has.
    const scope = { ...(connection?.scope ?? {}) };
    if (needsStations) scope.station_codes = values.station_codes ?? [];
    if (values.provider === 'daikin') {
      const groups = (values.outdoor_units ?? []).filter((g) => g?.length >= 2);
      if (groups.length) scope.outdoor_units = groups;
      else delete scope.outdoor_units;
    }
    save.mutate({
      home: homeId,
      provider: values.provider,
      account: values.account,
      enabled: Boolean(values.enabled),
      scope,
    });
  };

  const stationOptions = (stations.data?.stations ?? []).map((s) => ({
    value: s.code,
    label: `${s.name || s.code} (${s.code})`,
  }));
  // Keep already-saved codes selectable even if the account no longer lists them.
  for (const code of connection?.scope?.station_codes ?? []) {
    if (!stationOptions.some((o) => o.value === code)) stationOptions.push({ value: code, label: code });
  }

  return (
    <Modal
      open={open}
      title={completing ? `Connect request — ${connection.home_name || connection.home}` : editing ? 'Edit connection' : 'New connection'}
      okText="Save"
      confirmLoading={save.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      {save.isError && <Alert type="error" showIcon message={save.error.message} style={{ marginBottom: 16 }} />}
      {completing && !defaultAccount && (
        <Alert
          type="warning"
          showIcon
          message="No single shared account found"
          description="Couldn't pick Equilux's shared account for this provider (accounts not loaded, none, or more than one). Choose it below."
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
          <Select
            disabled={completing}
            options={PROVIDERS}
            onChange={() => form.setFieldsValue({ account: undefined, station_codes: [] })}
          />
        </Form.Item>
        <Form.Item name="account" label="Account" rules={[{ required: true }]}>
          <Select
            placeholder="Pick an account"
            options={accounts
              .filter((a) => a.provider === provider)
              .map((a) => ({ value: a.id, label: `${a.label}${a.aggregated ? ' (aggregated)' : ''}` }))}
            onChange={() => form.setFieldValue('station_codes', [])}
          />
        </Form.Item>
        {needsStations && (
          <>
            {stations.isError && (
              <Alert
                type="error"
                showIcon
                message="Couldn't load this account's plants"
                description={stations.error.message}
                style={{ marginBottom: 16 }}
              />
            )}
            <Form.Item
              name="station_codes"
              label="Stations (plants) for this home"
              rules={[{ required: true, type: 'array', min: 1, message: 'Pick at least one station — an aggregated account must be scoped.' }]}
            >
              <Select mode="multiple" loading={stations.isLoading} options={stationOptions} optionFilterProp="label" />
            </Form.Item>
          </>
        )}
        {provider === 'daikin' && <OutdoorUnitsField homeId={homeId} open={open} />}
        <Form.Item name="enabled" label="Enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ConnectionsSection({ accounts }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [homeId, setHomeId] = useState('');
  const [draft, setDraft] = useState('');
  const [modal, setModal] = useState({ open: false, connection: null });

  useEffect(() => {
    let prefs = {};
    try {
      prefs = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
      prefs = {};
    }
    const initial = prefs.homeId || process.env.NEXT_PUBLIC_DEFAULT_HOME_ID || '';
    setHomeId(initial);
    setDraft(initial);
  }, []);

  const connections = useQuery({
    queryKey: ['provider-connections', homeId],
    queryFn: () => fetchJson(`${CONNECTIONS_URL}?home=${encodeURIComponent(homeId)}`),
    enabled: Boolean(homeId),
  });

  const remove = useMutation({
    mutationFn: (id) => mutateJson(`${CONNECTIONS_URL}/${id}?home=${encodeURIComponent(homeId)}`, 'DELETE'),
    onSuccess: () => {
      message.success('Connection deleted');
      queryClient.invalidateQueries({ queryKey: ['provider-connections', homeId] });
      queryClient.invalidateQueries({ queryKey: ['requested-connections'] });
    },
    onError: (e) => message.error(e.message),
  });

  const accountLabel = (c) =>
    c.account_label ?? accounts.find((a) => a.id === c.account)?.label ?? (c.account ? c.account : '—');

  const columns = [
    { title: 'Provider', dataIndex: 'provider', render: (p) => PROVIDER_LABELS[p] ?? p },
    {
      title: 'Account',
      key: 'account',
      render: (_, c) => (
        <Space size={4}>
          {accountLabel(c)}
          {c.aggregated && <Tag color="purple">Aggregated</Tag>}
        </Space>
      ),
    },
    { title: 'Status', dataIndex: 'status', render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    {
      title: 'Scope',
      key: 'scope',
      render: (_, c) => {
        if (c.provider === 'daikin') {
          const n = outdoorUnits([c]).length;
          return n ? `${n} shared outdoor unit${n > 1 ? 's' : ''}` : <Text type="secondary">no shared outdoor units</Text>;
        }
        return (c.scope?.station_codes ?? []).join(', ') || <Text type="secondary">—</Text>;
      },
    },
    { title: 'Enabled', dataIndex: 'enabled', render: (v) => (v === false ? <Tag>Off</Tag> : <Tag color="green">On</Tag>) },
    {
      title: 'Last synced',
      dataIndex: 'last_synced',
      render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : <Text type="secondary">never</Text>),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, c) =>
        c.provider === 'sp_digital' ? (
          <Text type="secondary">Read-only</Text>
        ) : (
          <Space>
            <Button size="small" onClick={() => setModal({ open: true, connection: c })}>
              Edit
            </Button>
            <Popconfirm
              title="Delete this connection?"
              description="Polling stops and eq-ai drops its connection row."
              onConfirm={() => remove.mutate(c.id)}
            >
              <Button size="small" danger loading={remove.isPending && remove.variables === c.id}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <Card
      title="Home connections"
      extra={
        <Button type="primary" disabled={!homeId} onClick={() => setModal({ open: true, connection: null })}>
          New connection
        </Button>
      }
    >
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="Home id"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onSearch={(v) => setHomeId(v.trim())}
          enterButton="Load"
          style={{ width: 420, maxWidth: '100%' }}
        />
      </Space>
      {connections.isError && <Alert type="error" showIcon message={connections.error.message} style={{ marginBottom: 16 }} />}
      <Table
        rowKey="id"
        size="small"
        loading={connections.isLoading && Boolean(homeId)}
        dataSource={rows(connections.data)}
        columns={columns}
        pagination={false}
        locale={{ emptyText: homeId ? 'No connections for this home' : 'Enter a home id' }}
        scroll={{ x: true }}
      />
      <ConnectionModal
        open={modal.open}
        connection={modal.connection}
        homeId={homeId}
        accounts={accounts}
        onClose={() => setModal({ open: false, connection: null })}
      />
    </Card>
  );
}

export default function ConnectionsPage() {
  const accounts = useQuery({
    queryKey: ['provider-accounts'],
    queryFn: () => fetchJson(ACCOUNTS_URL),
  });

  return (
    <App>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Provider connections
          </Title>
          <Text type="secondary">
            Accounts hold vendor credentials (stored encrypted in eq-ai, never in eq-hub). An aggregated
            account is shared across homes; each home connection picks its stations. SP Digital is read-only.
          </Text>
        </div>
        <RequestedConnectionsSection accounts={rows(accounts.data)} />
        <AccountsSection accounts={accounts} />
        <ConnectionsSection accounts={rows(accounts.data)} />
      </Space>
    </App>
  );
}
