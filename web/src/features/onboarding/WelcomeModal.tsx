import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useCategories, useOnboarding, useRefreshLedger, useWallets } from '../../api/queries';
import type { User, WalletType } from '../../api/types';
import { useAuth, useUser } from '../../app/auth';
import type { PlanningTab, View } from '../../app/navigation';
import { useModal, useUi } from '../../app/ui-state';
import { displayName, money } from '../../lib/format';
import { LAST_WALLET_KEY, storageSet } from '../../lib/storage';
import { Modal } from '../../ui/Modal';
import { errorMessage, useToast } from '../../ui/Toast';
import { useOnboardingPreference } from './OnboardingCard';

const INTERESTS = [
  { id: 'track', icon: '🧾', title: 'Biết tiền đi đâu', text: 'Ghi thu chi, xem mình tiêu nhiều vào đâu' },
  { id: 'budget', icon: '🎯', title: 'Không chi quá tay', text: 'Đặt hạn mức cho tháng hoặc từng nhóm' },
  { id: 'save', icon: '🐷', title: 'Tiết kiệm cho mục tiêu', text: 'Mua xe, du lịch, quỹ dự phòng' },
  { id: 'bills', icon: '📅', title: 'Nhớ hóa đơn, khoản định kỳ', text: 'Tiền nhà, điện nước, lương về' }
];
const WALLETS: Array<{ type: WalletType; icon: string; name: string }> = [
  { type: 'CASH', icon: '💵', name: 'Tiền mặt' },
  { type: 'BANK', icon: '🏦', name: 'Tài khoản ngân hàng' },
  { type: 'E_WALLET', icon: '📱', name: 'Ví điện tử' }
];
const CATEGORIES: Array<[string, 'EXPENSE' | 'INCOME']> = [
  ['Ăn uống', 'EXPENSE'],
  ['Di chuyển', 'EXPENSE'],
  ['Mua sắm', 'EXPENSE'],
  ['Hóa đơn', 'EXPENSE'],
  ['Sức khỏe', 'EXPENSE'],
  ['Giải trí', 'EXPENSE'],
  ['Lương', 'INCOME'],
  ['Thu nhập khác', 'INCOME']
];
const TIPS: Record<string, { text: string; view: View; tab?: PlanningTab; label: string }> = {
  track: {
    text: 'Mỗi khi tiêu gì, bấm “＋ Ghi giao dịch”. Cuối tháng xem Tổng quan › Báo cáo.',
    view: 'reports',
    label: 'Xem Báo cáo'
  },
  budget: { text: 'Đặt hạn mức chi tiêu ở Kế hoạch › Ngân sách.', view: 'budgets', label: 'Đặt ngân sách' },
  save: {
    text: 'Tạo mục tiêu tiết kiệm ở Kế hoạch › Mục tiêu, nên kèm một ví tiết kiệm riêng.',
    view: 'goals',
    label: 'Tạo mục tiêu'
  },
  bills: {
    text: 'Thêm tiền nhà, điện nước ở Kế hoạch › Hóa đơn để được nhắc trước hạn.',
    view: 'planning',
    tab: 'bills',
    label: 'Thêm hóa đơn'
  }
};

type Slide = 'intro' | 'wallet' | 'categories' | 'transaction' | 'done';

/** Chuỗi slide thiết lập cho người mới: mỗi màn một câu hỏi, bấm chọn là xong, tạo dữ liệu thật ngay. Bước đã có dữ
 * liệu được bỏ qua; mở từ một bước cụ thể (ví dụ "wallet") thì bắt đầu từ bước đó. */
export function WelcomeModal() {
  const { open, payload: startAt, seq, close } = useModal('welcome');
  const user = useUser();
  const { setUser } = useAuth();
  const ui = useUi();
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const setPreference = useOnboardingPreference();
  const onboarding = useOnboarding().data;
  const wallets = (useWallets().data ?? []).filter((wallet) => !wallet.archivedAt);
  const categories = (useCategories().data ?? []).filter(
    (category) => category.type === 'EXPENSE' && !category.archivedAt
  );

  const [slides, setSlides] = useState<Slide[]>(['intro', 'done']);
  /** Tài khoản đã thiết lập xong (ví dụ tài khoản demo có dữ liệu mẫu): vẫn cho đi đủ các bước để xem, không ghi gì. */
  const [preview, setPreview] = useState(false);
  const [index, setIndex] = useState(0);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [walletChoice, setWalletChoice] = useState<Record<string, { checked: boolean; balance: string }>>({});
  const [categoryChoice, setCategoryChoice] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState('');
  const [txCategory, setTxCategory] = useState('');
  const [note, setNote] = useState('');
  const [txWallet, setTxWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const done = (id: string) => Boolean(onboarding?.steps.find((step) => step.id === id)?.completed);
    const steps = ['wallet', 'categories', 'transaction'] as const;
    const pending = steps.filter((id) => !done(id));
    const previewing = !pending.length && (!startAt || startAt === 'preview');
    const start = previewing
      ? ['intro' as const, ...steps]
      : startAt && startAt !== 'preview'
        ? pending.slice(Math.max(0, pending.indexOf(startAt as (typeof pending)[number])))
        : ['intro' as const, ...pending];
    setPreview(previewing);
    setSlides([...start, 'done']);
    setIndex(0);
    setInterests(new Set(onboarding?.interests ?? []));
    setCreated([]);
    setName('');
    setWalletChoice({ CASH: { checked: true, balance: '' } });
    setCategoryChoice(new Set(CATEGORIES.map(([category]) => category)));
    setAmount('');
    setNote('');
    // Cờ giao diện "đã xem chào mừng" vẫn lưu cả khi xem thử (các vòng hướng dẫn từng màn chờ cờ này).
    if ((previewing || !startAt) && !onboarding?.welcomeSeen)
      void setPreference({ welcomeSeen: true }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ dựng lại chuỗi slide mỗi lần mở
  }, [open, seq]);

  const slide = slides[index] ?? 'done';
  useEffect(() => {
    if (slide === 'transaction') {
      setTxCategory(categories[0]?.id ?? '');
      setTxWallet(wallets[0]?.id ?? '');
    }
    requestAnimationFrame(() =>
      slideRef.current?.querySelector<HTMLElement>('input:not([type="checkbox"]),.choice-card')?.focus()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chọn sẵn khi vào slide ghi thử
  }, [slide, open]);

  const dataSlides: Slide[] = slides.filter((item) => item !== 'intro' && item !== 'done');
  const heading = (current: Slide) => `BƯỚC ${dataSlides.indexOf(current) + 1}/${dataSlides.length}`;
  const advance = () => setIndex((current) => Math.min(current + 1, slides.length - 1));

  /** Lưu dữ liệu của slide hiện tại; trả `false` khi cần người dùng sửa lại trước khi sang slide sau. */
  async function saveSlide() {
    if (preview) return true; // Xem thử: không tạo ví, danh mục, giao dịch hay đổi hồ sơ của tài khoản.
    if (slide === 'intro') {
      if (name.trim()) setUser(await api<User>('/profile', { method: 'PATCH', body: { fullName: name.trim() } }));
      await setPreference({ interests: [...interests], welcomeSeen: true });
      return true;
    }
    if (slide === 'wallet') {
      const chosen = WALLETS.filter((item) => walletChoice[item.type]?.checked);
      if (!chosen.length) {
        toast('Chọn ít nhất một nơi bạn đang giữ tiền.', true);
        return false;
      }
      for (const item of chosen)
        await api('/wallets', {
          method: 'POST',
          body: {
            name: item.name,
            type: item.type,
            currency: user.currency || 'VND',
            openingBalance: Number(walletChoice[item.type]?.balance || 0)
          }
        });
      setCreated((current) => [...current, `Tạo ${chosen.length} ví: ${chosen.map((item) => item.name).join(', ')}`]);
    }
    if (slide === 'categories' && categoryChoice.size) {
      const result = await api<{ created: number }>('/profile/onboarding/starter-categories', {
        method: 'POST',
        body: { names: [...categoryChoice] }
      });
      if (result.created) setCreated((current) => [...current, `Tạo ${result.created} nhóm thu chi`]);
    }
    if (slide === 'transaction') {
      const value = Number(amount);
      if (!(value > 0)) {
        toast('Nhập số tiền, hoặc bấm “Bỏ qua bước này”.', true);
        document.getElementById('welcome-amount')?.focus();
        return false;
      }
      const walletId = txWallet || wallets[0]?.id;
      await api('/transactions', {
        method: 'POST',
        body: {
          type: 'EXPENSE',
          amount: value,
          walletId,
          categoryId: txCategory || null,
          note: note.trim() || null,
          occurredAt: new Date().toISOString()
        }
      });
      if (walletId) storageSet(LAST_WALLET_KEY, walletId);
      setCreated((current) => [...current, `Ghi khoản chi ${money(value)}`]);
    }
    await refreshLedger();
    return true;
  }

  async function next() {
    if (slide === 'done') {
      close();
      ui.startTour('main', true);
      return;
    }
    setBusy(true);
    try {
      if (await saveSlide()) advance();
    } catch (error) {
      toast(errorMessage(error), true);
    } finally {
      setBusy(false);
    }
  }

  const tips = [...interests].map((id) => TIPS[id]).filter((tip): tip is (typeof TIPS)[string] => Boolean(tip));
  const needName = !(user.fullName ?? '').trim();
  const nextLabel: Record<Slide, string> = preview
    ? {
        intro: 'Bắt đầu →',
        wallet: 'Tiếp →',
        categories: 'Tiếp →',
        transaction: 'Tiếp →',
        done: 'Đi một vòng giao diện'
      }
    : {
        intro: 'Bắt đầu →',
        wallet: 'Tạo ví →',
        categories: 'Dùng các nhóm này →',
        transaction: 'Lưu khoản chi →',
        done: 'Đi một vòng giao diện'
      };

  return (
    <Modal id="welcome-modal" open={open} onClose={close} labelledBy="welcome-title" initialFocus="#welcome-next">
      <div className="modal-card welcome-card">
        <button type="button" className="modal-close" id="welcome-close" aria-label="Đóng thiết lập" onClick={close}>
          ×
        </button>
        <div id="welcome-dots" className="welcome-dots" aria-hidden="true">
          {slides.map((item, dot) => (
            <span key={`${item}-${dot}`} className={dot === index ? 'active' : dot < index ? 'done' : ''} />
          ))}
        </div>
        {preview && slide !== 'done' && (
          <p id="welcome-preview-note" className="welcome-preview-note">
            Xem thử: tài khoản này đã thiết lập xong, các bước dưới đây chỉ để xem, không tạo thêm dữ liệu.
          </p>
        )}
        <div id="welcome-slide" className="welcome-slide" aria-live="polite" ref={slideRef}>
          {slide === 'intro' && (
            <>
              <span className="eyebrow">CHÀO MỪNG ĐẾN SỔ MỘC</span>
              <h2 id="welcome-title">Chào {needName ? 'bạn' : displayName(user)}! Bạn muốn Sổ Mộc giúp gì?</h2>
              <p className="form-help">Chọn một hoặc nhiều. Khoảng 1 phút nữa là sổ của bạn sẵn sàng.</p>
              {needName && (
                <label>
                  Mình nên gọi bạn là gì?
                  <input
                    id="welcome-name"
                    maxLength={120}
                    autoComplete="name"
                    placeholder="Ví dụ: Minh Anh"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              )}
              <div className="choice-grid">
                {INTERESTS.map((item) => {
                  const selected = interests.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`choice-card${selected ? ' selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() =>
                        setInterests((current) => {
                          const nextSet = new Set(current);
                          if (nextSet.has(item.id)) nextSet.delete(item.id);
                          else nextSet.add(item.id);
                          return nextSet;
                        })
                      }
                    >
                      <span className="choice-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <strong>{item.title}</strong>
                      <small>{item.text}</small>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {slide === 'wallet' && (
            <>
              <span className="eyebrow">{heading('wallet')} · NƠI GIỮ TIỀN</span>
              <h2 id="welcome-title">Tiền của bạn đang ở đâu?</h2>
              <p className="form-help">
                Mỗi nơi là một “ví”. Nhập số tiền đang có, ước chừng cũng được; sửa sau ở Thiết lập › Ví của tôi.
              </p>
              <div className="wallet-choices">
                {WALLETS.map((item) => {
                  const choice = walletChoice[item.type] ?? { checked: false, balance: '' };
                  const update = (patch: Partial<typeof choice>) =>
                    setWalletChoice({ ...walletChoice, [item.type]: { ...choice, ...patch } });
                  return (
                    <label key={item.type} className="wallet-choice">
                      <input
                        type="checkbox"
                        checked={choice.checked}
                        onChange={(event) => update({ checked: event.target.checked })}
                      />
                      <span className="choice-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="wallet-choice-name">{item.name}</span>
                      <span className="money-input">
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          inputMode="numeric"
                          placeholder="0"
                          aria-label={`Số tiền đang có trong ${item.name}`}
                          value={choice.balance}
                          onChange={(event) =>
                            update({
                              balance: event.target.value,
                              checked: choice.checked || Boolean(event.target.value)
                            })
                          }
                        />
                        <span aria-hidden="true">₫</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          {slide === 'categories' && (
            <>
              <span className="eyebrow">{heading('categories')} · NHÓM THU CHI</span>
              <h2 id="welcome-title">Bạn hay tiêu vào đâu?</h2>
              <p className="form-help">
                Mỗi khoản thu chi thuộc một nhóm để báo cáo cho biết tiền đi đâu. Bỏ chọn nhóm không cần; thêm nhóm
                riêng sau ở Thiết lập › Danh mục.
              </p>
              {(['EXPENSE', 'INCOME'] as const).map((type) => (
                <div key={type}>
                  <strong className="chip-group-title">{type === 'EXPENSE' ? 'Khoản chi' : 'Khoản thu'}</strong>
                  <div className="chip-row">
                    {CATEGORIES.filter((item) => item[1] === type).map(([category]) => {
                      const active = categoryChoice.has(category);
                      return (
                        <button
                          key={category}
                          type="button"
                          className={`chip${active ? ' active' : ''}`}
                          aria-pressed={active}
                          onClick={() =>
                            setCategoryChoice((current) => {
                              const nextSet = new Set(current);
                              if (nextSet.has(category)) nextSet.delete(category);
                              else nextSet.add(category);
                              return nextSet;
                            })
                          }
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
          {slide === 'transaction' && (
            <>
              <span className="eyebrow">{heading('transaction')} · GHI THỬ</span>
              <h2 id="welcome-title">Ghi khoản chi đầu tiên</h2>
              <p className="form-help">Hôm nay bạn đã tiêu gì? Chỉ cần số tiền và nhóm.</p>
              <span className="money-input money-input-lg">
                <input
                  id="welcome-amount"
                  type="number"
                  min="1"
                  step="1000"
                  inputMode="numeric"
                  placeholder="0"
                  aria-label="Số tiền"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <span aria-hidden="true">₫</span>
              </span>
              <div className="chip-row">
                {[20000, 50000, 100000, 200000].map((value) => (
                  <button key={value} type="button" className="chip" onClick={() => setAmount(String(value))}>
                    {money(value)}
                  </button>
                ))}
              </div>
              {categories.length > 0 && (
                <>
                  <strong className="chip-group-title">Nhóm</strong>
                  <div className="chip-row">
                    {categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        className={`chip${txCategory === category.id ? ' active' : ''}`}
                        aria-pressed={txCategory === category.id}
                        onClick={() => setTxCategory(category.id)}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <input
                maxLength={500}
                placeholder="Ghi chú (không bắt buộc), ví dụ: Ăn sáng"
                aria-label="Ghi chú"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              {wallets.length > 1 && (
                <label>
                  Trả bằng ví
                  <select value={txWallet} onChange={(event) => setTxWallet(event.target.value)}>
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>
                        {wallet.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          {slide === 'done' && (
            <div className="welcome-done">
              <div className="welcome-badge" aria-hidden="true">
                ✓
              </div>
              <h2 id="welcome-title">
                {preview ? 'Người mới thiết lập xong trong khoảng 1 phút' : 'Sổ của bạn đã sẵn sàng!'}
              </h2>
              {preview && (
                <p className="form-help">
                  Người dùng mới sẽ có ví, nhóm thu chi và khoản chi đầu tiên ngay sau các bước vừa rồi. Tài khoản này
                  đã có sẵn dữ liệu mẫu để bạn xem báo cáo, ngân sách và Trợ lý.
                </p>
              )}
              {created.length > 0 && (
                <ul className="welcome-created">
                  {created.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {tips.length > 0 && (
                <>
                  <p className="form-help">Gợi ý theo điều bạn quan tâm:</p>
                  <div className="welcome-tips">
                    {tips.map((tip) => (
                      <div key={tip.label} className="welcome-tip">
                        <span>{tip.text}</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            close();
                            if (tip.tab) ui.setPlanningTab(tip.tab);
                            ui.showView(tip.view);
                          }}
                        >
                          {tip.label} →
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <p className="form-help">Muốn biết mỗi nút nằm ở đâu? Đi một vòng giao diện, chừng 30 giây.</p>
            </div>
          )}
        </div>
        <div className="welcome-actions">
          <button
            id="welcome-back"
            className={`btn btn-ghost btn-sm${index === 0 || slide === 'done' ? ' invisible' : ''}`}
            type="button"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          >
            ← Quay lại
          </button>
          <span />
          <button
            id="welcome-skip"
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => (slide === 'intro' || slide === 'done' ? close() : advance())}
          >
            {slide === 'intro' ? 'Để sau' : slide === 'done' ? 'Vào sổ ngay' : 'Bỏ qua bước này'}
          </button>
          <button id="welcome-next" className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={next}>
            {nextLabel[slide]}
          </button>
        </div>
      </div>
    </Modal>
  );
}
