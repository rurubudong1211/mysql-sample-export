import React, { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  databases: string[];
  onSelect: (db: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

const DatabaseList: React.FC<Props> = ({ databases, onSelect, onRefresh, loading }) => {
  const [searchText, setSearchText] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const keyword = searchText.trim().toLowerCase();
  const filteredDatabases = useMemo(() => {
    if (!keyword) return databases;
    return databases.filter((db) => db.toLowerCase().includes(keyword));
  }, [databases, keyword]);

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

  return (
    <div className="database-page">
      <div className="list-header">
        <div className="list-title-group">
          <h2>数据库列表</h2>
          <span className="list-count">
            {keyword ? `${filteredDatabases.length} / ${databases.length} 个数据库` : `${databases.length} 个数据库`}
          </span>
        </div>
        <div className="database-search-bar">
          <span className="search-icon">🔎</span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchText}
            placeholder="搜索数据库"
            onChange={(e) => setSearchText(e.target.value)}
          />
          {searchText && (
            <button type="button" onClick={() => setSearchText('')} title="清空搜索">
              ✕
            </button>
          )}
        </div>
      </div>

      {loading && databases.length === 0 ? (
        <div className="empty-state">
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p>正在加载数据库列表...</p>
        </div>
      ) : databases.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📭</div>
          <p>未发现数据库</p>
          <button className="btn" onClick={onRefresh} style={{ marginTop: 12 }}>
            🔄 刷新
          </button>
        </div>
      ) : filteredDatabases.length === 0 ? (
        <div className="empty-state compact-empty-state">
          <div className="icon">🔎</div>
          <p>没有匹配的数据库</p>
          <button className="btn" onClick={() => setSearchText('')} style={{ marginTop: 12 }}>
            清空搜索
          </button>
        </div>
      ) : (
        <div className="object-list">
          <div className="object-row object-row-header">
            <span className="obj-icon"></span>
            <span className="obj-name">名称</span>
            <span className="obj-arrow"></span>
          </div>
          {filteredDatabases.map((db) => (
            <div key={db} className="object-row" onClick={() => onSelect(db)}>
              <span className="obj-icon">🗄️</span>
              <span className="obj-name">{db}</span>
              <span className="obj-arrow">›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DatabaseList;