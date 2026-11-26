import { useCallback, useEffect, useState } from 'react';
import { ActiveView, DrawRecord, RemainderStrategy, Student, StudentGroup } from './types';
import { createStudentsFromNames, SAMPLE_STUDENT_NAMES } from './utils/csvParser';
import { RosterView } from './components/RosterView';
import { LuckyDrawView } from './components/LuckyDrawView';
import { GroupingView } from './components/GroupingView';

const STORAGE_KEYS = {
  roster: 'classroom_helper_roster_v1',
  allowRepeat: 'classroom_helper_allow_repeat_v1',
  soundEnabled: 'classroom_helper_sound_v1',
  groupSize: 'classroom_helper_group_size_v1',
};

function loadInitialRoster(): Student[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.roster);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to sample list
  }
  return createStudentsFromNames(SAMPLE_STUDENT_NAMES, 1);
}

function loadBoolean(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    // ignore
  }
  return fallback;
}

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const num = parseInt(raw, 10);
      if (!Number.isNaN(num) && num >= 2) return num;
    }
  } catch {
    // ignore
  }
  return fallback;
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('draw');
  const [students, setStudents] = useState<Student[]>(loadInitialRoster);

  // Feature 1: Lucky Draw state
  const [allowRepeat, setAllowRepeat] = useState<boolean>(() =>
    loadBoolean(STORAGE_KEYS.allowRepeat, false)
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    loadBoolean(STORAGE_KEYS.soundEnabled, true)
  );
  const [drawnIds, setDrawnIds] = useState<string[]>([]);
  const [drawHistory, setDrawHistory] = useState<DrawRecord[]>([]);

  // Feature 2: Auto Grouping state
  const [groupSize, setGroupSize] = useState<number>(() =>
    loadNumber(STORAGE_KEYS.groupSize, 4)
  );
  const [remainderStrategy, setRemainderStrategy] = useState<RemainderStrategy>('balanced');
  const [groups, setGroups] = useState<StudentGroup[]>([]);

  // Persist roster & preferences
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.roster, JSON.stringify(students));
    } catch {
      // ignore storage quota errors
    }
  }, [students]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.allowRepeat, String(allowRepeat));
    } catch {
      // ignore
    }
  }, [allowRepeat]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.soundEnabled, String(soundEnabled));
    } catch {
      // ignore
    }
  }, [soundEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.groupSize, String(groupSize));
    } catch {
      // ignore
    }
  }, [groupSize]);

  // Roster mutation handlers
  const handleReplaceRoster = useCallback((next: Student[]) => {
    setStudents(next);
    setDrawnIds([]);
    setDrawHistory([]);
    setGroups([]);
  }, []);

  const handleAppendRoster = useCallback((added: Student[]) => {
    setStudents((prev) => [...prev, ...added]);
  }, []);

  const handleToggleActive = useCallback((id: string) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );
  }, []);

  const handleRemoveStudent = useCallback((id: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setDrawnIds((prev) => prev.filter((d) => d !== id));
    setGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          members: g.members.filter((m) => m.id !== id),
          leaderId: g.leaderId === id ? null : g.leaderId,
        }))
        .filter((g) => g.members.length > 0)
    );
  }, []);

  const handleSetAllActive = useCallback(() => {
    setStudents((prev) => prev.map((s) => ({ ...s, active: true })));
  }, []);

  const handleClearRoster = useCallback(() => {
    setStudents([]);
    setDrawnIds([]);
    setDrawHistory([]);
    setGroups([]);
  }, []);

  const handleLoadSampleRoster = useCallback(() => {
    const sample = createStudentsFromNames(SAMPLE_STUDENT_NAMES, 1);
    setStudents(sample);
    setDrawnIds([]);
    setDrawHistory([]);
    setGroups([]);
  }, []);

  const handleDeduplicateRoster = useCallback(() => {
    setStudents((prev) => {
      const seen = new Set<string>();
      const kept: Student[] = [];
      const removedIds = new Set<string>();

      for (const s of prev) {
        const key = s.name.trim();
        if (seen.has(key)) {
          removedIds.add(s.id);
        } else {
          seen.add(key);
          kept.push(s);
        }
      }

      if (removedIds.size > 0) {
        setDrawnIds((dPrev) => dPrev.filter((id) => !removedIds.has(id)));
        setGroups((gPrev) =>
          gPrev
            .map((g) => ({
              ...g,
              members: g.members.filter((m) => !removedIds.has(m.id)),
              leaderId: g.leaderId && removedIds.has(g.leaderId) ? null : g.leaderId,
            }))
            .filter((g) => g.members.length > 0)
        );
      }

      return kept;
    });
  }, []);

  // Lucky Draw handlers
  const handleRecordDraw = useCallback(
    (student: Student) => {
      if (!allowRepeat) {
        setDrawnIds((prev) => (prev.includes(student.id) ? prev : [...prev, student.id]));
      }
      const now = new Date();
      const timestamp = now.toTimeString().slice(0, 8);
      setDrawHistory((prev) => [
        {
          id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          round: prev.length + 1,
          studentId: student.id,
          studentName: student.name,
          seatNo: student.seatNo,
          timestamp,
        },
        ...prev,
      ]);
    },
    [allowRepeat]
  );

  const handleResetPool = useCallback(() => {
    setDrawnIds([]);
  }, []);

  const handleClearHistory = useCallback(() => {
    setDrawHistory([]);
  }, []);

  const navItems: { id: ActiveView; label: string }[] = [
    { id: 'draw', label: '隨機抽籤' },
    { id: 'group', label: '自動分組' },
    { id: 'roster', label: '名單管理' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveView('draw')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            課堂點名與分組
          </button>

          {/* Zone 2: Clean Single-Line Navigation Links */}
          <nav
            aria-label="主要功能導覽"
            className="flex items-center gap-5 sm:gap-7 text-sm font-medium"
          >
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={`relative py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-sky-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -bottom-[19px] h-0.5 bg-sky-600"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="hidden sm:flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveView(activeView === 'roster' ? 'draw' : 'roster')}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeView === 'roster' ? '前往抽籤' : '匯入名單'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6 lg:px-8">
        {activeView === 'draw' && (
          <LuckyDrawView
            students={students}
            allowRepeat={allowRepeat}
            onChangeAllowRepeat={setAllowRepeat}
            soundEnabled={soundEnabled}
            onToggleSound={() => setSoundEnabled((v) => !v)}
            drawnIds={drawnIds}
            history={drawHistory}
            onRecordDraw={handleRecordDraw}
            onResetPool={handleResetPool}
            onClearHistory={handleClearHistory}
            onGoToRoster={() => setActiveView('roster')}
            onLoadSampleRoster={handleLoadSampleRoster}
          />
        )}

        {activeView === 'group' && (
          <GroupingView
            students={students}
            groups={groups}
            groupSize={groupSize}
            remainderStrategy={remainderStrategy}
            soundEnabled={soundEnabled}
            onChangeGroupSize={setGroupSize}
            onChangeRemainderStrategy={setRemainderStrategy}
            onUpdateGroups={setGroups}
            onGoToRoster={() => setActiveView('roster')}
            onLoadSampleRoster={handleLoadSampleRoster}
          />
        )}

        {activeView === 'roster' && (
          <RosterView
            students={students}
            onReplaceRoster={handleReplaceRoster}
            onAppendRoster={handleAppendRoster}
            onToggleActive={handleToggleActive}
            onRemoveStudent={handleRemoveStudent}
            onSetAllActive={handleSetAllActive}
            onClearRoster={handleClearRoster}
            onDeduplicateRoster={handleDeduplicateRoster}
            onProceedToDraw={() => setActiveView('draw')}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-4 py-4 sm:px-6 lg:px-8 text-xs text-slate-500">
          <span>課堂點名與分組 — 名單僅儲存於本機瀏覽器，不會上傳至外部伺服器</span>
          <span className="tabular-nums">
            目前班級人數：{students.filter((s) => s.active).length} / {students.length} 位出席
          </span>
        </div>
      </footer>
    </div>
  );
}
