import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Trash2,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DrawRecord, Student } from '../types';
import { playSpinTick, playWinnerFanfare } from '../utils/sound';
import { ConfettiCanvas } from './ConfettiCanvas';

interface LuckyDrawViewProps {
  students: Student[];
  allowRepeat: boolean;
  onChangeAllowRepeat: (allow: boolean) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  drawnIds: string[];
  history: DrawRecord[];
  onRecordDraw: (student: Student) => void;
  onResetPool: () => void;
  onClearHistory: () => void;
  onGoToRoster: () => void;
  onLoadSampleRoster: () => void;
}

export function LuckyDrawView({
  students,
  allowRepeat,
  onChangeAllowRepeat,
  soundEnabled,
  onToggleSound,
  drawnIds,
  history,
  onRecordDraw,
  onResetPool,
  onClearHistory,
  onGoToRoster,
  onLoadSampleRoster,
}: LuckyDrawViewProps) {
  const activeStudents = useMemo(() => students.filter((s) => s.active), [students]);

  const availablePool = useMemo(() => {
    if (allowRepeat) return activeStudents;
    const drawnSet = new Set(drawnIds);
    return activeStudents.filter((s) => !drawnSet.has(s.id));
  }, [activeStudents, allowRepeat, drawnIds]);

  const [isSpinning, setIsSpinning] = useState(false);
  const [reelIndex, setReelIndex] = useState(0);
  const [displayStudent, setDisplayStudent] = useState<Student | null>(null);
  const [winner, setWinner] = useState<Student | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const timeoutRef = useRef<number | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // Clean up any pending spin timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Build rolling neighbors for authentic vertical slot-reel motion
  const reelNeighbors = useMemo(() => {
    if (activeStudents.length === 0) {
      return { prev: null, current: null, next: null };
    }
    const current = displayStudent ?? winner ?? activeStudents[0];
    const currentIdx = Math.max(
      0,
      activeStudents.findIndex((s) => s.id === current.id)
    );
    const prevIdx = (currentIdx - 1 + activeStudents.length) % activeStudents.length;
    const nextIdx = (currentIdx + 1) % activeStudents.length;
    return {
      prev: activeStudents.length > 1 ? activeStudents[prevIdx] : null,
      current,
      next: activeStudents.length > 2 ? activeStudents[nextIdx] : null,
    };
  }, [activeStudents, displayStudent, winner]);

  const startDraw = useCallback(() => {
    if (isSpinning || availablePool.length === 0) return;

    // Pick fair winner upfront via Math.random
    const winnerIndex = Math.floor(Math.random() * availablePool.length);
    const chosenWinner = availablePool[winnerIndex];

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setIsSpinning(true);
    setWinner(null);

    if (prefersReduced || activeStudents.length === 1) {
      setDisplayStudent(chosenWinner);
      setWinner(chosenWinner);
      setIsSpinning(false);
      playWinnerFanfare(soundEnabledRef.current);
      onRecordDraw(chosenWinner);
      return;
    }

    // Build an exciting deceleration step sequence (~2.25 seconds total)
    const totalSteps = 26;
    let step = 0;
    let lastPickedId = displayStudent?.id ?? '';

    const runStep = () => {
      step++;
      const progress = step / totalSteps;

      if (step < totalSteps) {
        // Choose a random visual name different from the immediate previous frame
        const visualPool = activeStudents.length > 1
          ? activeStudents.filter((s) => s.id !== lastPickedId)
          : activeStudents;
        const candidate = visualPool[Math.floor(Math.random() * visualPool.length)];
        lastPickedId = candidate.id;

        setDisplayStudent(candidate);
        setReelIndex((n) => n + 1);
        playSpinTick(progress, soundEnabledRef.current);

        // Ease-out delay curve: rapid at first (44ms), dramatic slowdown near the end (~300ms)
        const easedDelay = 44 + Math.pow(progress, 2.75) * 260;
        timeoutRef.current = window.setTimeout(runStep, easedDelay);
      } else {
        // Lock onto winner
        setDisplayStudent(chosenWinner);
        setWinner(chosenWinner);
        setReelIndex((n) => n + 1);
        setIsSpinning(false);
        setConfettiKey((k) => k + 1);
        playWinnerFanfare(soundEnabledRef.current);
        onRecordDraw(chosenWinner);
      }
    };

    runStep();
  }, [activeStudents, availablePool, displayStudent?.id, isSpinning, onRecordDraw]);

  // Keyboard shortcuts: Space to draw, Escape to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!isSpinning && availablePool.length > 0) {
          startDraw();
        }
      } else if (e.code === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [availablePool.length, isFullscreen, isSpinning, startDraw]);

  const poolExhausted = !allowRepeat && activeStudents.length > 0 && availablePool.length === 0;
  const drawnCountInRound = allowRepeat
    ? 0
    : activeStudents.length - availablePool.length;
  const roundProgressPct =
    activeStudents.length > 0
      ? Math.round((drawnCountInRound / activeStudents.length) * 100)
      : 0;

  if (activeStudents.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white py-20 px-6 text-center">
        <Users className="mx-auto h-11 w-11 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-900">尚無可參與抽籤的學生名單</h2>
        <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
          請先前往名單管理上傳 CSV、貼上學生姓名，或直接載入模擬名單快速體驗抽籤功能。
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

  const stageContent = (
    <div
      className={`relative flex flex-col justify-between overflow-hidden bg-white ${
        isFullscreen
          ? 'fixed inset-0 z-50 p-6 sm:p-10'
          : 'rounded-2xl border border-slate-200 p-6 sm:p-8 min-h-[520px]'
      }`}
    >
      <ConfettiCanvas triggerKey={confettiKey} />

      {/* Stage Top Utility Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 tabular-nums">
          <span className="font-semibold text-slate-900">
            {allowRepeat ? '可重複抽取' : '不可重複抽取'}
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span>
            {allowRepeat
              ? `出席池 ${activeStudents.length} 人`
              : `剩餘待抽 ${availablePool.length} / ${activeStudents.length} 人`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSound}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="h-3.5 w-3.5 text-sky-600" />
                <span>音效開啟</span>
              </>
            ) : (
              <>
                <VolumeX className="h-3.5 w-3.5 text-slate-400" />
                <span>已靜音</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span>結束全螢幕</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>投影全螢幕</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Center Spotlight Reel */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center py-8 sm:py-10 select-none">
        {poolExhausted ? (
          <div className="text-center max-w-md space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900">本輪全班皆已抽完</h3>
            <p className="text-sm text-slate-600">
              所有 {activeStudents.length} 位出席學生都已經被抽中過了。點擊下方按鈕即可重置抽籤池，展開新一輪抽籤。
            </p>
          </div>
        ) : (
          <div className="w-full max-w-2xl flex flex-col items-center">
            {/* Upper ghost neighbor */}
            <div className="h-10 flex items-center justify-center overflow-hidden">
              <span
                className={`text-xl sm:text-2xl font-medium text-slate-300 transition-opacity duration-150 ${
                  isSpinning ? 'opacity-70' : 'opacity-40'
                }`}
              >
                {reelNeighbors.prev?.name ?? ''}
              </span>
            </div>

            {/* Active Spotlight Frame */}
            <div
              className={`relative my-2 w-full rounded-2xl border px-6 py-10 sm:py-12 text-center transition-colors duration-200 ${
                winner && !isSpinning
                  ? 'border-emerald-300 bg-emerald-50/40'
                  : isSpinning
                    ? 'border-sky-300 bg-sky-50/40'
                    : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              {/* Status kicker line (clean unboxed text with icon) */}
              <div className="mb-3 h-6 flex items-center justify-center gap-1.5 text-sm font-semibold">
                {isSpinning ? (
                  <span className="text-sky-700">正在隨機抽取中...</span>
                ) : winner ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>本次中選學生</span>
                  </span>
                ) : (
                  <span className="text-slate-500">準備就緒，請按下開始抽籤</span>
                )}
              </div>

              {/* Animated Name Display */}
              <div className="relative h-24 sm:h-28 flex items-center justify-center overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={
                      displayStudent
                        ? `${displayStudent.id}-${reelIndex}`
                        : 'idle-placeholder'
                    }
                    initial={{ y: isSpinning ? 28 : 10, opacity: 0, scale: isSpinning ? 0.96 : 0.92 }}
                    animate={{ y: 0, opacity: 1, scale: winner && !isSpinning ? 1.04 : 1 }}
                    exit={{ y: -28, opacity: 0, scale: 0.95 }}
                    transition={{
                      duration: isSpinning ? 0.08 : 0.28,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="flex flex-col items-center justify-center"
                  >
                    <span
                      className={`font-bold tracking-tight text-slate-900 ${
                        isFullscreen
                          ? 'text-6xl sm:text-8xl'
                          : 'text-5xl sm:text-6xl'
                      }`}
                    >
                      {displayStudent ? displayStudent.name : '？'}
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Seat Number */}
              <div className="mt-3 h-6 flex items-center justify-center">
                {displayStudent ? (
                  <span className="font-mono-num text-sm font-medium text-slate-500">
                    座號 {String(displayStudent.seatNo).padStart(2, '0')}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">
                    共 {availablePool.length} 位候選學生
                  </span>
                )}
              </div>
            </div>

            {/* Lower ghost neighbor */}
            <div className="h-10 flex items-center justify-center overflow-hidden">
              <span
                className={`text-xl sm:text-2xl font-medium text-slate-300 transition-opacity duration-150 ${
                  isSpinning ? 'opacity-70' : 'opacity-40'
                }`}
              >
                {reelNeighbors.next?.name ?? ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stage Primary Action Footer */}
      <div className="relative z-10 flex flex-col items-center gap-3 pt-4 border-t border-slate-100">
        {poolExhausted ? (
          <button
            type="button"
            onClick={() => {
              onResetPool();
              setWinner(null);
              setDisplayStudent(null);
            }}
            className="inline-flex min-w-[220px] items-center justify-center gap-2.5 rounded-xl bg-sky-600 px-8 py-3.5 text-base font-bold text-white transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 cursor-pointer"
          >
            <RotateCcw className="h-5 w-5" />
            <span>重置新一輪抽籤</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={startDraw}
            disabled={isSpinning || availablePool.length === 0}
            className="inline-flex min-w-[220px] items-center justify-center gap-2.5 rounded-xl bg-sky-600 px-8 py-3.5 text-base font-bold text-white transition-all hover:bg-sky-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 cursor-pointer"
          >
            <Play className="h-5 w-5 fill-current" />
            <span>{isSpinning ? '抽籤進行中...' : winner ? '再抽下一位' : '開始抽籤'}</span>
          </button>
        )}

        <p className="text-xs text-slate-400">
          提示：按下鍵盤空白鍵（Space）即可直接抽籤
          {isFullscreen ? ' · 按 Esc 離開全螢幕' : ''}
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          課堂隨機抽籤
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          公平隨機抽出學生姓名，搭配滾動轉盤動畫與提示音效，支援設定重複或不重複抽取。
        </p>
      </div>

      {/* Two-Zone Sandbox Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Zone: Interactive Draw Stage */}
        <div className="lg:col-span-8 flex flex-col">
          {stageContent}
        </div>

        {/* Right Zone: Control Deck & History */}
        <aside className="lg:col-span-4 flex flex-col gap-6">
          {/* Mode Control Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">抽籤規則設定</h2>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                disabled={isSpinning}
                onClick={() => onChangeAllowRepeat(false)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed ${
                  !allowRepeat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                不可重複抽取
              </button>
              <button
                type="button"
                disabled={isSpinning}
                onClick={() => onChangeAllowRepeat(true)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed ${
                  allowRepeat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                可重複抽取
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-500">
              {allowRepeat
                ? '每次抽籤都會從全部出席學生中隨機選出，同一位學生可能被重複抽中。'
                : '已抽中的學生將暫時移出本輪名單，確保全班每位同學都有均等機會被點到。'}
            </p>

            {/* Non-repeat Progress Bar */}
            {!allowRepeat && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between text-xs tabular-nums">
                  <span className="font-medium text-slate-700">本輪抽取進度</span>
                  <span className="text-slate-500">
                    已抽 {drawnCountInRound} / {activeStudents.length} 人（{roundProgressPct}%）
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-all duration-300"
                    style={{ width: `${roundProgressPct}%` }}
                  />
                </div>
                {drawnCountInRound > 0 && (
                  <button
                    type="button"
                    disabled={isSpinning}
                    onClick={() => {
                      onResetPool();
                      setWinner(null);
                      setDisplayStudent(null);
                    }}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-800 disabled:opacity-50 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>重置本輪抽籤池</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Draw History Panel */}
          <div className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-white p-5 min-h-[260px]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">抽籤紀錄</h2>
                <span className="text-xs text-slate-400 tabular-nums">
                  {history.length} 筆
                </span>
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>清除</span>
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-xs text-slate-400 py-8">
                尚無抽籤紀錄
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 border-t border-slate-100">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-mono-num text-xs font-semibold text-slate-400 w-7 shrink-0">
                        #{String(item.round).padStart(2, '0')}
                      </span>
                      <span className="font-semibold text-slate-900 truncate">
                        {item.studentName}
                      </span>
                      <span className="font-mono-num text-xs text-slate-400 shrink-0">
                        ({String(item.seatNo).padStart(2, '0')}號)
                      </span>
                    </div>
                    <span className="font-mono-num text-xs text-slate-400 shrink-0">
                      {item.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
