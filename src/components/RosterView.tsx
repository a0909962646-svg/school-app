import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Download,
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { ParsedCsvPreview, Student } from '../types';
import {
  analyzeDuplicateNames,
  createStudentsFromNames,
  deduplicateNames,
  downloadSampleCsv,
  parseCsvToPreview,
  parsePastedNames,
  readTextFileSmartEncoding,
  SAMPLE_STUDENT_NAMES,
} from '../utils/csvParser';

interface RosterViewProps {
  students: Student[];
  onReplaceRoster: (next: Student[]) => void;
  onAppendRoster: (added: Student[]) => void;
  onToggleActive: (id: string) => void;
  onRemoveStudent: (id: string) => void;
  onSetAllActive: () => void;
  onClearRoster: () => void;
  onDeduplicateRoster: () => void;
  onProceedToDraw: () => void;
}

type InputTab = 'paste' | 'csv';

export function RosterView({
  students,
  onReplaceRoster,
  onAppendRoster,
  onToggleActive,
  onRemoveStudent,
  onSetAllActive,
  onClearRoster,
  onDeduplicateRoster,
  onProceedToDraw,
}: RosterViewProps) {
  const [inputTab, setInputTab] = useState<InputTab>('paste');
  const [pasteText, setPasteText] = useState('');
  const [csvPreview, setCsvPreview] = useState<ParsedCsvPreview | null>(null);
  const [selectedCol, setSelectedCol] = useState(0);
  const [skipHeaderRow, setSkipHeaderRow] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [singleName, setSingleName] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedPastedList = useMemo(() => parsePastedNames(pasteText), [pasteText]);
  const pasteDupStats = useMemo(
    () => analyzeDuplicateNames(parsedPastedList),
    [parsedPastedList]
  );

  const csvDataRows = useMemo(() => {
    if (!csvPreview) return [];
    if (csvPreview.hasHeader && !skipHeaderRow) {
      return [csvPreview.headers, ...csvPreview.rows];
    }
    if (!csvPreview.hasHeader && skipHeaderRow) {
      return csvPreview.rows.slice(1);
    }
    return csvPreview.rows;
  }, [csvPreview, skipHeaderRow]);

  const csvExtractedNames = useMemo(() => {
    return csvDataRows
      .map((row) => (row[selectedCol] || '').trim())
      .filter((name) => name.length > 0);
  }, [csvDataRows, selectedCol]);

  const csvDupStats = useMemo(
    () => analyzeDuplicateNames(csvExtractedNames),
    [csvExtractedNames]
  );

  const rosterDupStats = useMemo(
    () => analyzeDuplicateNames(students.map((s) => s.name)),
    [students]
  );

  const activeCount = useMemo(() => students.filter((s) => s.active).length, [students]);
  const absentCount = students.length - activeCount;

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || String(s.seatNo).includes(q)
    );
  }, [students, searchQuery]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    window.setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 3600);
  };

  const handleApplyPaste = (mode: 'replace' | 'append') => {
    if (parsedPastedList.length === 0) {
      showToast('error', '請先貼上至少一位學生姓名。');
      return;
    }
    if (mode === 'replace') {
      const next = createStudentsFromNames(parsedPastedList, 1);
      onReplaceRoster(next);
      showToast('success', `已更新名單，共匯入 ${next.length} 位學生。`);
    } else {
      const maxSeat = students.reduce((acc, s) => Math.max(acc, s.seatNo), 0);
      const added = createStudentsFromNames(parsedPastedList, maxSeat + 1);
      onAppendRoster(added);
      showToast('success', `已附加 ${added.length} 位學生至現有名單。`);
    }
    setPasteText('');
  };

  const handleLoadSample = () => {
    const sample = createStudentsFromNames(SAMPLE_STUDENT_NAMES, 1);
    onReplaceRoster(sample);
    showToast('success', `已載入 ${sample.length} 位模擬學生名單，現在可以直接體驗抽籤與自動分組！`);
  };

  const handleDeduplicatePaste = () => {
    if (pasteDupStats.extraDuplicateCount === 0) return;
    const removed = pasteDupStats.extraDuplicateCount;
    const unique = deduplicateNames(parsedPastedList);
    setPasteText(unique.join('\n'));
    showToast('success', `已一次性移除 ${removed} 筆重複姓名。`);
  };

  const handleDeduplicateCsvPreview = () => {
    if (!csvPreview || csvDupStats.extraDuplicateCount === 0) return;
    const removed = csvDupStats.extraDuplicateCount;
    const seen = new Set<string>();

    const filterUniqueRows = (rows: string[][]) =>
      rows.filter((row) => {
        const name = (row[selectedCol] || '').trim();
        if (!name) return false;
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });

    if (csvPreview.hasHeader && !skipHeaderRow) {
      const combined = [csvPreview.headers, ...csvPreview.rows];
      const uniqueRows = filterUniqueRows(combined);
      setCsvPreview({
        ...csvPreview,
        hasHeader: false,
        rows: uniqueRows,
      });
      setSkipHeaderRow(false);
    } else if (!csvPreview.hasHeader && skipHeaderRow) {
      const headerRow = csvPreview.rows[0];
      const uniqueRest = filterUniqueRows(csvPreview.rows.slice(1));
      setCsvPreview({
        ...csvPreview,
        rows: headerRow ? [headerRow, ...uniqueRest] : uniqueRest,
      });
    } else {
      setCsvPreview({
        ...csvPreview,
        rows: filterUniqueRows(csvPreview.rows),
      });
    }

    showToast('success', `已從 CSV 預覽名單中一次性移除 ${removed} 筆重複姓名。`);
  };

  const handleFileProcess = async (file: File) => {
    try {
      const text = await readTextFileSmartEncoding(file);
      const preview = parseCsvToPreview(text, file.name);
      if (preview.rows.length === 0 && preview.headers.length === 0) {
        showToast('error', '檔案內沒有讀取到有效的文字內容，請確認 CSV 檔案格式。');
        return;
      }
      setCsvPreview(preview);
      setSelectedCol(preview.detectedNameCol);
      setSkipHeaderRow(preview.hasHeader);
      setFeedback(null);
    } catch {
      showToast('error', '讀取檔案時發生錯誤，請確認檔案未損毀。');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleApplyCsv = (mode: 'replace' | 'append') => {
    if (csvExtractedNames.length === 0) {
      showToast('error', '所選欄位沒有可用的學生姓名，請切換其他欄位。');
      return;
    }
    if (mode === 'replace') {
      const next = createStudentsFromNames(csvExtractedNames, 1);
      onReplaceRoster(next);
      showToast('success', `已從 ${csvPreview?.fileName} 匯入 ${next.length} 位學生。`);
    } else {
      const maxSeat = students.reduce((acc, s) => Math.max(acc, s.seatNo), 0);
      const added = createStudentsFromNames(csvExtractedNames, maxSeat + 1);
      onAppendRoster(added);
      showToast('success', `已附加 ${added.length} 位學生至現有名單。`);
    }
    setCsvPreview(null);
  };

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = singleName.trim();
    if (!cleaned) return;
    const maxSeat = students.reduce((acc, s) => Math.max(acc, s.seatNo), 0);
    const added = createStudentsFromNames([cleaned], maxSeat + 1);
    onAppendRoster(added);
    setSingleName('');
    showToast('success', `已新增學生「${cleaned}」。`);
  };

  return (
    <div className="space-y-6">
      {/* Page Heading Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            學生名單管理
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            支援上傳 CSV 檔案（自動相容 Excel Big5 與 UTF-8 編碼）或直接貼上學生姓名，隨時可標記今日請假。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleLoadSample}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="h-4 w-4 text-sky-600" />
            <span>載入模擬名單</span>
          </button>
          {students.length > 0 && (
            <button
              type="button"
              onClick={onProceedToDraw}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>前往隨機抽籤</span>
            </button>
          )}
        </div>
      </div>

      {/* Transient Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <Check className="h-4 w-4 shrink-0" />
            ) : (
              <X className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="關閉訊息"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Two-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Zone: Input Source */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <h2 className="text-base font-semibold text-slate-900">匯入名單來源</h2>
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setInputTab('paste')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  inputTab === 'paste'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                貼上姓名
              </button>
              <button
                type="button"
                onClick={() => setInputTab('csv')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  inputTab === 'csv'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                上傳 CSV
              </button>
            </div>
          </div>

          {inputTab === 'paste' ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="paste-roster-input" className="text-sm font-medium text-slate-700">
                    貼上學生姓名
                  </label>
                  <span className="text-xs text-slate-500 tabular-nums">
                    已偵測 {parsedPastedList.length} 位學生
                  </span>
                </div>
                <textarea
                  id="paste-roster-input"
                  rows={8}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={`可直接從 Excel、Word 或 LINE 貼上名單\n支援換行、逗號、頓號或 Tab 分隔：\n\n林宇軒\n陳思穎\n張哲維\n李沛珊`}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3.5 py-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-600/15"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  自動忽略空白行、座號前綴（例如「01 王小明」）與常見標題列。
                </p>
              </div>

              {/* Paste Live Preview & Duplicate Detection */}
              {parsedPastedList.length > 0 && (
                <div className="space-y-2.5 border-t border-slate-100 pt-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 tabular-nums">
                      預覽名單（共 {parsedPastedList.length} 筆）
                    </span>
                    {pasteDupStats.extraDuplicateCount > 0 && (
                      <button
                        type="button"
                        onClick={handleDeduplicatePaste}
                        className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>一鍵移除重複姓名（{pasteDupStats.extraDuplicateCount}）</span>
                      </button>
                    )}
                  </div>

                  {pasteDupStats.extraDuplicateCount > 0 && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        偵測到 <strong>{pasteDupStats.extraDuplicateCount}</strong> 筆重複姓名（
                        {Array.from(pasteDupStats.duplicateNames).join('、')}），已在下方預覽名單標記。
                      </span>
                    </div>
                  )}

                  <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {parsedPastedList.map((name, idx) => {
                      const count = pasteDupStats.counts.get(name) ?? 1;
                      const isDuplicate = count > 1;
                      return (
                        <div
                          key={`${name}-${idx}`}
                          className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs ${
                            isDuplicate ? 'bg-amber-50/80' : 'bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono-num text-slate-400 w-6 shrink-0">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <span
                              className={`truncate ${
                                isDuplicate ? 'font-semibold text-amber-950' : 'text-slate-800'
                              }`}
                            >
                              {name}
                            </span>
                          </div>
                          {isDuplicate && (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 whitespace-nowrap shrink-0">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span>重複（{count} 筆）</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleApplyPaste('replace')}
                  disabled={parsedPastedList.length === 0}
                  className="flex-1 inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 whitespace-nowrap cursor-pointer"
                >
                  取代現有名單
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPaste('append')}
                  disabled={parsedPastedList.length === 0}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap cursor-pointer"
                >
                  附加至名單
                </button>
              </div>

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-xs text-slate-500">
                <span>想快速體驗網站功能？</span>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="font-semibold text-sky-700 hover:text-sky-800 underline underline-offset-2 whitespace-nowrap cursor-pointer"
                >
                  載入 24 位模擬名單
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-sky-600 bg-sky-50/70'
                    : 'border-slate-300 bg-slate-50/60 hover:border-sky-500 hover:bg-sky-50/30'
                }`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sky-50 text-sky-600 mb-3">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  點擊選擇或拖曳 CSV 檔案到此處
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  支援 .csv 與 .txt 格式，自動偵測 UTF-8 / Big5 中文編碼
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* CSV Preview & Column Picker */}
              {csvPreview && (
                <div className="space-y-4 border-t border-slate-200 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {csvPreview.fileName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCsvPreview(null)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800 whitespace-nowrap cursor-pointer"
                    >
                      取消
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="csv-col-select" className="block text-xs font-medium text-slate-600 mb-1">
                        選擇「學生姓名」欄位
                      </label>
                      <select
                        id="csv-col-select"
                        value={selectedCol}
                        onChange={(e) => setSelectedCol(Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
                      >
                        {csvPreview.headers.map((header, idx) => (
                          <option key={idx} value={idx}>
                            第 {idx + 1} 欄：{header}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end pb-1">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={skipHeaderRow}
                          onChange={(e) => setSkipHeaderRow(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                        />
                        <span>第一列為標題列（略過）</span>
                      </label>
                    </div>
                  </div>

                  {/* Duplicate Warning Banner for CSV Preview */}
                  {csvDupStats.extraDuplicateCount > 0 && (
                    <div className="flex flex-col gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          預覽名單中發現 <strong>{csvDupStats.extraDuplicateCount}</strong> 筆重複姓名（
                          {Array.from(csvDupStats.duplicateNames).join('、')}），已標記於下方表格。
                        </span>
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={handleDeduplicateCsvPreview}
                          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>一鍵移除重複姓名</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Scrollable CSV Preview Rows */}
                  <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          {csvPreview.headers.map((h, i) => (
                            <th
                              key={i}
                              className={`px-3 py-2 font-semibold whitespace-nowrap ${
                                i === selectedCol ? 'bg-sky-50 text-sky-800' : ''
                              }`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvDataRows.map((row, rIdx) => {
                          const nameVal = (row[selectedCol] || '').trim();
                          const dupCount = csvDupStats.counts.get(nameVal) ?? 0;
                          const isDupRow = dupCount > 1;
                          return (
                            <tr key={rIdx} className={isDupRow ? 'bg-amber-50/80' : ''}>
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className={`px-3 py-1.5 whitespace-nowrap ${
                                    cIdx === selectedCol
                                      ? isDupRow
                                        ? 'font-semibold text-amber-950'
                                        : 'bg-sky-50/40 font-semibold text-slate-900'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  <div className="inline-flex items-center gap-1.5">
                                    <span>{cell || '—'}</span>
                                    {cIdx === selectedCol && isDupRow && (
                                      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-700">
                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                        <span>重複</span>
                                      </span>
                                    )}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
                    <span>預計匯入 {csvExtractedNames.length} 位學生</span>
                    {csvDupStats.extraDuplicateCount > 0 && (
                      <span className="font-medium text-amber-700">
                        含 {csvDupStats.extraDuplicateCount} 筆重複
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleApplyCsv('replace')}
                      className="flex-1 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 whitespace-nowrap cursor-pointer"
                    >
                      取代現有名單
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyCsv('append')}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                    >
                      附加至名單
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-xs text-slate-500">
                <span>需要標準格式參考？</span>
                <button
                  type="button"
                  onClick={downloadSampleCsv}
                  className="inline-flex items-center gap-1.5 font-semibold text-sky-700 hover:text-sky-800 whitespace-nowrap cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>下載 CSV 範本</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right Zone: Active Roster Table */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">目前班級名單</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                <span>總計 {students.length} 位</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 font-medium">出席參與 {activeCount} 位</span>
                {absentCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 font-medium">今日請假 {absentCount} 位</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {absentCount > 0 && (
                <button
                  type="button"
                  onClick={onSetAllActive}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                >
                  全部設為出席
                </button>
              )}
              {students.length > 0 && (
                confirmClear ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onClearRoster();
                        setConfirmClear(false);
                        showToast('success', '已清空所有學生名單。');
                      }}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 whitespace-nowrap cursor-pointer"
                    >
                      確認清空
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:border-rose-200 whitespace-nowrap cursor-pointer"
                  >
                    清空名單
                  </button>
                )
              )}
            </div>
          </div>

          {/* Search & Quick Add Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋姓名或座號..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:bg-white focus:outline-none"
              />
            </div>

            <form onSubmit={handleAddSingle} className="flex items-center gap-2">
              <input
                type="text"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="快速新增一位學生..."
                className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:bg-white focus:outline-none"
              />
              <button
                type="submit"
                disabled={!singleName.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>新增</span>
              </button>
            </form>
          </div>

          {/* Active Roster Duplicate Alert Banner */}
          {rosterDupStats.extraDuplicateCount > 0 && (
            <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  目前名單中有 <strong>{rosterDupStats.extraDuplicateCount}</strong> 筆重複姓名（
                  {Array.from(rosterDupStats.duplicateNames).join('、')}），已在下方標記。
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const removed = rosterDupStats.extraDuplicateCount;
                  onDeduplicateRoster();
                  showToast('success', `已一次性移除名單中 ${removed} 筆重複姓名。`);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>一次性移除重複姓名</span>
              </button>
            </div>
          )}

          {/* Roster List */}
          {students.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-14 px-6 text-center">
              <Users className="h-9 w-9 text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-800">目前尚未匯入學生名單</p>
              <p className="mt-1 text-xs text-slate-500">
                請於左側貼上姓名、上傳 CSV 檔案，或直接載入模擬名單快速了解操作流程。
              </p>
              <button
                type="button"
                onClick={handleLoadSample}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 whitespace-nowrap cursor-pointer"
              >
                <BookOpen className="h-4 w-4" />
                <span>載入 24 位模擬名單</span>
              </button>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              找不到符合「{searchQuery}」的學生。
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100 border-t border-slate-200">
              {filteredStudents.map((student) => {
                const dupCount = rosterDupStats.counts.get(student.name.trim()) ?? 1;
                const isDup = dupCount > 1;
                return (
                  <div
                    key={student.id}
                    className={`flex items-center justify-between gap-3 py-2.5 px-2 transition-colors ${
                      isDup ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-slate-50'
                    } ${!student.active ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono-num w-8 text-xs font-medium text-slate-400 shrink-0">
                        {String(student.seatNo).padStart(2, '0')}
                      </span>
                      <span
                        className={`text-sm font-medium truncate ${
                          student.active ? 'text-slate-900' : 'text-slate-400 line-through'
                        }`}
                      >
                        {student.name}
                      </span>
                      {isDup && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 whitespace-nowrap shrink-0">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>重複</span>
                        </span>
                      )}
                    </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleActive(student.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        student.active
                          ? 'text-emerald-700 hover:bg-emerald-50'
                          : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                      }`}
                      title={student.active ? '點擊標記為今日請假（暫不參與抽籤與分組）' : '點擊恢復出席'}
                    >
                      {student.active ? (
                        <>
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>出席</span>
                        </>
                      ) : (
                        <>
                          <UserMinus className="h-3.5 w-3.5" />
                          <span>請假</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveStudent(student.id)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                      aria-label={`移除 ${student.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
