export type InventoryCsvRow = {
  title: string;
  sku?: string;
  barcode?: string;
  price: number;
  stock: number;
  category?: string;
  variant?: string;
  description?: string;
};

export type InventoryCsvProduct = {
  title: string;
  sku?: string;
  barcode?: string;
  category?: string;
  description?: string;
  variants: Array<{
    label: string;
    sku?: string;
    price: number;
    stock: number;
  }>;
};

export type InventoryCsvResult =
  | { ok: true; products: InventoryCsvProduct[]; skipped: number }
  | { ok: false; reason: string };

const HEADER_ALIASES: Record<keyof InventoryCsvRow, string[]> = {
  title: ['title', 'name', 'ชื่อ', 'ชื่อสินค้า'],
  sku: ['sku', 'รหัส', 'รหัสสินค้า', 'mastersku'],
  barcode: ['barcode', 'ean', 'upc', 'บาร์โค้ด'],
  price: ['price', 'ราคา'],
  stock: ['stock', 'qty', 'quantity', 'onhand', 'สต็อก', 'จำนวน'],
  category: ['category', 'หมวด', 'หมวดหมู่'],
  variant: ['variant', 'option', 'ตัวเลือก', 'รุ่น'],
  description: ['description', 'desc', 'รายละเอียด'],
};

function normalizeHeader(raw: string) {
  return raw.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '');
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === '\t' || ch === ';') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseNumber(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw.replace(/,/g, '').replace(/฿/g, '').trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function looksLikeSpreadsheetBinary(text: string) {
  return text.charCodeAt(0) === 0x50 && text.charCodeAt(1) === 0x4b;
}

export function parseInventoryCsv(text: string): InventoryCsvResult {
  const raw = text.replace(/^\uFEFF/, '');
  if (!raw.trim()) return { ok: false, reason: 'ไฟล์ว่าง' };
  if (looksLikeSpreadsheetBinary(raw)) {
    return {
      ok: false,
      reason: 'ไฟล์ Excel (.xlsx) ยังอ่านตรงๆ ไม่ได้ — บันทึกเป็น CSV แล้วลองอีกครั้ง',
    };
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { ok: false, reason: 'ต้องมีแถวหัวคอลัมน์ และอย่างน้อย 1 แถวข้อมูล' };

  const headers = splitLine(lines[0] ?? '').map(normalizeHeader);
  const col = (key: keyof InventoryCsvRow) =>
    headers.findIndex((h) => HEADER_ALIASES[key].some((alias) => normalizeHeader(alias) === h));

  const titleIdx = col('title');
  const priceIdx = col('price');
  if (titleIdx < 0 || priceIdx < 0) {
    return { ok: false, reason: 'ต้องมีคอลัมน์ ชื่อสินค้า (title) และ ราคา (price)' };
  }

  const skuIdx = col('sku');
  const barcodeIdx = col('barcode');
  const stockIdx = col('stock');
  const categoryIdx = col('category');
  const variantIdx = col('variant');
  const descIdx = col('description');

  const rows: InventoryCsvRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i] ?? '');
    const title = (cells[titleIdx] ?? '').trim();
    const price = parseNumber(cells[priceIdx]);
    if (!title || price == null || price < 0) {
      skipped += 1;
      continue;
    }
    const stockRaw = stockIdx >= 0 ? parseNumber(cells[stockIdx]) : 0;
    const stock = stockRaw == null || stockRaw < 0 ? 0 : Math.floor(stockRaw);
    rows.push({
      title,
      sku: skuIdx >= 0 ? cells[skuIdx] || undefined : undefined,
      barcode: barcodeIdx >= 0 ? cells[barcodeIdx] || undefined : undefined,
      price,
      stock,
      category: categoryIdx >= 0 ? cells[categoryIdx] || undefined : undefined,
      variant: variantIdx >= 0 ? cells[variantIdx] || undefined : undefined,
      description: descIdx >= 0 ? cells[descIdx] || undefined : undefined,
    });
  }

  if (!rows.length) return { ok: false, reason: 'ไม่มีแถวที่อ่านได้ — ตรวจชื่อสินค้าและราคา' };

  const grouped = new Map<string, InventoryCsvProduct>();
  for (const row of rows) {
    const key = row.title.trim().toLowerCase();
    const existing = grouped.get(key);
    const variant = {
      label: row.variant?.trim() || (existing ? `ตัวเลือก ${((existing.variants.length ?? 0) + 1)}` : 'มาตรฐาน'),
      sku: row.sku,
      price: row.price,
      stock: row.stock,
    };
    if (!existing) {
      grouped.set(key, {
        title: row.title.trim(),
        sku: row.sku,
        barcode: row.barcode,
        category: row.category,
        description: row.description,
        variants: [variant],
      });
    } else {
      existing.variants.push(variant);
    }
  }

  return { ok: true, products: [...grouped.values()], skipped };
}
