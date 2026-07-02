import React, { useState, useEffect, useCallback } from 'react';
import { ColumnInfo, ExportFormat } from '../types';
import ExportDialog from './ExportDialog';

interface Props {
  database: string;
  table: string;
  onBack: () => void;
}

type TabType = 'structure' | 'data' | 'create-sql';

const TableDetail: React.FC<Props> = ({ database, table, onBack }) => {
  const [activeTab, setActiveTab] = useState<TabType>('structure');
  const [structure, setStructure] = useState<ColumnInfo[]>([]);
  const [sampleData, setSampleData] = useState<{ columns: string[]; rows: any[][] }>({ columns: [], rows: [] });
  const [createSQL, setCreateSQL] = useState('');
  const [sampleLimit, setSampleLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showExport, setShowExport] = useState(false);

  // 加载表结构
  const loadStructure = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await window.dbApi.getTableStructure(database, table);
      if (res.success && res.data) {
        setStructure(res.data);
      } else {
        setError(res.error || '获取表结构失败');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [database, table]);

  // 加载样例数据
  const loadSampleData = useCallback(async (limit: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await window.dbApi.getSampleData(database, table, limit);
      if (res.success && res.data) {
        setSampleData(res.data);
      } else {
        setError(res.error || '获取数据失败');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [database, table]);

  // 加载建表语句
  const loadCreateSQL = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await window.dbApi.getCreateTable(database, table);
      if (res.success && res.data) {
        setCreateSQL(res.data);
      } else {
        setError(res.error || '获取建表语句失败');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [database, table]);

  // 切换 Tab 时加载对应数据
  useEffect(() => {
    if (activeTab === 'structure') {
      loadStructure();
    } else if (activeTab === 'data') {
      loadSampleData(sampleLimit);
    } else if (activeTab === 'create-sql') {
      loadCreateSQL();
    }
  }, [activeTab, sampleLimit]);

  // 导出处理
  const handleExport = async (format: ExportFormat) => {
    try {
      const defaultExt = format === 'sql' ? 'sql' : format === 'json' ? 'json' : format === 'csv' ? 'csv' : 'md';
      const dialogResult = await window.dbApi.saveFileDialog({
        defaultName: `${database}_${table}.${defaultExt}`,
        filters: [{
          name: format.toUpperCase(),
          extensions: [defaultExt],
        }],
      });

      if (dialogResult.canceled || !dialogResult.filePath) return;

      const res = await window.dbApi.exportData({
        database,
        table,
        format,
        sampleLimit,
        filePath: dialogResult.filePath,
      });

      if (res.success) {
        alert(`导出成功！\n文件已保存到: ${dialogResult.filePath}`);
        setShowExport(false);
      } else {
        setError(res.error || '导出失败');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="table-detail-page">
      {/* 标题和操作 */}
      <div className="detail-header">
        <h2>
          📋 {database}.{table}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setShowExport(true)}>
            📥 导出
          </button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="detail-tabs">
        <button
          className={`tab-btn ${activeTab === 'structure' ? 'active' : ''}`}
          onClick={() => setActiveTab('structure')}
        >
          🏗️ 表结构
        </button>
        <button
          className={`tab-btn ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          📊 样例数据
        </button>
        <button
          className={`tab-btn ${activeTab === 'create-sql' ? 'active' : ''}`}
          onClick={() => setActiveTab('create-sql')}
        >
          📝 建表语句
        </button>
      </div>

      {/* 加载/错误状态 */}
      {loading && (
        <div className="loading-bar">
          <div className="spinner" />
          <span>加载中...</span>
        </div>
      )}
      {error && (
        <div className="error-bar">
          <span>❌ {error}</span>
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* 表结构 Tab */}
      {activeTab === 'structure' && !loading && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>字段名</th>
                <th>类型</th>
                <th>允许为空</th>
                <th>键</th>
                <th>默认值</th>
                <th>额外</th>
                <th>注释</th>
              </tr>
            </thead>
            <tbody>
              {structure.map((col, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {col.Field}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{col.Type}</td>
                  <td>{col.Null === 'YES' ? '✅ YES' : '❌ NO'}</td>
                  <td>
                    {col.Key === 'PRI' && <span className="key-badge">PRI</span>}
                    {col.Key === 'UNI' && <span className="key-badge">UNI</span>}
                    {col.Key === 'MUL' && <span className="key-badge">MUL</span>}
                    {!col.Key && '-'}
                  </td>
                  <td>
                    {col.Default === null || col.Default === undefined ? (
                      <span className="null-value">NULL</span>
                    ) : (
                      String(col.Default)
                    )}
                  </td>
                  <td>{col.Extra || '-'}</td>
                  <td>{col.Comment || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {structure.length === 0 && !loading && (
            <div className="empty-state">
              <p>无表结构信息</p>
            </div>
          )}
        </div>
      )}

      {/* 样例数据 Tab */}
      {activeTab === 'data' && !loading && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>显示行数:</label>
            <input
              type="number"
              value={sampleLimit}
              min={1}
              max={1000}
              onChange={(e) => {
                const val = Math.min(1000, Math.max(1, parseInt(e.target.value) || 1));
                setSampleLimit(val);
              }}
              style={{
                width: 80,
                padding: '6px 10px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
            <button className="btn btn-small" onClick={() => loadSampleData(sampleLimit)}>
              🔍 查询
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              共 {sampleData.rows.length} 条
            </span>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  {sampleData.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={sampleData.columns.length + 1} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  sampleData.rows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{i + 1}</td>
                      {row.map((val, j) => (
                        <td key={j}>
                          {val === null ? (
                            <span className="null-value">NULL</span>
                          ) : (
                            String(val)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 建表语句 Tab */}
      {activeTab === 'create-sql' && !loading && (
        <div style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 16,
          overflow: 'auto',
          maxHeight: 500,
        }}>
          {createSQL ? (
            <pre style={{
              fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
              fontSize: 13,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}>
              {createSQL}
            </pre>
          ) : (
            <div className="empty-state">
              <p>无法获取建表语句</p>
            </div>
          )}
        </div>
      )}

      {/* 导出对话框 */}
      {showExport && (
        <ExportDialog
          database={database}
          table={table}
          sampleLimit={sampleLimit}
          onExport={handleExport}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
};

export default TableDetail;
