export interface MaxwellEvent {
  database: string;
  table: string;
  type: 'insert' | 'update' | 'delete';
  ts: number;
  xid: number;
  commit: boolean;
  data?: Record<string, any>;
  old?: Record<string, any>;
  primary_key?: Array<{ [key: string]: any }>;
}

export interface SolrUpdaterRequest {
  resource: string;
  id: number;
}

export interface SolrUpdaterResponse {
  resource: string;
  id: number;
  status: string;
  message?: string;
}

export const SUPPORTED_TABLES = ['books', 'electronics'] as const;
export type SupportedTable = typeof SUPPORTED_TABLES[number];

export function isSupportedTable(table: string): table is SupportedTable {
  return SUPPORTED_TABLES.includes(table as SupportedTable);
}

