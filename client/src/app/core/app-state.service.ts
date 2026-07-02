import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom, interval } from 'rxjs';
import { RedisApiService } from './redis-api.service';
import { CommandResult, Explanation, HistoryEntry, Mode, StoreEntry, StoreValueType, Toast, ToastType } from './models';

const GREEN = { color: '#12996B', bg: '#E7F6EF', border: 'rgba(18,153,107,0.24)' };
const AMBER = { color: '#B26A00', bg: '#FDF3E3', border: 'rgba(178,106,0,0.28)' };

const TOAST_STYLE: Record<ToastType, { accent: string; bg: string; icon: string }> = {
  success: { accent: '#12996B', bg: '#E7F6EF', icon: '✓' },
  error: { accent: '#C6362F', bg: '#FDECEA', icon: '✕' },
  warn: { accent: '#B26A00', bg: '#FDF3E3', icon: '⏱' },
  info: { accent: '#2563C9', bg: '#EAF1FD', icon: 'i' },
};

// One pill color per Redis data type, matching the v2 design exactly.
const TYPE_STYLE: Record<StoreValueType, { color: string; bg: string }> = {
  string: { color: '#2563C9', bg: '#EAF1FD' },
  list: { color: '#6B45E0', bg: '#F1EDFB' },
  hash: { color: '#0E7C7C', bg: '#E3F5F5' },
  set: { color: '#B26A00', bg: '#FBF0DE' },
};

interface DtActionDef {
  label: string;
  op: string;
  primary: boolean;
}

const DT_CONFIG: Record<StoreValueType, { needsField: boolean; valueLabel: string; valuePlaceholder: string; keyPlaceholder: string; actions: DtActionDef[]; defaultOp: string }> = {
  string: {
    needsField: false,
    valueLabel: 'Value',
    valuePlaceholder: 'e.g. Priya',
    keyPlaceholder: 'e.g. name',
    actions: [{ label: 'SET', op: 'SET', primary: true }, { label: 'GET', op: 'GET', primary: false }],
    defaultOp: 'SET',
  },
  list: {
    needsField: false,
    valueLabel: 'Value',
    valuePlaceholder: 'e.g. Learn Redis',
    keyPlaceholder: 'e.g. tasks',
    actions: [
      { label: 'LPUSH', op: 'LPUSH', primary: true },
      { label: 'RPUSH', op: 'RPUSH', primary: false },
      { label: 'LPOP', op: 'LPOP', primary: false },
      { label: 'RPOP', op: 'RPOP', primary: false },
    ],
    defaultOp: 'RPUSH',
  },
  hash: {
    needsField: true,
    valueLabel: 'Value',
    valuePlaceholder: 'e.g. Priya',
    keyPlaceholder: 'e.g. user:1',
    actions: [{ label: 'HSET', op: 'HSET', primary: true }, { label: 'HGET', op: 'HGET', primary: false }],
    defaultOp: 'HSET',
  },
  set: {
    needsField: false,
    valueLabel: 'Member',
    valuePlaceholder: 'e.g. Swift',
    keyPlaceholder: 'e.g. skills',
    actions: [{ label: 'SADD', op: 'SADD', primary: true }, { label: 'SMEMBERS', op: 'SMEMBERS', primary: false }],
    defaultOp: 'SADD',
  },
};

const DEFAULT_EXPLANATION: Explanation = {
  head: 'Ready.',
  body: "Save a key with the form, or run a command in the terminal — and this panel will explain, in plain English, exactly what MiniRedis did in memory.",
};

@Injectable({ providedIn: 'root' })
export class AppStateService {
  readonly mode = signal<Mode>('form');
  readonly storeRows = signal<StoreEntry[]>([]);
  readonly history = signal<HistoryEntry[]>([]);
  readonly toasts = signal<Toast[]>([]);
  readonly explanation = signal<Explanation>(DEFAULT_EXPLANATION);
  readonly cmdResult = signal<CommandResult | null>(null);

  // Form mode fields
  readonly formKey = signal('');
  readonly formValue = signal('');
  readonly expiryOption = signal('none');
  readonly customSeconds = signal('');
  readonly formError = signal('');
  readonly generatedCmds = signal<string[]>([]);

  // Command mode fields
  readonly cmdInput = signal('');

  readonly chips = [
    'SET name Priya',
    'LPUSH tasks "Learn Redis"',
    'HSET user:1 name Priya',
    'SADD skills Swift',
    'TTL name',
    'KEYS',
  ];

  // Data Types tab fields
  readonly dtType = signal<StoreValueType>('list');
  readonly dtKey = signal('');
  readonly dtField = signal('');
  readonly dtValue = signal('');

  private manualRemovals = new Set<string>();

  readonly rows = computed(() => this.storeRows().map((e) => this.rowView(e)));
  readonly keyCount = computed(() => this.storeRows().length);
  readonly isEmpty = computed(() => this.rows().length === 0);
  readonly hasKeys = computed(() => this.rows().length > 0);
  readonly showCustom = computed(() => this.expiryOption() === 'custom');
  readonly hasFormError = computed(() => !!this.formError());
  readonly hasGenerated = computed(() => this.generatedCmds().length > 0);
  readonly historyCount = computed(() => this.history().length);
  readonly noHistory = computed(() => this.history().length === 0);
  readonly hasHistory = computed(() => this.history().length > 0);
  readonly historyRows = computed(() =>
    [...this.history()]
      .reverse()
      .map((h) => ({ cmd: h.cmd, resp: h.resp, ts: h.ts, color: this.histColor(h.status), dot: this.histColor(h.status) }))
  );
  readonly cmdResultView = computed(() => {
    const result = this.cmdResult();
    if (!result) return null;
    const success = result.status === 'success';
    return { text: result.text, accent: success ? '#5EE6A8' : '#FF8177', label: success ? 'reply' : 'error' };
  });
  readonly hasResult = computed(() => !!this.cmdResultView());
  readonly toastsView = computed(() => this.toasts().map((t) => ({ ...TOAST_STYLE[t.type], msg: t.msg, id: t.id })));

  readonly dtConfig = computed(() => DT_CONFIG[this.dtType()]);
  readonly dtPreview = computed(() => {
    const key = this.dtKey().trim();
    if (!key) return null;
    const row = this.rows().find((r) => r.key === key);
    return row ? { key: row.key, value: row.value } : null;
  });
  readonly dtHasPreview = computed(() => !!this.dtPreview());

  constructor(private api: RedisApiService) {
    this.refreshStore();
    interval(1000).subscribe(() => this.refreshStore());
  }

  private rowView(e: StoreEntry) {
    const typeStyle = TYPE_STYLE[e.type];
    const typeInfo = {
      type: e.type,
      typeLabel: e.type,
      typeColor: typeStyle.color,
      typeBg: typeStyle.bg,
    };
    if (e.ttl == null) {
      return {
        key: e.key,
        value: e.value,
        ...typeInfo,
        ttlText: '∞',
        ttlColor: '#98A2AC',
        statusText: 'Active',
        statusColor: GREEN.color,
        statusBg: GREEN.bg,
        statusBorder: GREEN.border,
      };
    }
    const soon = e.ttl <= 10;
    const c = soon ? AMBER : GREEN;
    return {
      key: e.key,
      value: e.value,
      ...typeInfo,
      ttlText: `${e.ttl}s`,
      ttlColor: c.color,
      statusText: soon ? 'Expiring' : 'Active',
      statusColor: c.color,
      statusBg: c.bg,
      statusBorder: c.border,
    };
  }

  private nowStr(): string {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
  }

  private histColor(status: 'success' | 'error'): string {
    return status === 'success' ? '#12996B' : '#C6362F';
  }

  addToast(type: ToastType, msg: string) {
    const id = Math.random().toString(36).slice(2);
    this.toasts.update((t) => [...t, { id, type, msg }]);
    setTimeout(() => this.toasts.update((t) => t.filter((x) => x.id !== id)), 3800);
  }

  private pushHistory(cmd: string, resp: string, status: 'success' | 'error') {
    this.history.update((h) => [...h, { cmd, resp, ts: this.nowStr(), status }].slice(-50));
  }

  private refreshStore() {
    this.api.getStore().subscribe((entries) => {
      const prevWithTtl = this.storeRows()
        .filter((e) => e.ttl != null)
        .map((e) => e.key);
      const nextKeys = new Set(entries.map((e) => e.key));
      prevWithTtl.forEach((key) => {
        if (nextKeys.has(key)) return;
        if (this.manualRemovals.has(key)) {
          this.manualRemovals.delete(key);
          return;
        }
        this.addToast('warn', `Key "${key}" expired and removed`);
      });
      this.storeRows.set(entries);
    });
  }

  setMode(mode: Mode) {
    this.mode.set(mode);
  }

  // ---------- FORM MODE ----------
  setFormKey(value: string) { this.formKey.set(value); }
  setFormValue(value: string) { this.formValue.set(value); }
  setExpiry(value: string) { this.expiryOption.set(value); }
  setCustom(value: string) { this.customSeconds.set(value); }

  async saveForm() {
    const k = this.formKey().trim();
    const v = this.formValue().trim();
    if (!k) { this.formError.set('Key is required.'); this.addToast('error', 'Key is required'); return; }
    if (!v) { this.formError.set('Value is required.'); this.addToast('error', 'Value is required'); return; }

    let seconds: number | null = null;
    const opt = this.expiryOption();
    if (opt === 'custom') {
      const n = parseInt(this.customSeconds(), 10);
      if (isNaN(n) || n <= 0) {
        this.formError.set('Custom TTL must be a positive number.');
        this.addToast('error', 'TTL must be a number');
        return;
      }
      seconds = n;
    } else if (opt !== 'none') {
      seconds = parseInt(opt, 10);
    }

    const generated = [`SET ${k} ${v}`];
    if (seconds) generated.push(`EXPIRE ${k} ${seconds}`);

    for (const cmd of generated) {
      const result = await firstValueFrom(this.api.runCommand(cmd));
      this.pushHistory(cmd, result.text.split('\n')[0], result.status);
    }

    const body = seconds
      ? `You stored "${k}" = "${v}" with a ${seconds}s TTL. MiniRedis saved it in a JavaScript Map and recorded an expiry timestamp — a timer counts down every second and evicts the key when it hits zero.`
      : `You stored "${k}" = "${v}" with no expiry. MiniRedis saved it in a JavaScript Map, where it stays until you delete it or flush the store.`;

    this.formError.set('');
    this.generatedCmds.set(generated);
    this.explanation.set({ head: generated.join('   ·   '), body });
    this.addToast('success', 'Key stored successfully');
    this.refreshStore();
  }

  clearForm() {
    this.formKey.set('');
    this.formValue.set('');
    this.expiryOption.set('none');
    this.customSeconds.set('');
    this.formError.set('');
    this.generatedCmds.set([]);
  }

  async flushAll() {
    this.storeRows().forEach((e) => this.manualRemovals.add(e.key));
    const result = await firstValueFrom(this.api.runCommand('FLUSHALL'));
    this.pushHistory('FLUSHALL', result.text, result.status);
    this.explanation.set({
      head: 'FLUSHALL',
      body: 'MiniRedis cleared every key from the in-memory Map. The store is now empty.',
    });
    this.addToast('warn', 'All keys cleared');
    this.refreshStore();
  }

  // ---------- COMMAND MODE ----------
  setCmdInput(value: string) { this.cmdInput.set(value); }

  async runCmd() {
    const raw = this.cmdInput();
    await this.exec(raw);
    this.cmdInput.set('');
  }

  async exec(raw: string) {
    const trimmed = (raw || '').trim();
    // DEL always removes a key; LPOP/RPOP remove it once their list empties.
    // Flagging the key here (even if it turns out not to be removed) stops
    // the poll-diff in refreshStore() from mistaking either for a natural
    // TTL expiry and showing the wrong toast.
    const removalMatch = /^(DEL|LPOP|RPOP)\s+(\S+)/i.exec(trimmed);
    if (removalMatch) {
      this.manualRemovals.add(removalMatch[2]);
    }
    const result = await firstValueFrom(this.api.runCommand(trimmed));
    this.cmdResult.set(result);
    this.pushHistory(trimmed || '(empty)', result.text.split('\n')[0], result.status);
    this.explanation.set({ head: trimmed || '(empty)', body: result.explanation });
    this.addToast(result.toast.type, result.toast.message);
    this.refreshStore();
    return result;
  }

  fillChip(label: string) {
    this.cmdInput.set(label);
  }

  tryDemo() {
    this.mode.set('command');
    this.cmdInput.set('SET user Priya');
  }

  deleteKey(key: string) {
    this.exec(`DEL ${key}`);
  }

  // ---------- DATA TYPES ----------
  setDtType(type: StoreValueType) {
    this.dtType.set(type);
    this.dtField.set('');
    this.dtValue.set('');
  }
  setDtKey(value: string) { this.dtKey.set(value); }
  setDtField(value: string) { this.dtField.set(value); }
  setDtValue(value: string) { this.dtValue.set(value); }

  private quote(value: string): string {
    return /\s/.test(value) ? `"${value}"` : value;
  }

  async runDt(op: string) {
    const k = this.dtKey().trim();
    const v = this.dtValue().trim();
    const f = this.dtField().trim();
    if (!k) { this.addToast('error', 'Key is required'); return; }

    if (op === 'SET' || op === 'LPUSH' || op === 'RPUSH' || op === 'SADD') {
      if (!v) { this.addToast('error', 'Value is required'); return; }
      await this.exec(`${op} ${k} ${this.quote(v)}`);
    } else if (op === 'HSET') {
      if (!f) { this.addToast('error', 'Field is required'); return; }
      if (!v) { this.addToast('error', 'Value is required'); return; }
      await this.exec(`HSET ${k} ${f} ${this.quote(v)}`);
    } else if (op === 'HGET') {
      if (!f) { this.addToast('error', 'Field is required'); return; }
      await this.exec(`HGET ${k} ${f}`);
    } else {
      await this.exec(`${op} ${k}`);
    }

    if (op === 'LPUSH' || op === 'RPUSH' || op === 'SADD' || op === 'HSET') {
      this.dtValue.set('');
    }
  }

  // ---------- HISTORY EXPORT ----------
  exportHistory() {
    const entries = this.history();
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `miniredis-history-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.explanation.set({
      head: 'EXPORT history',
      body: `Your ${entries.length} logged command(s) were serialized to JSON and downloaded as a file — attach it to a bug report or replay it later.`,
    });
    this.addToast('success', `History exported (${entries.length} entries)`);
  }
}
