import React, { useState, useCallback, useEffect } from 'react';
import { AppView, ConnectionConfig, TableInfo } from './types';
import ConnectionForm from './components/ConnectionForm';
import DatabaseList from './components/DatabaseList';
import TableList from './components/TableList';
import TableDetail from './components/TableDetail';

type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'mysql-sample-export-theme';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('connection');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>('');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const canGoBack = view === 'tables' || view === 'table-detail';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Keep the selected theme for this session when localStorage is unavailable.
    }
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  // 连接数据库
  const handleConnect = useCallback(async (cfg: ConnectionConfig) => {
    setLoading(true);
    setError('');
    try {
      const res = await window.dbApi.connect(cfg);
      if (res.success) {
        setConnected(true);
        setConfig(cfg);
        // 连接成功后加载数据库列表
        const dbRes = await window.dbApi.getDatabases();
        if (dbRes.success && dbRes.data) {
          setDatabases(dbRes.data);
          setView('databases');
        }
      } else {
        setError(res.error || '连接失败');
      }
    } catch (e: any) {
      setError(e.message || '连接出错');
    } finally {
      setLoading(false);
    }
  }, []);

  // 断开连接
  const handleDisconnect = useCallback(async () => {
    await window.dbApi.disconnect();
    setConnected(false);
    setConfig(null);
    setDatabases([]);
    setSelectedDb('');
    setTables([]);
    setSelectedTable('');
    setView('connection');
    setError('');
  }, []);

  // 选择数据库
  const handleSelectDatabase = useCallback(async (db: string) => {
    setLoading(true);
    setError('');
    setSelectedDb(db);
    setSelectedTable('');
    try {
      const res = await window.dbApi.getTables(db);
      if (res.success && res.data) {
        setTables(res.data);
        setView('tables');
      } else {
        setError(res.error || '获取表列表失败');
      }
    } catch (e: any) {
      setError(e.message || '获取表列表出错');
    } finally {
      setLoading(false);
    }
  }, []);

  // 选择表
  const handleSelectTable = useCallback((table: string) => {
    setSelectedTable(table);
    setView('table-detail');
  }, []);

  // 返回已连接工作区内的上一级；数据库列表是根节点，切换连接请使用断开。
  const handleBack = useCallback(() => {
    if (view === 'table-detail') {
      setSelectedTable('');
      setView('tables');
    } else if (view === 'tables') {
      setSelectedDb('');
      setTables([]);
      setView('databases');
    }
  }, [view]);

  const handleOpenWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await window.dbApi.getDatabases();
      if (res.success && res.data) {
        setDatabases(res.data);
        setSelectedDb('');
        setTables([]);
        setSelectedTable('');
        setView('databases');
      } else {
        setError(res.error || '获取数据库列表失败');
      }
    } catch (e: any) {
      setError(e.message || '获取数据库列表出错');
    } finally {
      setLoading(false);
    }
  }, []);

  // 刷新当前视图
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (view === 'databases') {
        const res = await window.dbApi.getDatabases();
        if (res.success && res.data) setDatabases(res.data);
      } else if (view === 'tables' && selectedDb) {
        const res = await window.dbApi.getTables(selectedDb);
        if (res.success && res.data) setTables(res.data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [view, selectedDb]);

  return (
    <div className="app">
      {/* 顶部导航栏 */}
      <header className="app-header">
        <div className="header-left">
          {canGoBack && (
            <button className="btn btn-back" onClick={handleBack} title="返回">
              ← 返回
            </button>
          )}
          <h1 className="app-title">🗄️ MySQL Sample Export</h1>
          {config && (
            <span className="connection-info">
              {config.user}@{config.host}:{config.port}
            </span>
          )}
        </div>
        <div className="header-right">
          <button
            className="btn btn-theme-toggle"
            type="button"
            onClick={handleToggleTheme}
            aria-pressed={theme === 'light'}
            title={theme === 'dark' ? '\u5207\u6362\u5230\u4eae\u8272\u4e3b\u9898' : '\u5207\u6362\u5230\u6697\u8272\u4e3b\u9898'}
          >
            {theme === 'dark' ? '\u2600\ufe0f \u4eae\u8272' : '\ud83c\udf19 \u6697\u8272'}
          </button>
          {connected && (
            <>
              {view !== 'connection' && (
                <button className="btn btn-refresh" onClick={handleRefresh} disabled={loading}>
                  🔄 刷新
                </button>
              )}
              <button className="btn btn-disconnect" onClick={handleDisconnect}>
                🔌 断开连接
              </button>
            </>
          )}
        </div>
      </header>

      {/* 面包屑导航 */}
      {view !== 'connection' && (
        <nav className="breadcrumb">
          <span className={view === 'databases' ? 'active' : ''} onClick={() => { setSelectedDb(''); setTables([]); setSelectedTable(''); setView('databases'); }}>
            📁 数据库列表
          </span>
          {selectedDb && (
            <>
              <span className="separator">›</span>
              <span className={view === 'tables' ? 'active' : ''} onClick={() => { setSelectedTable(''); setView('tables'); }}>
                📂 {selectedDb}
              </span>
            </>
          )}
          {selectedTable && (
            <>
              <span className="separator">›</span>
              <span className="active">📋 {selectedTable}</span>
            </>
          )}
        </nav>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="error-bar">
          <span>❌ {error}</span>
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="loading-bar">
          <div className="spinner" />
          <span>加载中...</span>
        </div>
      )}

      {/* 主内容区 */}
      <main className="app-main">
        {view === 'connection' && (
          <ConnectionForm
            onConnect={handleConnect}
            loading={loading}
            error={error}
            connected={connected}
            currentConnection={config}
            onOpenWorkspace={handleOpenWorkspace}
            onDisconnect={handleDisconnect}
          />
        )}
        {view === 'databases' && (
          <DatabaseList
            databases={databases}
            onSelect={handleSelectDatabase}
            onRefresh={handleRefresh}
            loading={loading}
          />
        )}
        {view === 'tables' && selectedDb && (
          <TableList
            database={selectedDb}
            tables={tables}
            onSelect={handleSelectTable}
            onRefresh={handleRefresh}
            loading={loading}
          />
        )}
        {view === 'table-detail' && selectedDb && selectedTable && (
          <TableDetail
            database={selectedDb}
            table={selectedTable}
            tableInfo={tables.find((item) => item.name === selectedTable)}
            onBack={() => { setSelectedTable(''); setView('tables'); }}
          />
        )}
      </main>

      {/* 底部状态栏 */}
      <footer className="app-footer">
        <span>{connected ? '🟢 已连接' : '🔴 未连接'}</span>
        {config && <span>{config.host}:{config.port}</span>}
      </footer>
    </div>
  );
};

export default App;
