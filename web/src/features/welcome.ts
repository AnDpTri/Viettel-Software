/* eslint-disable @typescript-eslint/no-explicit-any -- dữ liệu API và phần tử DOM chưa được gán kiểu chi tiết. */
import { api } from '../core/api';
import { $, $$ } from '../core/dom';
import { escapeHtml, money } from '../core/format';
import { closeNamedModal, openNamedModal } from '../core/modal';
import { state } from '../core/state';
import { LAST_WALLET_KEY, storageSet } from '../core/storage';
import { toast } from '../core/toast';
import { render } from './dashboard';
import { displayName, showView } from './navigation';
import { setOnboardingPreference } from './onboarding';
import { selectPlanningTab } from './planning';
import { loadData } from './session';
import { startTour, tourStorageKey } from './tour';

// Slide thiết lập cho người mới: mỗi màn một câu hỏi, bấm chọn là xong, tạo dữ liệu thật ngay.
export const WELCOME_INTERESTS = [
  { id: 'track', icon: '🧾', title: 'Biết tiền đi đâu', text: 'Ghi thu chi, xem mình tiêu nhiều vào đâu' },
  { id: 'budget', icon: '🎯', title: 'Không chi quá tay', text: 'Đặt hạn mức cho tháng hoặc từng nhóm' },
  { id: 'save', icon: '🐷', title: 'Tiết kiệm cho mục tiêu', text: 'Mua xe, du lịch, quỹ dự phòng' },
  { id: 'bills', icon: '📅', title: 'Nhớ hóa đơn, khoản định kỳ', text: 'Tiền nhà, điện nước, lương về' }
];
export const WELCOME_WALLETS = [
  { type: 'CASH', icon: '💵', name: 'Tiền mặt' },
  { type: 'BANK', icon: '🏦', name: 'Tài khoản ngân hàng' },
  { type: 'E_WALLET', icon: '📱', name: 'Ví điện tử' }
];
export const WELCOME_CATEGORIES = [
  ['Ăn uống', 'EXPENSE'],
  ['Di chuyển', 'EXPENSE'],
  ['Mua sắm', 'EXPENSE'],
  ['Hóa đơn', 'EXPENSE'],
  ['Sức khỏe', 'EXPENSE'],
  ['Giải trí', 'EXPENSE'],
  ['Lương', 'INCOME'],
  ['Thu nhập khác', 'INCOME']
];
export const WELCOME_TIPS = {
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
let welcome: any = null;
export function stepDone(id) {
  return Boolean(state.onboarding?.steps?.find((step) => step.id === id)?.completed);
}
export function openWelcome(startAt?: string) {
  const pending = ['wallet', 'categories', 'transaction'].filter((id) => !stepDone(id));
  const slides = startAt ? pending.slice(Math.max(0, pending.indexOf(startAt))) : ['intro', ...pending];
  const saved = state.onboarding?.interests;
  welcome = {
    slides: [...slides, 'done'],
    index: 0,
    interests: new Set(Array.isArray(saved) ? saved : []),
    created: []
  };
  if (!startAt && !state.onboarding?.welcomeSeen)
    void setOnboardingPreference({ welcomeSeen: true }).catch(() => undefined);
  renderWelcome();
  openNamedModal('welcome-modal', '#welcome-next');
}
export function welcomeHeading(slide) {
  const dataSlides = welcome.slides.filter((id) => !['intro', 'done'].includes(id));
  const index = dataSlides.indexOf(slide);
  return index < 0 ? '' : `BƯỚC ${index + 1}/${dataSlides.length}`;
}
export function renderWelcome() {
  const slide = welcome.slides[welcome.index];
  const box = $('#welcome-slide');
  const activeWallets = state.wallets.filter((wallet) => !wallet.archivedAt);
  $('#welcome-dots').innerHTML = welcome.slides
    .map(
      (_, index) => `<span class="${index === welcome.index ? 'active' : index < welcome.index ? 'done' : ''}"></span>`
    )
    .join('');
  if (slide === 'intro') {
    const needName = !(state.user.fullName || '').trim();
    box.innerHTML = `<span class="eyebrow">CHÀO MỪNG ĐẾN SỔ MỘC</span><h2 id="welcome-title">Chào ${escapeHtml(needName ? 'bạn' : displayName())}! Bạn muốn Sổ Mộc giúp gì?</h2><p class="form-help">Chọn một hoặc nhiều. Khoảng 1 phút nữa là sổ của bạn sẵn sàng.</p>${needName ? '<label>Mình nên gọi bạn là gì?<input id="welcome-name" maxlength="120" autocomplete="name" placeholder="Ví dụ: Minh Anh"></label>' : ''}<div class="choice-grid">${WELCOME_INTERESTS.map((item) => `<button type="button" class="choice-card${welcome.interests.has(item.id) ? ' selected' : ''}" aria-pressed="${welcome.interests.has(item.id)}" data-interest="${item.id}"><span class="choice-icon" aria-hidden="true">${item.icon}</span><strong>${item.title}</strong><small>${item.text}</small></button>`).join('')}</div>`;
  } else if (slide === 'wallet') {
    box.innerHTML = `<span class="eyebrow">${welcomeHeading(slide)} · NƠI GIỮ TIỀN</span><h2 id="welcome-title">Tiền của bạn đang ở đâu?</h2><p class="form-help">Mỗi nơi là một “ví”. Nhập số tiền đang có, ước chừng cũng được; sửa sau ở Thiết lập › Ví của tôi.</p><div class="wallet-choices">${WELCOME_WALLETS.map((item, index) => `<label class="wallet-choice"><input type="checkbox" data-welcome-wallet="${item.type}"${index === 0 ? ' checked' : ''}><span class="choice-icon" aria-hidden="true">${item.icon}</span><span class="wallet-choice-name">${item.name}</span><span class="money-input"><input type="number" min="0" step="1000" inputmode="numeric" placeholder="0" data-welcome-balance="${item.type}" aria-label="Số tiền đang có trong ${item.name}"><span>₫</span></span></label>`).join('')}</div>`;
  } else if (slide === 'categories') {
    const group = (type, title) =>
      `<strong class="chip-group-title">${title}</strong><div class="chip-row">${WELCOME_CATEGORIES.filter(
        (item) => item[1] === type
      )
        .map(
          ([name]) =>
            `<button type="button" class="chip active" aria-pressed="true" data-welcome-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`
        )
        .join('')}</div>`;
    box.innerHTML = `<span class="eyebrow">${welcomeHeading(slide)} · NHÓM THU CHI</span><h2 id="welcome-title">Bạn hay tiêu vào đâu?</h2><p class="form-help">Mỗi khoản thu chi thuộc một nhóm để báo cáo cho biết tiền đi đâu. Bỏ chọn nhóm không cần; thêm nhóm riêng sau ở Thiết lập › Danh mục.</p>${group('EXPENSE', 'Khoản chi')}${group('INCOME', 'Khoản thu')}`;
  } else if (slide === 'transaction') {
    const expense = state.categories.filter((item) => item.type === 'EXPENSE' && !item.archivedAt);
    box.innerHTML = `<span class="eyebrow">${welcomeHeading(slide)} · GHI THỬ</span><h2 id="welcome-title">Ghi khoản chi đầu tiên</h2><p class="form-help">Hôm nay bạn đã tiêu gì? Chỉ cần số tiền và nhóm.</p><div class="money-input big"><input id="welcome-amount" type="number" min="1" step="1000" inputmode="numeric" placeholder="0" aria-label="Số tiền"><span>₫</span></div><div class="chip-row quick-amounts">${[20000, 50000, 100000, 200000].map((value) => `<button type="button" class="chip" data-welcome-amount="${value}">${money(value)}</button>`).join('')}</div>${expense.length ? `<strong class="chip-group-title">Nhóm</strong><div class="chip-row">${expense.map((item, index) => `<button type="button" class="chip${index === 0 ? ' active' : ''}" data-welcome-tx-category="${item.id}">${escapeHtml(item.name)}</button>`).join('')}</div>` : ''}<input id="welcome-note" maxlength="500" placeholder="Ghi chú (không bắt buộc), ví dụ: Ăn sáng">${activeWallets.length > 1 ? `<label>Trả bằng ví<select id="welcome-wallet">${activeWallets.map((wallet) => `<option value="${wallet.id}">${escapeHtml(wallet.name)}</option>`).join('')}</select></label>` : ''}`;
  } else {
    const tips = [...welcome.interests].map((id) => WELCOME_TIPS[id]).filter(Boolean);
    box.innerHTML = `<div class="welcome-done"><div class="welcome-badge" aria-hidden="true">✓</div><h2 id="welcome-title">Sổ của bạn đã sẵn sàng!</h2>${welcome.created.length ? `<ul class="welcome-created">${welcome.created.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}${tips.length ? `<p class="form-help">Gợi ý theo điều bạn quan tâm:</p><div class="welcome-tips">${tips.map((tip) => `<div class="welcome-tip"><span>${escapeHtml(tip.text)}</span><button type="button" class="text-btn" data-welcome-go="${tip.view}"${tip.tab ? ` data-welcome-tab="${tip.tab}"` : ''}>${escapeHtml(tip.label)} →</button></div>`).join('')}</div>` : ''}<p class="form-help">Muốn biết mỗi nút nằm ở đâu? Đi một vòng giao diện, chừng 30 giây.</p></div>`;
  }
  const last = slide === 'done';
  $('#welcome-back').classList.toggle('invisible', welcome.index === 0 || last);
  $('#welcome-skip').textContent = slide === 'intro' ? 'Để sau' : last ? 'Vào sổ ngay' : 'Bỏ qua bước này';
  $('#welcome-next').textContent =
    slide === 'intro'
      ? 'Bắt đầu →'
      : slide === 'wallet'
        ? 'Tạo ví →'
        : slide === 'categories'
          ? 'Dùng các nhóm này →'
          : slide === 'transaction'
            ? 'Lưu khoản chi →'
            : 'Đi một vòng giao diện';
  requestAnimationFrame(() => box.querySelector('input:not([type="checkbox"]),.choice-card')?.focus());
}
export async function welcomeNext() {
  const slide = welcome.slides[welcome.index];
  if (slide === 'intro') {
    const name = $('#welcome-name')?.value.trim();
    if (name) {
      state.user = await api('/profile', { method: 'PATCH', body: JSON.stringify({ fullName: name }) });
    }
    state.onboarding = await api('/profile/onboarding', {
      method: 'PATCH',
      body: JSON.stringify({ interests: [...welcome.interests], welcomeSeen: true })
    });
  } else if (slide === 'wallet') {
    const chosen = WELCOME_WALLETS.filter((item) => $(`[data-welcome-wallet="${item.type}"]`).checked);
    if (!chosen.length) {
      toast('Chọn ít nhất một nơi bạn đang giữ tiền.', true);
      return false;
    }
    for (const item of chosen) {
      await api('/wallets', {
        method: 'POST',
        body: JSON.stringify({
          name: item.name,
          type: item.type,
          currency: state.user.currency || 'VND',
          openingBalance: Number($(`[data-welcome-balance="${item.type}"]`).value || 0)
        })
      });
    }
    welcome.created.push(`Tạo ${chosen.length} ví: ${chosen.map((item) => item.name).join(', ')}`);
  } else if (slide === 'categories') {
    const names = $$('[data-welcome-category].active').map((chip) => chip.dataset.welcomeCategory);
    if (names.length) {
      const result = await api('/profile/onboarding/starter-categories', {
        method: 'POST',
        body: JSON.stringify({ names })
      });
      if (result.created) welcome.created.push(`Tạo ${result.created} nhóm thu chi`);
    }
  } else if (slide === 'transaction') {
    const amount = Number($('#welcome-amount').value);
    if (!(amount > 0)) {
      toast('Nhập số tiền, hoặc bấm “Bỏ qua bước này”.', true);
      $('#welcome-amount').focus();
      return false;
    }
    const walletId = $('#welcome-wallet')?.value || state.wallets.find((wallet) => !wallet.archivedAt)?.id;
    await api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'EXPENSE',
        amount,
        walletId,
        categoryId: $('[data-welcome-tx-category].active')?.dataset.welcomeTxCategory || null,
        note: $('#welcome-note').value.trim() || null,
        occurredAt: new Date().toISOString()
      })
    });
    storageSet(LAST_WALLET_KEY, walletId);
    welcome.created.push(`Ghi khoản chi ${money(amount)}`);
  } else {
    closeNamedModal('welcome-modal');
    welcome = null;
    startTour('main', true);
    return false;
  }
  if (slide !== 'intro') {
    await loadData();
    render();
  }
  return true;
}
export function welcomeAdvance() {
  welcome.index = Math.min(welcome.index + 1, welcome.slides.length - 1);
  renderWelcome();
}

/** Chuỗi slide thiết lập ban đầu. */
export function setupWelcome() {
  $('#welcome-next').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (await welcomeNext()) welcomeAdvance();
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  $('#welcome-back').addEventListener('click', () => {
    if (welcome.index > 0) {
      welcome.index -= 1;
      renderWelcome();
    }
  });
  $('#welcome-skip').addEventListener('click', () => {
    const slide = welcome.slides[welcome.index];
    if (slide === 'intro' || slide === 'done') {
      closeNamedModal('welcome-modal');
      welcome = null;
      return;
    }
    welcomeAdvance();
  });
  $('#welcome-close').addEventListener('click', () => {
    closeNamedModal('welcome-modal');
    welcome = null;
  });
  $('#welcome-slide').addEventListener('click', (event) => {
    const interest = event.target.closest('[data-interest]');
    if (interest) {
      const id = interest.dataset.interest;
      if (welcome.interests.has(id)) welcome.interests.delete(id);
      else welcome.interests.add(id);
      interest.classList.toggle('selected');
      interest.setAttribute('aria-pressed', String(welcome.interests.has(id)));
    }
    const category = event.target.closest('[data-welcome-category]');
    if (category) {
      category.classList.toggle('active');
      category.setAttribute('aria-pressed', String(category.classList.contains('active')));
    }
    const amount = event.target.closest('[data-welcome-amount]');
    if (amount) {
      $('#welcome-amount').value = amount.dataset.welcomeAmount;
    }
    const txCategory = event.target.closest('[data-welcome-tx-category]');
    if (txCategory)
      $$('[data-welcome-tx-category]').forEach((chip) => chip.classList.toggle('active', chip === txCategory));
    const go = event.target.closest('[data-welcome-go]');
    if (go) {
      closeNamedModal('welcome-modal');
      welcome = null;
      if (go.dataset.welcomeTab) selectPlanningTab(go.dataset.welcomeTab);
      showView(go.dataset.welcomeGo);
    }
  });
  $('#welcome-slide').addEventListener('input', (event) => {
    const type = event.target.dataset?.welcomeBalance;
    if (type && event.target.value) $(`[data-welcome-wallet="${type}"]`).checked = true;
  });
  document.addEventListener('click', (event: any) => {
    if (event.target.closest('[data-welcome-open]')) openWelcome();
  });
  $('#restart-welcome').addEventListener('click', async () => {
    try {
      state.onboarding = await api('/profile/onboarding', { method: 'PATCH', body: JSON.stringify({ restart: true }) });
      storageSet(tourStorageKey(), '[]');
      closeNamedModal('profile-modal');
      render();
      openWelcome();
    } catch (error) {
      toast(error.message, true);
    }
  });
}
