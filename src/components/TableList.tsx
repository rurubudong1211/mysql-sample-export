import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExportFormat, ExportRequest, TableInfo } from '../types';
import ExportDialog from './ExportDialog';

interface Props {
  database: string;
  tables: TableInfo[];
  onSelect: (table: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

const getDefaultExtension = (format: ExportFormat) => {
  if (format === 'markdown') return 'md';
  return format;
};

const sanitizeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_');

const TableList: React.FC<Props> = ({ database, tables, onSelect, onRefresh, loading }) => {
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showExport, setShowExport] = useState(false);
  const [error, setError] = useState('');

  const keyword = searchText.trim().toLowerCase();
  const tableNames = useMemo(() => tables.map((table) => table.name), [tables]);
  const tableInfoMap = useMemo(() => new Map(tables.map((table) => [table.name, table])), [tables]);
  const filteredTables = useMemo(() => {
    if (!keyword) return tables;
    return tables.filter((table) => table.name.toLowerCase().includes(keyword));
  }, [tables, keyword]);
  const filteredTableNames = useMemo(() => filteredTables.map((table) => table.name), [filteredTables]);
  const selectedSet = useMemo(() => new Set(selectedTables), [selectedTables]);
  const selectedTableInfos = useMemo(() => (
    selectedTables
      .map((name) => tableInfoMap.get(name))
      .filter((table): table is TableInfo => Boolean(table))
  ), [selectedTables, tableInfoMap]);
  const selectedVisibleCount = filteredTableNames.filter((name) => selectedSet.has(name)).length;
  const allVisibleSelected = filteredTableNames.length > 0 && selectedVisibleCount === filteredTableNames.length;
  const partiallyVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  useEffect(() => {
    const available = new Set(tableNames);
    setSelectedTables((prev) => prev.filter((name) => available.has(name)));
  }, [tableNames]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f') return;

      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleVisible = () => {
    if (filteredTableNames.length === 0) return;

    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredTableNames.forEach((name) => next.delete(name));
      } else {
        filteredTableNames.forEach((name) => next.add(name));
      }
      return Array.from(next);
    });
  };

  const handleToggleTable = (table: string) => {
    setSelectedTables((prev) => (
      prev.includes(table)
        ? prev.filter((item) => item !== table)
        : [...prev, table]
    ));
  };

  const handleExport = async ({ format, sampleLimit, tableRules }: ExportRequest) => {
    if (selectedTables.length === 0) {
      setError('请先选择要导出的表');
      return;
    }

    try {
      const selectedNames = new Set(selectedTables);
      const exportRules = tableRules
        .filter((rule) => rule.table && rule.table !== 'undefined' && rule.table !== 'null' && selectedNames.has(rule.table));
      const exportTables = exportRules.map((rule) => rule.table);
      if (exportTables.length === 0) {
        setError('没有有效的表可导出，请重新选择');
        return;
      }

      const defaultExt = getDefaultExtension(format);
      const defaultName = exportTables.length === 1
        ? `${sanitizeFileName(database)}_${sanitizeFileName(exportTables[0])}.${defaultExt}`
        : `${sanitizeFileName(database)}_${exportTables.length}_tables.${defaultExt}`;
      const dialogResult = await window.dbApi.saveFileDialog({
        defaultName,
        filters: [{
          name: format.toUpperCase(),
          extensions: [defaultExt],
        }],
      });

      if (dialogResult.canceled || !dialogResult.filePath) return;

      const res = await window.dbApi.exportData({
        database,
        table: exportTables[0],
        tables: exportTables,
        tableRules: exportRules,
        format,
        sampleLimit,
        filePath: dialogResult.filePath,
      });

      if (res.success) {
        const fullCount = exportRules.filter((rule) => rule.mode === 'full').length;
        alert(`导出成功：${exportTables.length} 个表（Sample ${exportTables.length - fullCount} / 全量 ${fullCount}）\n文件已保存到: ${dialogResult.filePath}`);
        setShowExport(false);
      } else {
        setError(res.error || '导出失败');
      }
    } catch (e: any) {
      setError(e.message || '导出出错');
    }
  };

  return (
    <div className="table-page">
      <div className="list-header">
        <div className="list-title-group">
          <h2>{database}</h2>
          <span className="list-count">
            {keyword ? `${filteredTables.length} / ${tables.length} 个对象` : `${tables.length} 个对象`}
            {selectedTables.length > 0 ? ` / 已选 ${selectedTables.length}` : ''}
          </span>
        </div>
        <div className="table-actions">
          <div className="database-search-bar table-search-bar">
            <span className="search-icon">🔎</span>
            <input
              ref={searchInputRef}
              type="search"
              value={searchText}
              placeholder="搜索表名"
              onChange={(e) => setSearchText(e.target.value)}
            />
            {searchText && (
              <button type="button" onClick={() => setSearchText('')} title="清空搜索">
                ✕
              </button>
            )}
          </div>
          <button className="btn" onClick={() => setSelectedTables([])} disabled={selectedTables.length === 0}>
            清空选择
          </button>
          <button className="btn btn-primary" onClick={() => setShowExport(true)} disabled={selectedTables.length === 0}>
            📥 导出选中
          </button>
        </div>
      </div>

      {error && (
        <div className="error-bar table-error">
          <span>❌ {error}</span>
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {loading && tables.length === 0 ? (
        <div className="empty-state">
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p>正在加载表列表...</p>
        </div>
      ) : tables.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div>
          <p>该数据库中没有表</p>
          <button className="btn" onClick={onRefresh} style={{ marginTop: 12 }}>
            🔄 刷新
          </button>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="empty-state compact-empty-state">
          <div className="icon">🔎</div>
          <p>没有匹配的表</p>
          <button className="btn" onClick={() => setSearchText('')} style={{ marginTop: 12 }}>
            清空搜索
          </button>
        </div>
      ) : (
        <div className="object-list">
          {/* 表头 */}
          <div className="object-row object-row-header">
            <span className="obj-check">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={(input) => {
                  if (input) input.indeterminate = partiallyVisibleSelected;
                }}
                onChange={handleToggleVisible}
                aria-label={keyword ? '选择当前搜索结果中的表' : '全选表'}
              />
            </span>
            <span className="obj-icon"></span>
            <span className="obj-name">名称</span>
            <span className="obj-type">类型</span>
            <span className="obj-rows">行数</span>
          </div>
          {filteredTables.map((table) => {
            const selected = selectedSet.has(table.name);
            return (
              <div
                key={table.name}
                className={`object-row ${selected ? 'selected' : ''}`}
                onClick={() => onSelect(table.name)}
              >
                <span className="obj-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => handleToggleTable(table.name)}
                    aria-label={`选择 ${table.name}`}
                  />
                </span>
                <span className="obj-icon">{table.type === 'VIEW' ? '👁️' : '📋'}</span>
                <span className="obj-name">{table.name}</span>
                <span className="obj-type">
                  <span className={`type-badge ${table.type === 'VIEW' ? 'type-view' : 'type-table'}`}>
                    {table.type === 'VIEW' ? '视图' : '表'}
                  </span>
                </span>
                <span className="obj-rows">
                  {table.rows > 0 ? table.rows.toLocaleString() : '-'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {showExport && (
        <ExportDialog
          database={database}
          tables={selectedTables}
          tableInfos={selectedTableInfos}
          initialSampleLimit={10}
          onExport={handleExport}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
};

export default TableList;