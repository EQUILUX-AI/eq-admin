'use client';

import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fetchJson, mutateJson } from '@/lib/api';
import {
  BLOCK_LABELS,
  COMPARE_LABELS,
  EMPTY_LAYOUT,
  TEMPLATES_URL,
  newBlock,
} from '@/lib/reports';

const { Title, Text } = Typography;

// Shared with the dashboard page — the operator's last-viewed home id.
const PREFS_KEY = 'eq.dashboard';

const rows = (data) => (Array.isArray(data) ? data : data?.results ?? []);

/** Up / down / remove controls for one entry of a Form.List. */
function ListControls({ index, count, move, remove, what }) {
  return (
    <Space size={0}>
      <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0}
        onClick={() => move(index, index - 1)} aria-label={`Move ${what} up`} />
      <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === count - 1}
        onClick={() => move(index, index + 1)} aria-label={`Move ${what} down`} />
      <Button size="small" type="text" danger icon={<DeleteOutlined />}
        onClick={() => remove(index)} aria-label={`Remove ${what}`} />
    </Space>
  );
}

/** The fields of one block; which ones show depends on its type. `path` is the
 *  block's absolute form path, `name` the same path relative to its Form.List. */
function BlockFields({ form, path, name, catalog }) {
  const type = Form.useWatch([...path, 'type'], form);
  const metrics = (catalog?.metrics ?? []).map((m) => ({
    value: m.key,
    label: m.unit ? `${m.label} (${m.unit === 'currency' ? 'money' : m.unit})` : m.label,
  }));
  const colors = Object.entries(catalog?.colors ?? {}).map(([value, hex]) => ({
    value,
    label: (
      <Space>
        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: hex }} />
        {value}
      </Space>
    ),
  }));
  const compares = (catalog?.compares ?? []).map((c) => ({ value: c, label: COMPARE_LABELS[c] ?? c }));
  const field = (key) => [...name, key];

  return (
    <>
      <Form.Item label="Block" style={{ marginBottom: 8 }}>
        <Select
          value={type}
          options={(catalog?.block_types ?? []).map((t) => ({ value: t, label: BLOCK_LABELS[t] ?? t }))}
          onChange={(t) => form.setFieldValue(path, newBlock(t, metrics[0]?.value))}
        />
      </Form.Item>
      {type === 'kpi' && (
        <>
          <Form.Item name={field('metric')} label="Metric" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={metrics} />
          </Form.Item>
          <Form.Item name={field('compare')} label="Compare">
            <Select allowClear options={compares} placeholder="No comparison" />
          </Form.Item>
          <Form.Item name={field('label')} label="Label">
            <Input placeholder="Defaults to the metric's name" />
          </Form.Item>
          <Form.Item name={field('caption')} label="Caption">
            <Input />
          </Form.Item>
        </>
      )}
      {type === 'metric_table' && (
        <>
          <Form.Item name={field('metrics')} label="Metrics (rows)" rules={[{ required: true }]}>
            <Select mode="multiple" optionFilterProp="label" options={metrics} />
          </Form.Item>
          <Form.Item name={field('compare')} label="Comparison columns">
            <Select mode="multiple" options={compares} />
          </Form.Item>
        </>
      )}
      {type === 'bar_trend' && (
        <>
          <Form.Item name={field('metric')} label="Metric" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={metrics} />
          </Form.Item>
          <Form.Item name={field('title')} label="Title">
            <Input placeholder="Defaults to the metric's name" />
          </Form.Item>
          <Space>
            <Form.Item name={field('color')} label="Colour">
              <Select style={{ width: 140 }} options={colors} />
            </Form.Item>
            <Form.Item name={field('avg_line')} label="Average line" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </>
      )}
      {type === 'insight' && (
        <>
          <Form.Item name={field('title')} label="Title" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name={field('topic')} label="AI commentary on" rules={[{ required: true }]}>
            <Select options={(catalog?.topics ?? []).map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Space>
            <Form.Item name={field('metric')} label="Mini chart">
              <Select allowClear showSearch optionFilterProp="label" options={metrics}
                placeholder="None" style={{ width: 260 }} />
            </Form.Item>
            <Form.Item name={field('color')} label="Colour">
              <Select style={{ width: 140 }} options={colors} />
            </Form.Item>
          </Space>
        </>
      )}
      {type === 'text' && (
        <>
          <Form.Item
            name={field('text')}
            label="Text"
            rules={[{ required: true }]}
            extra={
              <>
                Insert figures with <code>{'{{energy.consumed}}'}</code> (any metric key) or AI lines with{' '}
                <code>{'{{narrative.headline}}'}</code> / <code>{'{{narrative.drivers}}'}</code>.
              </>
            }
          >
            <Input.TextArea autoSize={{ minRows: 2 }} />
          </Form.Item>
          <Form.Item name={field('style')} label="Style">
            <Select options={(catalog?.text_styles ?? []).map((s) => ({ value: s, label: s }))} />
          </Form.Item>
        </>
      )}
      {type === 'recommendations' && (
        <>
          <Form.Item name={field('intro')} label="Intro">
            <Input />
          </Form.Item>
          <Form.Item name={field('max')} label="Max items">
            <InputNumber min={1} max={8} />
          </Form.Item>
        </>
      )}
    </>
  );
}

/** Build a template: sections of rows of columns (12-column grid), one block per
 *  column, with a live preview against a real home. The preview is the exact
 *  HTML the PDF is printed from. */
export default function ReportTemplateEditor() {
  const { id } = useParams();
  const creating = id === 'new';
  const router = useRouter();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [layoutErrors, setLayoutErrors] = useState([]);
  const [previewHome, setPreviewHome] = useState('');
  const [previewMonth, setPreviewMonth] = useState(dayjs().subtract(1, 'month').format('YYYY-MM'));
  const [narrate, setNarrate] = useState(false);

  const catalog = useQuery({ queryKey: ['report-catalog'], queryFn: () => fetchJson(`${TEMPLATES_URL}/catalog`) });
  const template = useQuery({
    queryKey: ['report-template', id],
    queryFn: () => fetchJson(`${TEMPLATES_URL}/${id}`),
    enabled: !creating,
  });
  const homes = useQuery({ queryKey: ['admin-homes'], queryFn: () => fetchJson('/api/hub/admin/homes?page_size=200') });

  useEffect(() => {
    if (creating) {
      form.setFieldsValue({ name: '', description: '', published: false, is_default: false, layout: EMPTY_LAYOUT });
    } else if (template.data) {
      form.setFieldsValue(template.data);
    }
  }, [creating, template.data, form]);

  useEffect(() => {
    try {
      setPreviewHome(JSON.parse(localStorage.getItem(PREFS_KEY))?.homeId || '');
    } catch {
      setPreviewHome('');
    }
  }, []);

  const save = useMutation({
    mutationFn: (body) =>
      creating ? mutateJson(TEMPLATES_URL, 'POST', body) : mutateJson(`${TEMPLATES_URL}/${id}`, 'PATCH', body),
    onSuccess: (saved) => {
      setLayoutErrors([]);
      message.success('Template saved');
      queryClient.invalidateQueries({ queryKey: ['report-templates'] });
      queryClient.setQueryData(['report-template', saved.id], saved);
      if (creating) router.replace(`/dashboard/report-templates/${saved.id}`);
    },
    onError: (e) => {
      setLayoutErrors([].concat(e.fields?.layout ?? []));
      message.error(e.fields?.layout ? 'The layout has problems — see the list above.' : e.message);
    },
  });

  const preview = useMutation({
    mutationFn: () =>
      mutateJson(`${TEMPLATES_URL}/preview`, 'POST', {
        layout: form.getFieldValue('layout'),
        home_id: previewHome,
        month: previewMonth,
        narrate,
      }),
    onSuccess: () => setLayoutErrors([]),
    onError: (e) => {
      setLayoutErrors([].concat(e.fields?.layout ?? []));
      if (!e.fields?.layout) message.error(e.message);
    },
  });

  // The whole store, not just registered fields: a block's `type` is set by the
  // type picker rather than a Form.Item, and onFinish's values would drop it.
  const onFinish = () => {
    const values = form.getFieldsValue(true);
    save.mutate({
      name: values.name,
      description: values.description ?? '',
      published: Boolean(values.published),
      is_default: Boolean(values.is_default),
      layout: values.layout,
    });
  };

  const homeOptions = rows(homes.data).map((h) => ({ value: h.id, label: h.name || h.id }));

  return (
    <Row gutter={16} align="top">
      <Col xs={24} xl={13}>
        <Card>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
            <Title level={4} style={{ margin: 0 }}>
              {creating ? 'New report template' : 'Edit report template'}
            </Title>
            <Space>
              <Button onClick={() => router.push('/dashboard/report-templates')}>Back</Button>
              <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>
                Save
              </Button>
            </Space>
          </Space>
          {catalog.isError && <Alert type="error" showIcon message={`Metric catalog unavailable: ${catalog.error.message}`} />}
          {layoutErrors.length > 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message="Layout problems"
              description={<ul style={{ margin: 0, paddingLeft: 18 }}>{layoutErrors.map((e) => <li key={e}>{e}</li>)}</ul>}
            />
          )}
          <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Row gutter={12}>
              <Col span={14}>
                <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="published" label="Published" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name="is_default" label="Default" valuePropName="checked"
                  tooltip="Frozen monthly and announced by push. Only one template is the default.">
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="Description">
              <Input />
            </Form.Item>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name={['layout', 'title']} label="Statement title">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name={['layout', 'footer']} label="Footer">
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Form.List name={['layout', 'sections']}>
              {(sections, { add: addSection, remove: removeSection, move: moveSection }) => (
                <>
                  {sections.map((s, si) => (
                    <Card
                      key={s.key}
                      size="small"
                      style={{ marginBottom: 12, background: '#fafafa' }}
                      title={
                        <Form.Item name={[s.name, 'title']} noStyle>
                          <Input placeholder={`Section ${si + 1} title`} variant="borderless"
                            style={{ fontWeight: 600, paddingLeft: 0 }} />
                        </Form.Item>
                      }
                      extra={<ListControls index={si} count={sections.length} move={moveSection}
                        remove={removeSection} what="section" />}
                    >
                      <Form.List name={[s.name, 'rows']}>
                        {(rowFields, { add: addRow, remove: removeRow, move: moveRow }) => (
                          <>
                            {rowFields.map((r, ri) => (
                              <Card key={r.key} size="small" style={{ marginBottom: 8 }}
                                title={<Text type="secondary">Row {ri + 1}</Text>}
                                extra={<ListControls index={ri} count={rowFields.length} move={moveRow}
                                  remove={removeRow} what="row" />}>
                                <Form.List name={[r.name, 'cols']}>
                                  {(colFields, { add: addCol, remove: removeCol, move: moveCol }) => (
                                    <Row gutter={8}>
                                      {colFields.map((c, ci) => {
                                        const path = ['layout', 'sections', s.name, 'rows', r.name, 'cols', c.name];
                                        return (
                                          <Col key={c.key} xs={24} md={colFields.length > 1 ? 12 : 24}>
                                            <Card size="small" style={{ marginBottom: 8 }}
                                              title={
                                                <Space>
                                                  <Text type="secondary">Column {ci + 1} · span</Text>
                                                  <Form.Item name={[c.name, 'span']} noStyle>
                                                    <InputNumber size="small" min={1} max={12} style={{ width: 64 }} />
                                                  </Form.Item>
                                                  <Text type="secondary">/ 12</Text>
                                                </Space>
                                              }
                                              extra={<ListControls index={ci} count={colFields.length}
                                                move={moveCol} remove={removeCol} what="column" />}>
                                              <BlockFields form={form} path={[...path, 'block']}
                                                name={[c.name, 'block']} catalog={catalog.data} />
                                            </Card>
                                          </Col>
                                        );
                                      })}
                                      <Col span={24}>
                                        <Button size="small" icon={<PlusOutlined />}
                                          disabled={colFields.length >= 4}
                                          onClick={() => addCol({ span: 6, block: newBlock('text') })}>
                                          Column
                                        </Button>
                                      </Col>
                                    </Row>
                                  )}
                                </Form.List>
                              </Card>
                            ))}
                            <Button size="small" icon={<PlusOutlined />}
                              onClick={() => addRow({ cols: [{ span: 12, block: newBlock('text') }] })}>
                              Row
                            </Button>
                          </>
                        )}
                      </Form.List>
                    </Card>
                  ))}
                  <Button block type="dashed" icon={<PlusOutlined />}
                    onClick={() => addSection({ title: 'New section', rows: [{ cols: [{ span: 12, block: newBlock('text') }] }] })}>
                    Add section
                  </Button>
                </>
              )}
            </Form.List>
          </Form>
        </Card>
      </Col>

      <Col xs={24} xl={11}>
        <Card
          style={{ position: 'sticky', top: 16 }}
          title="Preview"
          extra={
            <Button icon={<EyeOutlined />} loading={preview.isPending} disabled={!previewHome}
              onClick={() => preview.mutate()}>
              Refresh
            </Button>
          }
        >
          <Space wrap style={{ marginBottom: 12 }}>
            <Select showSearch optionFilterProp="label" style={{ width: 220 }} placeholder="Home"
              value={previewHome || undefined} onChange={setPreviewHome} options={homeOptions}
              loading={homes.isLoading} />
            <Input style={{ width: 110 }} value={previewMonth} onChange={(e) => setPreviewMonth(e.target.value)}
              placeholder="YYYY-MM" />
            <Space size={4}>
              <Switch size="small" checked={narrate} onChange={setNarrate} />
              <Text type="secondary">AI commentary</Text>
            </Space>
          </Space>
          {preview.data?.html ? (
            <iframe
              title="Statement preview"
              srcDoc={preview.data.html}
              sandbox=""
              style={{ width: '100%', height: 1100, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff' }}
            />
          ) : (
            <Empty description="Pick a home and refresh to preview this layout with its live data. Unsaved changes are included." />
          )}
          {!narrate && preview.data && (
            <Text type="secondary">
              AI commentary is off, so insight and recommendation blocks are hidden. Turn it on to preview them (slower).
            </Text>
          )}
        </Card>
      </Col>
    </Row>
  );
}
