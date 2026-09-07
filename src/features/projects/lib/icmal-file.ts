import JSZip from 'jszip';
import { z } from 'zod';

export const MAX_PROJECT_BYTES = 8 * 1024 * 1024;
// Plain decimal strings keep input precision independent of JS Number.
const decimal = z.string().max(256).regex(/^-?\d+(?:\.\d+)?$/);
const text = z.string().max(20000);
const id = z.string().min(1).max(200);
const source = z.strictObject({
  versionId: id, priceId: id.nullable(), priceType: text,
  priceAmount: decimal, currency: z.string().length(3), unit: text,
  institution: text, period: text, book: text, url: text.nullable(),
  page: z.number().int().positive().nullable(),
});
const item = z.strictObject({
  id, pozNo: text, description: text, unit: text,
  quantity: decimal, unitPrice: decimal.nullable(), source: source.optional(),
});
const percentageItem = item.extend({
  percentageLow: decimal, percentageHigh: decimal, useRange: z.boolean(),
});
// K-06 Soru 5-6: isimlendirilmis gider satirlari; yuzdeli giderin tabani
// varsayilan olarak is kalemleri toplamidir, kullanici baska giderleri acikca
// ekleyebilir. Baglantilar satir sirasindan bagimsiz kimliklerle tutulur.
const expense = z.strictObject({
  id, name: z.string().trim().min(1).max(200),
  kind: z.enum(['tutar', 'yuzde']),
  value: decimal,
  baseExpenseIds: z.array(id).max(100).optional(),
});
// K-06 Soru 7-8: proje duzeyinde tek kar yontemi ve kalem bazinda sabitlenmis
// teklif tutarlari. Maliyet degerleri bundan etkilenmez; teklif ayri tutulur.
const offer = z.strictObject({
  method: z.enum(['oran', 'sabit', 'hedefTeklif']),
  value: decimal,
  // Yalniz kullanicinin sabitledigi kalemler; digerleri paya gore hesaplanir.
  fixedRows: z.array(z.strictObject({ rowId: id, amount: decimal })).max(10000).optional(),
});
export const CURRENT_VERSION = 2;
export const projectSchema = z.strictObject({
  format: z.literal('icmal'), version: z.literal(CURRENT_VERSION),
  id, name: z.string().trim().min(1).max(200),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  currency: z.literal('TRY'),
  costRows: z.array(item).max(10000),
  percentageRows: z.array(percentageItem).max(10000),
  expenses: z.array(expense).max(1000),
  // Istege bagli: teklif hesabi yapilmamis projede bulunmaz.
  offer: offer.optional(),
}).superRefine((project, ctx) => {
  for (const key of ['costRows', 'percentageRows'] as const) {
    const ids = new Set<string>();
    project[key].forEach((row, index) => {
      if (ids.has(row.id)) ctx.addIssue({code: 'custom', message: 'Yinelenen satır kimliği', path: [key, index, 'id']});
      ids.add(row.id);
    });
  }
  const expenseIds = new Set<string>();
  project.expenses.forEach((expense, index) => {
    if (expenseIds.has(expense.id)) {
      ctx.addIssue({code: 'custom', message: 'Yinelenen gider kimliği', path: ['expenses', index, 'id']});
    }
    expenseIds.add(expense.id);
  });
  // Bilinmeyen bir tabana bagli gider hesabi sessizce bozar; dosya duzeyinde reddedilir.
  project.expenses.forEach((expense, index) => {
    (expense.baseExpenseIds ?? []).forEach((baseId, baseIndex) => {
      if (!expenseIds.has(baseId)) {
        ctx.addIssue({code: 'custom', message: 'Taban gideri bulunamadı',
          path: ['expenses', index, 'baseExpenseIds', baseIndex]});
      }
    });
  });
  const costIds = new Set(project.costRows.map((row) => row.id));
  (project.offer?.fixedRows ?? []).forEach((fixed, index) => {
    if (!costIds.has(fixed.rowId)) {
      ctx.addIssue({code: 'custom', message: 'Sabitlenen teklif satırı bulunamadı',
        path: ['offer', 'fixedRows', index, 'rowId']});
    }
  });
  if (project.updatedAt < project.createdAt) ctx.addIssue({code: 'custom', message: 'Geçersiz kayıt tarihi'});
});
export type IcmalProject = z.infer<typeof projectSchema>;

export function createProject(name: string): IcmalProject {
  const now = new Date().toISOString();
  return projectSchema.parse({format: 'icmal', version: CURRENT_VERSION, id: crypto.randomUUID(), name,
    createdAt: now, updatedAt: now, currency: 'TRY', costRows: [], percentageRows: [], expenses: []});
}

export async function encodeProject(value: unknown): Promise<Uint8Array> {
  const project = projectSchema.parse(value);
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error('Proje dosyası boyut sınırını aşıyor.');
  const zip = new JSZip();
  zip.file('project.json', bytes);
  return zip.generateAsync({type: 'uint8array', compression: 'DEFLATE'});
}

// Stop decompression when the actual output exceeds the limit, not after allocating it.
function readBounded(entry: JSZip.JSZipObject): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // JSZip 3.10 implements this stream API but omits it from JSZipObject typings.
    const stream = (entry as JSZip.JSZipObject & {
      internalStream(type: 'uint8array'): {
        on(event: 'data', callback: (chunk: Uint8Array) => void): void;
        on(event: 'error', callback: (error: Error) => void): void;
        on(event: 'end', callback: () => void): void;
        pause(): void; resume(): void;
      };
    }).internalStream('uint8array');
    const chunks: Uint8Array[] = [];
    let size = 0;
    stream.on('data', chunk => {
      size += chunk.byteLength;
      if (size > MAX_PROJECT_BYTES) {
        stream.pause();
        chunks.length = 0;
        reject(new Error('Proje içeriği boyut sınırını aşıyor.'));
      } else chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      const result = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
      resolve(result);
    });
    stream.resume();
  });
}

export async function decodeProject(bytes: Uint8Array): Promise<IcmalProject> {
  if (bytes.byteLength > MAX_PROJECT_BYTES) throw new Error('Proje dosyası boyut sınırını aşıyor.');
  try {
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files);
    // V1 has no attachments. Reject extra content instead of silently dropping it on save.
    if (entries.length !== 1 || entries[0].name !== 'project.json' || entries[0].dir ||
        (entries[0].unsafeOriginalName && entries[0].unsafeOriginalName !== 'project.json')) {
      throw new Error('Desteklenmeyen arşiv içeriği');
    }
    const data = await readBounded(entries[0]);
    const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(data));
    if (value?.format === 'icmal' && value.version !== 1 && value.version !== CURRENT_VERSION) {
      throw new Error('Bu .icmal dosyasının sürümü desteklenmiyor.');
    }
    // v1'de gider yoktu. Eski dosya bos gider listesiyle yukseltilir; kullanici
    // kaydettiginde v2 olarak yazilir.
    const upgraded = value?.format === 'icmal' && value.version === 1
      ? {...value, version: CURRENT_VERSION, expenses: []}
      : value;
    return projectSchema.parse(upgraded);
  } catch (error) {
    if (error instanceof Error && (error.message.includes('boyut sınırını') || error.message.includes('sürümü desteklenmiyor'))) throw error;
    throw new Error('Geçersiz veya desteklenmeyen .icmal dosyası.');
  }
}
