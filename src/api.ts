import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import {
  ApiResponse,
  ColumnInfo,
  ConnectionConfig,
  ExportOptions,
  SampleDataResult,
  SavedConnection,
  TableInfo,
} from './types';

type SaveFileOptions = {
  defaultName: string;
  filters: Array<{ name: string; extensions: string[] }>;
};

const api = {
  connect: (config: ConnectionConfig): Promise<ApiResponse> =>
    invoke('connect', { config }),

  disconnect: (): Promise<ApiResponse> =>
    invoke('disconnect'),

  getDatabases: (): Promise<ApiResponse<string[]>> =>
    invoke('get_databases'),

  getTables: (database: string): Promise<ApiResponse<TableInfo[]>> =>
    invoke('get_tables', { database }),

  getTableStructure: (database: string, table: string): Promise<ApiResponse<ColumnInfo[]>> =>
    invoke('get_table_structure', { database, table }),

  getSampleData: (database: string, table: string, limit: number): Promise<ApiResponse<SampleDataResult>> =>
    invoke('get_sample_data', { database, table, limit }),

  getCreateTable: (database: string, table: string): Promise<ApiResponse<string>> =>
    invoke('get_create_table', { database, table }),

  exportData: (options: ExportOptions): Promise<ApiResponse> =>
    invoke('export_data', { options }),

  saveFileDialog: async (options: SaveFileOptions): Promise<{ canceled: boolean; filePath?: string }> => {
    const filePath = await save({
      defaultPath: options.defaultName,
      filters: options.filters,
    });

    return filePath ? { canceled: false, filePath } : { canceled: true };
  },

  listConnections: (): Promise<ApiResponse<SavedConnection[]>> =>
    invoke('list_connections'),

  saveConnection: (item: { id?: string; name: string; host: string; port: number; user: string; password: string; ssl: boolean }): Promise<ApiResponse<SavedConnection>> =>
    invoke('save_connection', { item }),

  deleteConnection: (id: string): Promise<ApiResponse<boolean>> =>
    invoke('delete_connection', { id }),
};

window.dbApi = api;
