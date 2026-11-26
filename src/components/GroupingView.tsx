import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  Crown,
  Download,
  LayoutGrid,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Shuffle,
  Users,
} from 'lucide-react';
import { RemainderStrategy, Student, StudentGroup } from '../types';
import { exportGroupsToCsv } from '../utils/csvParser';
import { playShuffleCascade } from '../utils/sound';

interface GroupingViewProps {
  students: Student[];
  groups: StudentGroup[];
  groupSize: number;
  remainderStrategy: RemainderStrategy;
  soundEnabled: boolean;
  onChangeGroupSize: (size: number) => void;
  onChangeRemainderStrategy: (strategy: RemainderStrategy) => void;
  onUpdateGroups: (groups: StudentGroup[]) => void;
  onGoToRoster: () => void;
  onLoadSampleRoster: () => void;
}

type VisualMode = 'cards' | 'classroom';

const TEAM_PALETTES = [
  {
    topBar: 'bg-sky-600',
    badgeBg: 'bg-sky-50 text-sky-800 border-sky-200',
    avatarBg: 'bg-sky-100 text-sky-800',
    tableBorder: 'border-sky-300',
    tableBg: 'bg-sky-50/70',
    accentText: 'text-sky-700',
  },
  {
    topBar: 'bg-emerald-600',
    badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    avatarBg: 'bg-emerald-100 text-emerald-800',
    tableBorder: 'border-emerald-300',
    tableBg: 'bg-emerald-50/70',
    accentText: 'text-emerald-700',
  },
  {
    topBar: 'bg-amber-500',
    badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
    avatarBg: 'bg-amber-100 text-amber-800',
    tableBorder: 'border-amber-300',
    tableBg: 'bg-amber-50/70',
    accentText: 'text-amber-700',
  },
  {
    topBar: 'bg-violet-600',
    badgeBg: 'bg-violet-50 text-violet-800 border-violet-200',
    avatarBg: 'bg-violet-100 text-violet-800',
    tableBorder: 'border-violet-300',
    tableBg: 'bg-violet-50/70',
    accentText: 'text-violet-700',
  },
  {
    topBar: 'bg-rose-600',
    badgeBg: 'bg-rose-50 text-rose-800 border-rose-200',
    avatarBg: 'bg-rose-100 text-rose-800',
    tableBorder: 'border-rose-300',
    tableBg: 'bg-rose-50/70',
    accentText: 'text-rose-700',
  },
  {
    topBar: 'bg-teal-600',
    badgeBg: 'bg-teal-50 text-teal-800 border-teal-200',
    avatarBg: 'bg-teal-100 text-teal-800',
    tableBorder: 'border-teal-300',
    tableBg: 'bg-teal-50/70',
    accentText: 'text-teal-700',
  },
  {
    topBar: 'bg-indigo-600',
    badgeBg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    avatarBg: 'bg-indigo-100 text-indigo-800',
    tableBorder: 'border-indigo-300',
    tableBg: 'bg-indigo-50/70',
    accentText: 'text-indigo-700',
  },
  {
    topBar: 'bg-orange-600',
    badgeBg: 'bg-orange-50 text-orange-800 border-orange-200',
    avatarBg: 'bg-orange-100 text-orange-800',
    tableBorder: 'border-orange-300',
    tableBg: 'bg-orange-50/70',
    accentText: 'text-orange-700',
  },
];

function fisherYatesShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function computeGroupSizes(
  total: number,
  targetSize: number,
  strategy: RemainderStrategy
): number[] {
  if (total <= 0) return [];
  const safeSize = Math.max(2, Math.min(targetSize, total));
  if (total <= safeSize) return [total];

  if (strategy === 'separate') {
    const sizes: number[] = [];
    let remaining = total;
    while (remaining > 0) {
      const take = Math.min(safeSize, remaining);
      sizes.push(take);
      remaining -= take;
    }
    return sizes;
  }

  // Balanced strategy: distribute remainder evenly so nobody is left in a tiny 1-person group
  const numGroups = Math.max(1, Math.round(total / safeSize));
  const base = Math.floor(total / numGroups);
  const extra = total % numGroups;
  return Array.from({ length: numGroups }, (_, idx) => (idx < extra ? base + 1 : base));
}

export function GroupingView({
  students,
  groups,
  groupSize,
  remainderStrategy,
  soundEnabled,
  onChangeGroupSize,
  onChangeRemainderStrategy,
  onUpdateGroups,
  onGoToRoster,
  onLoadSampleRoster,
}: GroupingViewProps) {
  const activeStudents = useMemo(() => students.filter((s) => s.active), [students]);

  const [visualMode, setVisualMode] = useState<VisualMode>('cards');
  const [shuffleGeneration, setShuffleGeneration] = useState(0);
  const [copied, setCopied] = useState(false);
  const [csvDownloaded, setCsvDownloaded] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [selectedForSwap, setSelectedForSwap] = useState<{
    groupId: string;
    studentId: string;
    studentName: string;
  } | null>(null);

  const previewDistribution = useMemo(
    () => computeGroupSizes(activeStudents.length, groupSize, remainderStrategy),
    [activeStudents.length, groupSize, remainderStrategy]
  );

  const maxAllowedSize = Math.max(2, activeStudents.length);

  const handleGenerateGroups = () => {
    if (activeStudents.length === 0) return;

    const shuffled = fisherYatesShuffle(activeStudents);
    const sizes = computeGroupSizes(shuffled.length, groupSize, remainderStrategy);

    const nextGroups: StudentGroup[] = [];
    let cursor = 0;

    sizes.forEach((size, idx) => {
      const members = shuffled.slice(cursor, cursor + size);
      cursor += size;
      nextGroups.push({
        id: `grp-${Date.now()}-${idx}`,
        index: idx + 1,
        name: `第 ${idx + 1} 組`,
        colorIndex: idx % TEAM_PALETTES.length,
        leaderId: null,
        members,
      });
    });

    setSelectedForSwap(null);
    setEditingGroupId(null);
    setShuffleGeneration((g) => g + 1);
    playShuffleCascade(soundEnabled);
    onUpdateGroups(nextGroups);
  };

  const handleAssignRandomLeaders = () => {
    if (groups.length === 0) return;
    const updated = groups.map((g) => {
      if (g.members.length === 0) return g;
      const randomMember = g.members[Math.floor(Math.random() * g.members.length)];
      return { ...g, leaderId: randomMember.id };
    });
    playShuffleCascade(soundEnabled);
    onUpdateGroups(updated);
  };

  const handleToggleLeader = (groupId: string, studentId: string) => {
    const updated = groups.map((g) => {
      if (g.id !== groupId) return g;
      return { ...g, leaderId: g.leaderId === studentId ? null : studentId };
    });
    onUpdateGroups(updated);
  };

  const handleStudentClick = (groupId: string, student: Student) => {
    if (!selectedForSwap) {
      setSelectedForSwap({
        groupId,
        studentId: student.id,
        studentName: student.name,
      });
      return;
    }

    // Deselect if clicking the same student
    if (selectedForSwap.studentId === student.id) {
      setSelectedForSwap(null);
      return;
    }

    // Swap the two students across (or within) groups
    const sourceGroup = groups.find((g) => g.id === selectedForSwap.groupId);
    const targetGroup = groups.find((g) => g.id === groupId);
    if (!sourceGroup || !targetGroup) {
      setSelectedForSwap(null);
      return;
    }

    const sourceStudent = sourceGroup.members.find((m) => m.id === selectedForSwap.studentId);
    if (!sourceStudent) {
      setSelectedForSwap(null);
      return;
    }

    const updated = groups.map((g) => {
      if (g.id === sourceGroup.id && g.id === targetGroup.id) {
        const nextMembers = [...g.members];
        const i1 = nextMembers.findIndex((m) => m.id === sourceStudent.id);
        const i2 = nextMembers.findIndex((m) => m.id === student.id);
        if (i1 >= 0 && i2 >= 0) {
          [nextMembers[i1], nextMembers[i2]] = [nextMembers[i2], nextMembers[i1]];
        }
        return { ...g, members: nextMembers };
      }

      if (g.id === sourceGroup.id) {
        const nextMembers = g.members.map((m) => (m.id === sourceStudent.id ? student : m));
        const leaderId = g.leaderId === sourceStudent.id ? student.id : g.leaderId;
        return { ...g, members: nextMembers, leaderId };
      }

      if (g.id === targetGroup.id) {
        const nextMembers = g.members.map((m) => (m.id === student.id ? sourceStudent : m));
        const leaderId = g.leaderId === student.id ? sourceStudent.id : g.leaderId;
        return { ...g, members: nextMembers, leaderId };
      }

      return g;
    });

    onUpdateGroups(updated);
    setSelectedForSwap(null);
  };

  const handleMoveSelectedToGroup = (targetGroupId: string) => {
    if (!selectedForSwap || selectedForSwap.groupId === targetGroupId) return;

    const sourceGroup = groups.find((g) => g.id === selectedForSwap.groupId);
    const movingStudent = sourceGroup?.members.find((m) => m.id === selectedForSwap.studentId);
    if (!movingStudent) return;

    const updated = groups.map((g) => {
      if (g.id === selectedForSwap.groupId) {
        return {
          ...g,
          members: g.members.filter((m) => m.id !== movingStudent.id),
          leaderId: g.leaderId === movingStudent.id ? null : g.leaderId,
        };
      }
      if (g.id === targetGroupId) {
        return {
          ...g,
          members: [...g.members, movingStudent],
        };
      }
      return g;
    });

    onUpdateGroups(updated);
    setSelectedForSwap(null);
  };

  const handleSaveGroupTitle = (groupId: string) => {
    const cleaned = editingTitle.trim();
    if (cleaned) {
      onUpdateGroups(
        groups.map((g) => (g.id === groupId ? { ...g, name: cleaned } : g))
      );
    }
    setEditingGroupId(null);
  };

  const handleCopyText = async () => {
    if (groups.length === 0) return;
    const text = groups
      .map((g) => {
        const membersStr = g.members
          .map((m) => (g.leaderId === m.id ? `${m.name}（組長）` : m.name))
          .join('、');
        return `${g.name}（${g.members.length}人）：${membersStr}`;
      })
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // Fallback ignored if clipboard permission blocked
    }
  };

  const handleDownloadCsv = () => {
    if (groups.length === 0) return;
    exportGroupsToCsv(groups);
    setCsvDownloaded(true);
    window.setTimeout(() => setCsvDownloaded(false), 2400);
  };

  if (activeStudents.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-20 px-6 text-center">
        <Users className="mx-auto h-11 w-11 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-900">尚無可分組的學生名單</h2>
        <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
          請先前往名單管理匯入學生姓名，或直接載入模擬名單快速體驗自動分組功能。
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onLoadSampleRoster}
            className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 whitespace-nowrap cursor-pointer"
          >
            載入模擬名單（24位）
          </button>
          <button
            type="button"
            onClick={onGoToRoster}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            前往名單管理
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          自動分組與視覺化座位圖
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          設定每組人數即可一鍵隨機分組，並提供分組卡片與教室桌位圖兩種視覺呈現，亦可點擊學生微調組別。
        </p>
      </div>

      {/* Grouping Control Bar */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-6">
            {/* Group Size Control */}
            <div className="space-y-2">
              <label htmlFor="group-size-input" className="block text-xs font-semibold text-slate-600">
                設定每組人數
              </label>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
                  <button
                    type="button"
                    onClick={() => onChangeGroupSize(Math.max(2, groupSize - 1))}
                    disabled={groupSize <= 2}
                    className="p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    aria-label="減少每組人數"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    id="group-size-input"
                    type="number"
                    min={2}
                    max={maxAllowedSize}
                    value={groupSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!Number.isNaN(val)) {
                        onChangeGroupSize(Math.max(2, Math.min(maxAllowedSize, val)));
                      }
                    }}
                    className="font-mono-num w-14 text-center text-sm font-bold text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => onChangeGroupSize(Math.min(maxAllowedSize, groupSize + 1))}
                    disabled={groupSize >= maxAllowedSize}
                    className="p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                    aria-label="增加每組人數"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="hidden sm:flex items-center gap-1">
                  {[2, 3, 4, 5, 6].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={preset > activeStudents.length}
                      onClick={() => onChangeGroupSize(preset)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-semibold tabular-nums transition-colors whitespace-nowrap cursor-pointer disabled:opacity-35 ${
                        groupSize === preset
                          ? 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {preset} 人
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Remainder Strategy */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-600">
                無法整除時處理方式
              </span>
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => onChangeRemainderStrategy('balanced')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    remainderStrategy === 'balanced'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  平均分配餘數
                </button>
                <button
                  type="button"
                  onClick={() => onChangeRemainderStrategy('separate')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    remainderStrategy === 'separate'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  餘數獨立一組
                </button>
              </div>
            </div>
          </div>

          {/* Primary Action */}
          <button
            type="button"
            onClick={handleGenerateGroups}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Shuffle className="h-4 w-4" />
            <span>{groups.length > 0 ? '重新隨機分組' : '開始自動分組'}</span>
          </button>
        </div>

        {/* Unboxed Live Preview Calculation */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3.5 text-xs text-slate-500 tabular-nums">
          <span>出席學生 {activeStudents.length} 位</span>
          <span aria-hidden="true">·</span>
          <span>預計分成 {previewDistribution.length} 組</span>
          <span aria-hidden="true">·</span>
          <span>
            各組人數配置：{previewDistribution.join(' / ')} 人
          </span>
        </div>
      </section>

      {/* Results Area */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 py-16 px-6 text-center">
          <LayoutGrid className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <p className="text-base font-semibold text-slate-800">
            設定好每組人數後，點擊「開始自動分組」
          </p>
          <p className="mt-1 text-sm text-slate-500">
            系統將立即把 {activeStudents.length} 位學生隨機分為 {previewDistribution.length} 組並視覺化呈現。
          </p>
          <button
            type="button"
            onClick={handleGenerateGroups}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 cursor-pointer"
          >
            <Shuffle className="h-4 w-4" />
            <span>立即分組</span>
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Visualization Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* View Switcher */}
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                <button
                  type="button"
                  onClick={() => setVisualMode('cards')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    visualMode === 'cards'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>分組卡片視圖</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVisualMode('classroom')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    visualMode === 'classroom'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  <span>教室座位圖</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleAssignRandomLeaders}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                <Crown className="h-3.5 w-3.5 text-amber-500" />
                <span>隨機指派組長</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">已複製文字</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>複製分組文字</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                {csvDownloaded ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span>已下載 CSV</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    <span>下載 CSV 檔案</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Swap Mode Guidance Bar */}
          {selectedForSwap ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs font-medium text-sky-900">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-sky-600 shrink-0" />
                <span>
                  已選取「<strong>{selectedForSwap.studentName}</strong>」— 請點擊另一位學生互換位置，或點擊其他組別的「移入此組」。
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedForSwap(null)}
                className="font-semibold text-sky-700 hover:text-sky-900 whitespace-nowrap cursor-pointer"
              >
                取消選取
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              微調提示：點擊任兩位學生即可快速互換組別；點擊組別標題可自訂隊名。
            </p>
          )}

          {/* Visual Mode A: Group Cards Grid */}
          {visualMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {groups.map((group, idx) => {
                const palette = TEAM_PALETTES[group.colorIndex % TEAM_PALETTES.length];
                const isEditing = editingGroupId === group.id;
                const canMoveHere =
                  selectedForSwap !== null && selectedForSwap.groupId !== group.id;

                return (
                  <motion.div
                    key={`${group.id}-${shuffleGeneration}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.22,
                      delay: Math.min(idx * 0.04, 0.28),
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white flex flex-col"
                  >
                    {/* Crisp 4px Top Team Color Bar */}
                    <div className={`h-1.5 w-full ${palette.topBar}`} />

                    <div className="p-5 flex-1 flex flex-col">
                      {/* Card Header */}
                      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`font-mono-num flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-bold shrink-0 ${palette.badgeBg}`}
                          >
                            {group.index}
                          </span>

                          {isEditing ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleSaveGroupTitle(group.id);
                              }}
                              className="flex items-center gap-1.5 min-w-0"
                            >
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onBlur={() => handleSaveGroupTitle(group.id)}
                                autoFocus
                                className="w-32 rounded border border-sky-500 px-2 py-0.5 text-sm font-bold text-slate-900 focus:outline-none"
                              />
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingGroupId(group.id);
                                setEditingTitle(group.name);
                              }}
                              className="group inline-flex items-center gap-1.5 text-left min-w-0 cursor-pointer"
                              title="點擊編輯組別名稱"
                            >
                              <h3 className="text-base font-bold text-slate-900 truncate">
                                {group.name}
                              </h3>
                              <Pencil className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-medium text-slate-500 tabular-nums">
                            {group.members.length} 人
                          </span>
                          {canMoveHere && (
                            <button
                              type="button"
                              onClick={() => handleMoveSelectedToGroup(group.id)}
                              className="rounded-md bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700 whitespace-nowrap cursor-pointer"
                            >
                              移入此組
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Members List */}
                      <ul className="mt-3 space-y-1.5 flex-1">
                        {group.members.map((member) => {
                          const isLeader = group.leaderId === member.id;
                          const isSelected = selectedForSwap?.studentId === member.id;
                          const initial = member.name.slice(-1);

                          return (
                            <li key={member.id}>
                              <div
                                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                                  isSelected
                                    ? 'bg-sky-50 ring-1 ring-sky-500'
                                    : 'hover:bg-slate-50'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleStudentClick(group.id, member)}
                                  className="flex flex-1 items-center gap-2.5 text-left min-w-0 cursor-pointer"
                                >
                                  <span
                                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${palette.avatarBg}`}
                                  >
                                    {initial}
                                  </span>
                                  <span className="text-sm font-semibold text-slate-900 truncate">
                                    {member.name}
                                  </span>
                                  <span className="font-mono-num text-xs text-slate-400 shrink-0">
                                    {String(member.seatNo).padStart(2, '0')}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleLeader(group.id, member.id)}
                                  title={isLeader ? '取消組長標記' : '設為本組組長'}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                    isLeader
                                      ? 'text-amber-700 bg-amber-50'
                                      : 'text-slate-300 hover:text-amber-600 hover:bg-slate-100'
                                  }`}
                                >
                                  <Crown className="h-3.5 w-3.5" />
                                  {isLeader && <span>組長</span>}
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* Visual Mode B: Classroom Table Cluster Visualization */
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-8">
              {/* Blackboard / Podium Indicator */}
              <div className="mx-auto max-w-md rounded-lg border border-slate-300 bg-slate-800 py-2.5 text-center text-xs font-semibold tracking-widest text-slate-100">
                講台與黑板方向
              </div>

              {/* Spatial Table Clusters Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {groups.map((group, idx) => {
                  const palette = TEAM_PALETTES[group.colorIndex % TEAM_PALETTES.length];
                  const count = Math.max(group.members.length, 1);

                  return (
                    <motion.div
                      key={`table-${group.id}-${shuffleGeneration}`}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        duration: 0.24,
                        delay: Math.min(idx * 0.04, 0.28),
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="relative mx-auto flex h-[300px] w-full max-w-[330px] items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/50"
                    >
                      {/* Center Table Island */}
                      <div
                        className={`flex h-28 w-28 flex-col items-center justify-center rounded-full border-2 text-center px-2 ${palette.tableBorder} ${palette.tableBg}`}
                      >
                        <span className={`text-sm font-bold leading-tight ${palette.accentText}`}>
                          {group.name}
                        </span>
                        <span className="mt-1 text-xs text-slate-500 tabular-nums">
                          {group.members.length} 人
                        </span>
                      </div>

                      {/* Radial Student Seat Nodes */}
                      {group.members.map((member, mIdx) => {
                        const angle = (2 * Math.PI * mIdx) / count - Math.PI / 2;
                        const radiusX = 112;
                        const radiusY = 104;
                        const offsetX = Math.cos(angle) * radiusX;
                        const offsetY = Math.sin(angle) * radiusY;
                        const isLeader = group.leaderId === member.id;
                        const isSelected = selectedForSwap?.studentId === member.id;

                        return (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => handleStudentClick(group.id, member)}
                            style={{
                              transform: `translate(${offsetX}px, ${offsetY}px)`,
                            }}
                            className={`absolute flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-xs transition-colors whitespace-nowrap cursor-pointer ${
                              isSelected
                                ? 'border-sky-600 bg-sky-600 text-white z-20'
                                : 'border-slate-200 bg-white text-slate-900 hover:border-sky-400 z-10'
                            }`}
                            title={`座號 ${member.seatNo} ${member.name} — 點擊可互換座位`}
                          >
                            {isLeader && (
                              <Crown
                                className={`h-3 w-3 shrink-0 ${
                                  isSelected ? 'text-amber-200' : 'text-amber-500'
                                }`}
                              />
                            )}
                            <span>{member.name}</span>
                          </button>
                        );
                      })}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
