import React, { useState, useEffect } from 'react';
import { ConnectionConfig, SavedConnection } from '../types';

interface Props {
  onConnect: (config: ConnectionConfig) => void;
  loading: boolean;
  error: string;
  connected?: boolean;
  currentConnection?: ConnectionConfig | null;
  onOpenWorkspace?: () => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
}

const ConnectionForm: React.FC<Props> = ({
  onConnect,
  loading,
  error,
  connected = false,
  currentConnection,
  onOpenWorkspace,
  onDisconnect,
}) => {
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('3306');
  const [user, setUser] = useState('root');
  const [password, setPassword] = useState('');
  const [ssl, setSsl] = useState(false);
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [editingName, setEditingName] = useState('');
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const currentConnectionLabel = currentConnection
    ? currentConnection.user + '@' + currentConnection.host + ':' + currentConnection.port
    : '';

  // 加载已保存的连接列表
  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const res = await window.dbApi.listConnections();
      if (res.success && res.data) {
        setSavedConnections(res.data);
      }
    } catch {
      // 忽略加载失败
    }
  };

  // 选择已保存的连接自动填充
  const handleSelectSaved = (id: string) => {
    setSelectedId(id);
    if (id === '') {
      // 重置为默认值
      setHost('localhost');
      setPort('3306');
      setUser('root');
      setPassword('');
      setSsl(false);
      return;
    }
    const conn = savedConnections.find((c) => c.id === id);
    if (conn) {
      setHost(conn.host);
      setPort(String(conn.port));
      setUser(conn.user);
      setPassword(conn.password);
      setSsl(conn.ssl);
    }
  };

  // 保存当前连接
  const handleSave = async () => {
    if (!editingName.trim()) return;

    // 如果名称和已选连接完全一致 → 更新；否则 → 另存为新连接
    const existing = selectedId ? savedConnections.find((c) => c.id === selectedId) : null;
    const isUpdate = existing && editingName.trim() === existing.name;

    try {
      const res = await window.dbApi.saveConnection({
        id: isUpdate ? selectedId : undefined,
        name: editingName.trim(),
        host: host.trim() || 'localhost',
        port: parseInt(port) || 3306,
        user: user.trim() || 'root',
        password,
        ssl,
      });
      if (res.success) {
        await loadConnections();
        if (res.data) {
          setSelectedId(res.data.id);
        }
        setShowSavePrompt(false);
        setEditingName('');
      }
    } catch {
      // 忽略
    }
  };

  // 删除已保存的连接
  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await window.dbApi.deleteConnection(selectedId);
      setSelectedId('');
      await loadConnections();
    } catch {
      // 忽略
    }
  };

  // 点击保存按钮 — 始终弹出命名弹窗
  const handleSaveClick = () => {
    if (selectedId) {
      // 更新已有连接：预填原名称
      const existing = savedConnections.find((c) => c.id === selectedId);
      setEditingName(existing?.name || `${user}@${host}:${port}`);
    } else {
      // 新连接：给默认名
      setEditingName(`${user}@${host}:${port}`);
    }
    setShowSavePrompt(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect({
      host: host.trim() || 'localhost',
      port: parseInt(port) || 3306,
      user: user.trim() || 'root',
      password,
      ssl,
    });
  };

  if (connected && currentConnection) {
    return (
      <div className="connection-page">
        <div className="connection-card connection-session-card">
          <h2>🟢 当前连接</h2>
          <p className="subtitle">当前会话仍在运行，数据库列表是已连接后的起始页。</p>
          <div className="current-connection-panel">
            <div className="current-connection-title">
              <span className="status-dot" />
              <span>已连接到</span>
            </div>
            <div className="current-connection-label">{currentConnectionLabel}</div>
            <div className="current-connection-meta">
              {currentConnection.ssl ? 'SSL 连接已启用' : '未启用 SSL'}
            </div>
          </div>
          <div className="current-connection-actions">
            <button type="button" className="btn btn-primary" onClick={onOpenWorkspace} disabled={loading}>
              {loading ? '正在进入...' : '进入数据库列表'}
            </button>
            <button type="button" className="btn" onClick={onDisconnect} disabled={loading}>
              断开并重新连接
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="connection-page">
      <div className="connection-card">
        <h2>🔗 连接 MySQL 数据库</h2>
        <p className="subtitle">请输入数据库连接信息，或选择已保存的连接</p>

        {/* 已保存连接选择器 */}
        {savedConnections.length > 0 && (
          <div className="form-group">
            <label>已保存的连接</label>
            <div className="saved-selector-row">
              <select
                value={selectedId}
                onChange={(e) => handleSelectSaved(e.target.value)}
                className="saved-select"
              >
                <option value="">-- 选择已保存的连接 --</option>
                {savedConnections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {selectedId && (
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={handleDelete}
                  title="删除此连接"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>主机地址</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="localhost"
              />
            </div>
            <div className="form-group">
              <label>端口</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="3306"
              />
            </div>
          </div>

          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="root"
            />
          </div>

          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>

          <div className="form-check">
            <input
              type="checkbox"
              id="ssl"
              checked={ssl}
              onChange={(e) => setSsl(e.target.checked)}
            />
            <label htmlFor="ssl">使用 SSL 连接</label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '⏳ 连接中...' : '🔗 连接数据库'}
            </button>
            <button
              type="button"
              className="btn btn-save"
              onClick={handleSaveClick}
              title="保存当前连接信息以便下次使用"
            >
              💾 保存连接
            </button>
          </div>

          {error && <div className="form-error">{error}</div>}
        </form>

        {/* 保存连接命名弹窗 */}
        {showSavePrompt && (
          <div className="save-prompt-overlay" onClick={() => setShowSavePrompt(false)}>
            <div className="save-prompt" onClick={(e) => e.stopPropagation()}>
              <h4>💾 保存连接</h4>
              <p className="save-prompt-desc">为这个连接起一个名字，方便下次识别：</p>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder="例如：生产环境 / 本地开发"
                className="save-prompt-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setShowSavePrompt(false);
                }}
              />
              <div className="save-prompt-actions">
                <button className="btn" onClick={() => setShowSavePrompt(false)}>取消</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={!editingName.trim()}>
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionForm;
