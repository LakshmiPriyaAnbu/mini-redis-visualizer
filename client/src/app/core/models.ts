export type StoreValueType = 'string' | 'list' | 'hash' | 'set';

export interface StoreEntry {
  key: string;
  type: StoreValueType;
  value: string;
  ttl: number | null;
  createdAt: number;
}

export interface CommandResult {
  command: string;
  status: 'success' | 'error';
  text: string;
  explanation: string;
  toast: { type: ToastType; message: string };
}

export type Mode = 'form' | 'command' | 'types';

export interface HistoryEntry {
  cmd: string;
  resp: string;
  status: 'success' | 'error';
  ts: string;
}

export type ToastType = 'success' | 'error' | 'warn' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  msg: string;
}

export interface Explanation {
  head: string;
  body: string;
}
