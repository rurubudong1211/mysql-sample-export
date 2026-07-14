import React, { useEffect, useMemo, useState } from 'react';
import { ExportFormat, ExportMode, ExportRequest, ExportTableRule, TableInfo } from '../types';

interface Props {
  database: string;
  table?: string;
  tables?: string[];
  tableInfos?: TableInfo[];
  initialSampleLimit?: number;
  onExport: (request: ExportRequest) => void | Promise<void>;
  onClose: () => void;
}

const DEFAULT_SAMPLE_LIMIT = 10;
const MAX_SAMPLE_LIMIT = 1000;
const FULL_EXPORT_CONFIRM_THRESHOLD = 100_000;

const FORMATS: { format: ExportFormat; name: string; desc: string; icon: string }[] = [
  { format: 'sql', name: 'SQL', desc: '建表语句 + INSERT', icon: '📝' },
  { format: 'json', name: 'JSON', desc: '结构化 JSON', icon: '📦' },
  { format: 'csv', name: 'CSV', desc: '逗号分隔值', icon: '📊' },
  { format: 'markdown', name: 'Markdown', desc: '文档友好', icon: '📄' },
];

const clampSampleLimit = (value: number) => Math.min(MAX_SAMPLE_LIMIT, Math.max(1, value || DEFAULT_SAMPLE_LIMIT));
const formatRows = (rows: number) => rows.toLocaleString();

const ExportDialog: React.FC<Props> = ({
  database,
  table,
  tables,
  tableInfos,
  initialSampleLimit = DEFAULT_SAMPLE_LIMIT,
  onExport,
  onClose,
}) => {
  const tableNames = useMemo(() => (tables && tables.length > 0 ? tables : table ? [table] : []), [table, tables]);
  const tableNamesKey = tableNames.join('\u0000');
  const tableInfoMap = useMemo(() => new Map((tableInfos || []).map((info) => [info.name, info])), [tableInfos]);

  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('sql');
  const [sampleLimit, setSampleLimit] = useState(() => clampSampleLimit(initialSampleLimit));
  const [maskSensitiveData, setMaskSensitiveData] = useState(true);
  const [tableRules, setTableRules] = useState<ExportTableRule[]>(() => (
    tableNames.map((name) => ({ table: name, mode: 'sample' }))
  ));
  const [fullExportConfirmed, setFullExportConfirmed] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setTableRules((previousRules) => {
      const previousModes = new Map(previousRules.map((rule) => [rule.table, rule.mode]));
      return tableNames.map((name) => ({ table: name, mode: previousModes.get(name) || 'sample' }));
    });
  }, [tableNamesKey]);

  const tableRulesKey = tableRules.map((rule) => `${rule.table}:${rule.mode}`).join('|');
  useEffect(() => {
    setFullExportConfirmed(false);
  }, [tableRulesKey]);

  const sampleCount = tableRules.filter((rule) => rule.mode === 'sample').length;
  const fullRules = tableRules.filter((rule) => rule.mode === 'full');
  const fullCount = fullRules.length;
  const isMultiTable = tableNames.length > 1;
  const estimatedFullRows = fullRules.reduce((total, rule) => {
    const rows = tableInfoMap.get(rule.table)?.rows || 0;
    return total + Math.max(0, rows);
  }, 0);
  const fullTableSummaries = fullRules
    .map((rule) => ({ name: rule.table, rows: tableInfoMap.get(rule.table)?.rows || 0 }))
    .sort((left, right) => right.rows - left.rows)
    .slice(0, 4);
  const requiresFullConfirmation = fullCount > 0 && estimatedFullRows > FULL_EXPORT_CONFIRM_THRESHOLD;

  const setAllModes = (mode: ExportMode) => {
    setTableRules((rules) => rules.map((rule) => ({ ...rule, mode })));
  };

  const setTableMode = (tableName: string, mode: ExportMode) => {
    setTableRules((rules) => rules.map((rule) => (rule.table === tableName ? { ...rule, mode } : rule)));
  };

  const handleSampleLimitChange = (value: string) => {
    setSampleLimit(clampSampleLimit(parseInt(value, 10)));
  };

  const handleExport = async () => {
    if (requiresFullConfirmation && !fullExportConfirmed) return;

    setExporting(true);
    try {
      await onExport({
        format: selectedFormat,
        sampleLimit,
        tableRules,
        maskSensitiveData,
      });
    } finally {
      setExporting(false);
    }
  };

  const dataScopeDescription = fullCount === 0
    ? `前 ${sampleLimit} 条样例数据`
    : sampleCount === 0
      ? '全量数据'
      : `${sampleCount} 张 Sample 表 + ${fullCount} 张全量表`;

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog export-dialog-wide" onClick={(e) => e.stopPropagation()}>
        <h3>📥 导出数据</h3>

        <div className="export-overview">
          <div>
            <span>数据库</span>
            <strong>{database}</strong>
          </div>
          <div>
            <span>表数量</span>
            <strong>{tableNames.length}</strong>
          </div>
          <div>
            <span>Sample</span>
            <strong>{sampleCount}</strong>
          </div>
          <div>
            <span>全量</span>
            <strong>{fullCount}</strong>
          </div>
        </div>

        <div className="export-config-row">
          <label className="export-sample-control">
            Sample 行数
            <input
              type="number"
              value={sampleLimit}
              min={1}
              max={MAX_SAMPLE_LIMIT}
              onChange={(event) => handleSampleLimitChange(event.target.value)}
            />
          </label>
          <div className="export-bulk-actions">
            <button type="button" className="btn btn-small" onClick={() => setAllModes('sample')} disabled={exporting || tableRules.length === 0}>
              全部 Sample
            </button>
            <button type="button" className="btn btn-small" onClick={() => setAllModes('full')} disabled={exporting || tableRules.length === 0}>
              全部全量
            </button>
          </div>
          <div className="export-mask-control">
            <span>敏感数据</span>
            <div className="export-mode-toggle" role="group" aria-label="敏感数据导出方式">
              <button
                type="button"
                className={maskSensitiveData ? 'active' : ''}
                onClick={() => setMaskSensitiveData(true)}
                disabled={exporting}
              >
                脱敏（默认）
              </button>
              <button
                type="button"
                className={!maskSensitiveData ? 'active' : ''}
                onClick={() => setMaskSensitiveData(false)}
                disabled={exporting}
              >
                原始数据
              </button>
            </div>
          </div>
        </div>

        <div className="export-rule-list" aria-label="表导出模式">
          {tableRules.map((rule) => {
            const tableInfo = tableInfoMap.get(rule.table);
            return (
              <div className="export-rule-row" key={rule.table}>
                <div className="export-rule-table">
                  <span title={rule.table}>{rule.table}</span>
                  <small>{tableInfo && tableInfo.rows > 0 ? `${formatRows(tableInfo.rows)} 行` : '行数未知'}</small>
                </div>
                <div className="export-mode-toggle" role="group" aria-label={`${rule.table} 导出模式`}>
                  <button
                    type="button"
                    className={rule.mode === 'sample' ? 'active' : ''}
                    onClick={() => setTableMode(rule.table, 'sample')}
                    disabled={exporting}
                  >
                    Sample
                  </button>
                  <button
                    type="button"
                    className={rule.mode === 'full' ? 'active' : ''}
                    onClick={() => setTableMode(rule.table, 'full')}
                    disabled={exporting}
                  >
                    全量
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {requiresFullConfirmation && (
          <div className="export-warning-panel">
            <strong>全量导出确认</strong>
            <p>
              已选择 {fullCount} 张全量表，估算总行数 {formatRows(estimatedFullRows)}，可能生成较大的文件。
            </p>
            <div className="export-warning-tables">
              {fullTableSummaries.map((item) => (
                <span key={item.name}>{item.name}{item.rows > 0 ? ` · ${formatRows(item.rows)} 行` : ''}</span>
              ))}
            </div>
            <label className="export-confirm-check">
              <input
                type="checkbox"
                checked={fullExportConfirmed}
                onChange={(event) => setFullExportConfirmed(event.target.checked)}
              />
              我确认导出这些全量表
            </label>
          </div>
        )}

        <p className="export-section-label">选择导出格式：</p>

        <div className="export-format-selector">
          {FORMATS.map((f) => (
            <div
              key={f.format}
              className={`format-option ${selectedFormat === f.format ? 'selected' : ''}`}
              onClick={() => setSelectedFormat(f.format)}
            >
              <div className="format-name">{f.icon} {f.name}</div>
              <div className="format-desc">{f.desc}</div>
            </div>
          ))}
        </div>

        <div className="export-format-note">
          {selectedFormat === 'sql' && `导出内容：CREATE TABLE + ${dataScopeDescription}，输出 INSERT 语句`}
          {selectedFormat === 'json' && `导出内容：表结构元数据 + ${dataScopeDescription}，输出结构化 JSON`}
          {selectedFormat === 'csv' && (isMultiTable ? `导出内容：表级元数据 + ${dataScopeDescription}，多个表按表分块保存` : `导出内容：表级元数据 + ${dataScopeDescription}，CSV 格式含表头`)}
          {selectedFormat === 'markdown' && `导出内容：表结构表格 + ${dataScopeDescription}，输出数据表格`}
        </div>

        <div className="export-actions">
          <button className="btn" onClick={onClose} disabled={exporting}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={exporting || tableRules.length === 0 || (requiresFullConfirmation && !fullExportConfirmed)}
          >
            {exporting ? '⏳ 导出中...' : '💾 保存文件'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
