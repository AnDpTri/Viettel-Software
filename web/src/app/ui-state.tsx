import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Budget, Category, Goal, Transaction, Wallet } from '../api/types';
import { isView, viewFromHash, type PlanningTab, type View } from './navigation';

/** Dữ liệu truyền vào mỗi hộp thoại khi mở (bản ghi cần sửa, hoặc null khi tạo mới). */
export interface ModalPayloads {
  transaction: Transaction | null;
  wallet: Wallet | null;
  walletDetail: string;
  category: Category | null;
  budget: Budget | null;
  goal: Goal | null;
  contribution: Goal;
  profile: null;
  /** Slide bắt đầu (bỏ trống: chuỗi đầy đủ từ lời chào). */
  welcome: string | undefined;
}

export type ModalKind = keyof ModalPayloads;
type OpenModals = { [K in ModalKind]?: { payload: ModalPayloads[K]; seq: number } };

interface UiContextValue {
  view: View;
  showView: (view: View, options?: { replace?: boolean; fromHistory?: boolean }) => void;
  planningTab: PlanningTab;
  setPlanningTab: (tab: PlanningTab) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  modals: OpenModals;
  openModal: <K extends ModalKind>(kind: K, payload: ModalPayloads[K]) => void;
  closeModal: (kind: ModalKind) => void;
  tour: { id: string; force: boolean; seq: number } | null;
  startTour: (id: string, force?: boolean) => void;
  endTour: () => void;
  /** Câu hỏi điền sẵn vào khung chat của Trợ lý (từ thẻ hướng dẫn hoặc câu gợi ý). */
  agentPrompt: { text: string; seq: number } | null;
  askAgent: (text: string) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

let sequence = 0;

export function UiProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>(viewFromHash);
  const [planningTab, setPlanningTab] = useState<PlanningTab>('recurring');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modals, setModals] = useState<OpenModals>({});
  const [tour, setTour] = useState<UiContextValue['tour']>(null);
  const [agentPrompt, setAgentPrompt] = useState<UiContextValue['agentPrompt']>(null);

  const showView = useCallback<UiContextValue['showView']>((next, options = {}) => {
    setView(next);
    setSidebarOpen(false);
    if (!options.fromHistory) history[options.replace ? 'replaceState' : 'pushState']({ view: next }, '', `#${next}`);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    // Ghi hash ban đầu (thay thế, không thêm lịch sử) và theo dõi nút quay lại của trình duyệt.
    history.replaceState({ view: viewFromHash() }, '', `#${viewFromHash()}`);
    const onHashChange = () => {
      const hash = location.hash.replace('#', '');
      showView(isView(hash) ? hash : 'dashboard', { fromHistory: true });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [showView]);

  const openModal = useCallback<UiContextValue['openModal']>((kind, payload) => {
    setModals((current) => ({ ...current, [kind]: { payload, seq: (sequence += 1) } }));
  }, []);
  const closeModal = useCallback((kind: ModalKind) => {
    setModals((current) => {
      const next = { ...current };
      delete next[kind];
      return next;
    });
  }, []);

  const value = useMemo<UiContextValue>(
    () => ({
      view,
      showView,
      planningTab,
      setPlanningTab,
      sidebarOpen,
      setSidebarOpen,
      modals,
      openModal,
      closeModal,
      tour,
      startTour: (id, force = false) => setTour({ id, force, seq: (sequence += 1) }),
      endTour: () => setTour(null),
      agentPrompt,
      askAgent: (text) => {
        setAgentPrompt({ text, seq: (sequence += 1) });
        showView('insights');
      }
    }),
    [view, showView, planningTab, sidebarOpen, modals, openModal, closeModal, tour, agentPrompt]
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi phải nằm trong UiProvider');
  return value;
}

/** Trạng thái của một hộp thoại: đang mở hay không, dữ liệu truyền vào, và `seq` đổi mỗi lần mở để form nạp lại. */
export function useModal<K extends ModalKind>(kind: K) {
  const { modals, closeModal } = useUi();
  const entry = modals[kind] as { payload: ModalPayloads[K]; seq: number } | undefined;
  return { open: Boolean(entry), payload: entry?.payload, seq: entry?.seq ?? 0, close: () => closeModal(kind) };
}
