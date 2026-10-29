/** Report templates (eq-hub `reports/`): shared by the list and the editor. */

export const TEMPLATES_URL = '/api/hub/admin/report-templates';

// What each block type is for, shown in the editor's type picker.
export const BLOCK_LABELS = {
  kpi: 'KPI tile',
  metric_table: 'Metric table',
  bar_trend: 'Monthly bar trend',
  insight: 'Insight (AI text + mini chart)',
  text: 'Text',
  recommendations: 'Recommendations (AI)',
  value_hero: 'Savings headline (solar vs Equilux)',
  bill_compare: 'Bill with vs without solar',
  automations: 'What automations saved',
  suggestions: 'Priced suggestions',
};

export const COMPARE_LABELS = { prev: 'vs previous month', avg: 'vs average of earlier months' };

/** A sensible starting block for each type, so switching type never leaves a
 *  block the server rejects for a missing field. */
export function newBlock(type, firstMetric) {
  switch (type) {
    case 'kpi':
      return { type, metric: firstMetric, compare: 'avg' };
    case 'metric_table':
      return { type, metrics: [firstMetric], compare: ['prev', 'avg'] };
    case 'bar_trend':
      return { type, metric: firstMetric, avg_line: true, color: 'teal' };
    case 'insight':
      return { type, topic: 'energy', title: 'Insight', color: 'teal' };
    case 'recommendations':
      return { type, max: 4, intro: '' };
    // Owner-value blocks have no settings: they show eq-ai's value figures.
    case 'value_hero':
    case 'bill_compare':
    case 'automations':
    case 'suggestions':
      return { type };
    default:
      return { type: 'text', text: 'Text', style: 'body' };
  }
}

export const EMPTY_LAYOUT = {
  title: 'New statement',
  footer: '',
  sections: [{ title: 'Summary', rows: [{ cols: [{ span: 12, block: newBlock('text') }] }] }],
};
