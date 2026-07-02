import React, { useState } from 'react';
import { ExportFormat } from '../types';

interface Props {
  database: string;
  table?: string;
  tables?: string[];
  sampleLimit: number;
  onExport: (format: ExportFormat) => void | Promise<void>;
  onClose: () => void;
}

const FORMATS: { format: ExportFormat; name: string; desc: string; icon: string }[] = [
  { format: 'sql', name: 'SQL', desc: '建表语句 + INSERT', icon: '📝' },
  { format: 'json', name: 'JSON', desc: '结构化 JSON', icon: '📦' },
  { format: 'csv', name: 'CSV', desc: '逗号分隔值', icon: '📊' },
  { format: 'markdown', name: 'Markdown', desc: '文档友好', icon: '📄' },
];

const ExportDialog: React.FC<Props> = ({ database, table, tables, sampleLimit, onExport, onClose }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('sql');
  const [exporting, setExporting] = useState(false);

  const tableNames = tables && tables.length > 0 ? tables : table ? [table] : [];
  const isMultiTable = tableNames.length > 1;
  const previewTables = tableNames.slice(0, 6);
  const hiddenCount = Math.max(0, tableNames.length - previewTables.length);

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(selectedFormat);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>📥 导出数据</h3>

        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          {isMultiTable ? (
            <>
              数据库: <strong style={{ color: 'var(--accent)' }}>{database}</strong>
              <span style={{ marginLeft: 16 }}>表数量: <strong>{tableNames.length}</strong></span>
            </>
          ) : (
            <>表: <strong style={{ color: 'var(--accent)' }}>{database}.{tableNames[0]}</strong></>
          )}
          <span style={{ marginLeft: 16 }}>样例行数: <strong>{sampleLimit}</strong></span>
        </div>

        {isMultiTable && (
          <div className="export-table-summary">
            {previewTables.map((name) => (
              <span key={name}>{name}</span>
            ))}
            {hiddenCount > 0 && <span>+{hiddenCount}</span>}
          </div>
        )}

        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          选择导出格式：
        </p>

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

        <div style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 12,
          fontSize: 12,
          color: 'var(--text-muted)',
          marginBottom: 8,
        }}>
          {selectedFormat === 'sql' && '导出内容：CREATE TABLE 建表语句 + 前 N 条数据的 INSERT 语句'}
          {selectedFormat === 'json' && '导出内容：表结构元数据 + 样例数据，格式化的 JSON 文件'}
          {selectedFormat === 'csv' && (isMultiTable ? '导出内容：多个表会在同一个 CSV 文件中按表分块保存' : '导出内容：仅样例数据，CSV 格式（含表头）')}
          {selectedFormat === 'markdown' && '导出内容：表结构表格 + 样例数据表格，Markdown 文档'}
        </div>

        <div className="export-actions">
          <button className="btn" onClick={onClose} disabled={exporting}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting || tableNames.length === 0}>
            {exporting ? '⏳ 导出中...' : '💾 保存文件'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;