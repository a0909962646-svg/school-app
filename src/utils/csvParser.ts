import { ParsedCsvPreview, Student, StudentGroup } from '../types';

export const SAMPLE_STUDENT_NAMES: string[] = [
  '林宇軒', '陳思穎', '張哲維', '李沛珊', '王柏翰', '黃子晴',
  '吳冠廷', '劉宜蓁', '蔡承恩', '楊詠晴', '許峻瑋', '鄭羽彤',
  '謝品睿', '郭欣怡', '洪奕辰', '邱芷涵', '曾宥嘉', '廖采潔',
  '賴威廷', '徐語嫣', '周昱翔', '葉品妤', '蘇柏宇', '莊若曦',
];

export function createStudentsFromNames(names: string[], startSeatNo = 1): Student[] {
  return names
    .map((raw) => raw.trim())
    .filter((name) => name.length > 0)
    .map((name, idx) => ({
      id: `stu-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      seatNo: startSeatNo + idx,
      name,
      active: true,
    }));
}

export interface DuplicateStats {
  counts: Map<string, number>;
  duplicateNames: Set<string>;
  extraDuplicateCount: number;
}

export function analyzeDuplicateNames(names: string[]): DuplicateStats {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const key = raw.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const duplicateNames = new Set<string>();
  let extraDuplicateCount = 0;
  for (const [name, count] of counts.entries()) {
    if (count > 1) {
      duplicateNames.add(name);
      extraDuplicateCount += count - 1;
    }
  }

  return { counts, duplicateNames, extraDuplicateCount };
}

export function deduplicateNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const key = raw.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
}

/**
 * Parses pasted plain text (supports newlines, commas, full-width commas, tabs, semicolons).
 */
export function parsePastedNames(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // If a line contains commas, Chinese commas, tabs, or semicolons, split it
    if (/[,，、;\t]/.test(trimmed)) {
      const parts = trimmed
        .split(/[,，、;\t]+/)
        .map((p) => p.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);

      // Handle common "01, 王小明" or "1\t王小明" pattern pasted directly from Excel
      if (parts.length === 2 && /^\d+$/.test(parts[0]) && !/^\d+$/.test(parts[1])) {
        result.push(parts[1]);
      } else {
        for (const p of parts) {
          if (p && !isLikelyHeaderWord(p)) {
            result.push(p);
          }
        }
      }
    } else {
      // Handle "01 王小明" or "1. 王小明" numbered list lines
      const numberedMatch = trimmed.match(/^\d+\s*[.、)\-:\s]\s*(.+)$/);
      const candidate = numberedMatch ? numberedMatch[1].trim() : trimmed;
      if (candidate && !isLikelyHeaderWord(candidate)) {
        result.push(candidate);
      }
    }
  }

  return result;
}

const HEADER_KEYWORDS = [
  '姓名',
  '學生姓名',
  '名字',
  '學生',
  'name',
  'student',
  'student name',
  'full name',
];

const NON_NAME_HEADER_KEYWORDS = [
  '座號',
  '學號',
  '編號',
  '班級',
  '性別',
  '組別',
  '備註',
  'no',
  'id',
  'number',
  'seat',
  'class',
  'gender',
  'email',
];

function isLikelyHeaderWord(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return HEADER_KEYWORDS.includes(normalized) || NON_NAME_HEADER_KEYWORDS.includes(normalized);
}

/**
 * RFC-4180 aware single CSV line parser supporting quoted fields.
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Reads an uploaded File with UTF-8 first, falling back to Big5 for Traditional Chinese Excel CSVs.
 */
export async function readTextFileSmartEncoding(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  const utf8Text = utf8Decoder.decode(buffer);

  // If replacement character appears, try Big5 (common in Taiwan Windows Excel CSV exports)
  if (utf8Text.includes('\uFFFD')) {
    try {
      const big5Decoder = new TextDecoder('big5', { fatal: false });
      const big5Text = big5Decoder.decode(buffer);
      if (!big5Text.includes('\uFFFD')) {
        return big5Text.replace(/^\uFEFF/, '');
      }
    } catch {
      // Browser may not support big5; fall back to UTF-8
    }
  }

  return utf8Text.replace(/^\uFEFF/, '');
}

export function parseCsvToPreview(rawText: string, fileName: string): ParsedCsvPreview {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      hasHeader: false,
      detectedNameCol: 0,
      fileName,
    };
  }

  // Detect delimiter from first line
  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t')
    ? '\t'
    : firstLine.includes(',')
      ? ','
      : firstLine.includes(';')
        ? ';'
        : ',';

  const matrix = lines.map((line) => parseCsvLine(line, delimiter));
  const maxCols = Math.max(...matrix.map((row) => row.length));
  const normalizedMatrix = matrix.map((row) => {
    const padded = [...row];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });

  const firstRow = normalizedMatrix[0];
  const hasHeader =
    normalizedMatrix.length > 1 &&
    firstRow.some((cell) => isLikelyHeaderWord(cell));

  const headers = hasHeader
    ? firstRow.map((h, i) => h || `欄位 ${i + 1}`)
    : firstRow.map((_, i) => `欄位 ${i + 1}`);

  const rows = hasHeader ? normalizedMatrix.slice(1) : normalizedMatrix;

  // Detect best column for student names
  let detectedNameCol = 0;
  if (hasHeader) {
    const explicitIdx = firstRow.findIndex((cell) =>
      HEADER_KEYWORDS.includes(cell.trim().toLowerCase())
    );
    if (explicitIdx >= 0) {
      detectedNameCol = explicitIdx;
    } else {
      detectedNameCol = guessNameColumnFromRows(rows, maxCols);
    }
  } else {
    detectedNameCol = guessNameColumnFromRows(rows, maxCols);
  }

  return {
    headers,
    rows,
    hasHeader,
    detectedNameCol,
    fileName,
  };
}

function guessNameColumnFromRows(rows: string[][], colCount: number): number {
  if (colCount <= 1 || rows.length === 0) return 0;

  let bestCol = 0;
  let bestScore = -1;

  for (let col = 0; col < colCount; col++) {
    let score = 0;
    const sample = rows.slice(0, 10);
    for (const row of sample) {
      const val = (row[col] || '').trim();
      if (!val) continue;
      // Penalize purely numeric columns (likely seatNo or student ID)
      if (/^\d+$/.test(val)) {
        score -= 2;
      } else if (/^[\u4e00-\u9fff]{2,5}$/.test(val)) {
        // Strong match for Chinese names (2–5 characters)
        score += 4;
      } else if (/^[a-zA-Z\s.\-']{2,30}$/.test(val) && !val.includes('@')) {
        score += 3;
      } else if (val.length >= 2 && val.length <= 20) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }

  return bestCol;
}

export function downloadSampleCsv(): void {
  const rows = [
    ['座號', '姓名'],
    ...SAMPLE_STUDENT_NAMES.map((name, i) => [String(i + 1).padStart(2, '0'), name]),
  ];
  const csvContent = '\uFEFF' + rows.map((r) => r.join(',')).join('\r\n');
  triggerCsvDownload(csvContent, '學生名單範本.csv');
}

export function exportGroupsToCsv(groups: StudentGroup[]): void {
  const rows: string[][] = [['組別', '座號', '姓名', '角色']];
  for (const group of groups) {
    for (const member of group.members) {
      const role = group.leaderId === member.id ? '組長' : '組員';
      rows.push([
        escapeCsvCell(group.name),
        String(member.seatNo).padStart(2, '0'),
        escapeCsvCell(member.name),
        role,
      ]);
    }
  }
  const csvContent = '\uFEFF' + rows.map((r) => r.join(',')).join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(csvContent, `課堂分組名單_${dateStr}.csv`);
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function triggerCsvDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
