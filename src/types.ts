// 全局类型声明 - 不跨项目引用

export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface ColumnInfo {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
  Comment?: string;
}

export interface TableInfo {
  name: string;
  type: string;
  rows: number;
}

export interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  ssl: boolean;
}

export interface ExportOptions {
  database: string;
  table?: string;
  tables?: string[];
  format: ExportFormat;
  sampleLimit: number;
  filePath: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SampleDataResult {
  columns: string[];
  rows: any[][];
}

export type ExportFormat = 'sql' | 'json' | 'csv' | 'markdown';

export type AppView = 'connection' | 'databases' | 'tables' | 'table-detail';

// 全局 window.dbApi 声明
declare global {
  interface Window {
    dbApi: {
      connect: (config: ConnectionConfig) => Promise<ApiResponse>;
      disconnect: () => Promise<ApiResponse>;
      getDatabases: () => Promise<ApiResponse<string[]>>;
      getTables: (database: string) => Promise<ApiResponse<TableInfo[]>>;
      getTableStructure: (database: string, table: string) => Promise<ApiResponse<ColumnInfo[]>>;
      getSampleData: (database: string, table: string, limit: number) => Promise<ApiResponse<SampleDataResult>>;
      getCreateTable: (database: string, table: string) => Promise<ApiResponse<string>>;
      exportData: (options: ExportOptions) => Promise<ApiResponse>;
      saveFileDialog: (options: { defaultName: string; filters: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; filePath?: string }>;
      listConnections: () => Promise<ApiResponse<SavedConnection[]>>;
      saveConnection: (item: { id?: string; name: string; host: string; port: number; user: string; password: string; ssl: boolean }) => Promise<ApiResponse<SavedConnection>>;
      deleteConnection: (id: string) => Promise<ApiResponse<boolean>>;
    };
  }
}

export {};
