import { api } from '../core/api';
import { $ } from '../core/dom';
import { escapeHtml } from '../core/format';
import { state } from '../core/state';
import { toast } from '../core/toast';
import { showView } from './navigation';
import { openWelcome } from './welcome';

export function nextOnboardingStep() {
  return state.onboarding?.steps?.find((step) => !step.completed) || null;
}
export function renderOnboarding() {
  const card = $('#onboarding-card');
  if (!card || !state.onboarding) return;
  const data = state.onboarding;
  card.classList.toggle('hidden', data.completed || data.dismissed);
  $('#onboarding-progress-label').textContent = `${data.completedCount}/${data.totalSteps} bước`;
  $('#onboarding-progress-bar').style.width = `${data.progressPercent}%`;
  $('#onboarding-steps').innerHTML = data.steps
    .map(
      (step, index) =>
        `<button class="onboarding-step${step.completed ? ' done' : ''}" type="button" data-onboarding-step="${escapeHtml(step.id)}"><span class="onboarding-step-number">${step.completed ? '✓' : index + 1}</span><span><strong>${escapeHtml(step.title)}</strong><small>${step.completed ? 'Đã hoàn thành' : escapeHtml(step.actionLabel)}</small></span></button>`
    )
    .join('');
  const next = nextOnboardingStep();
  $('#onboarding-continue').textContent = next ? next.actionLabel : 'Xem tổng quan';
}

export async function setOnboardingPreference(patch) {
  state.onboarding = await api('/profile/onboarding', { method: 'PATCH', body: JSON.stringify(patch) });
  renderOnboarding();
}
// Trả về true khi đã mở slide chào mừng, để nơi gọi không bật thêm thông báo đè lên.
export function maybeShowOnboarding() {
  if (!state.onboarding || state.onboarding.completed || state.onboarding.dismissed || state.onboarding.welcomeSeen)
    return false;
  openWelcome();
  return true;
}

export async function performOnboardingStep(stepId) {
  const step = state.onboarding?.steps?.find((item) => item.id === stepId) || nextOnboardingStep();
  if (!step) {
    showView('dashboard');
    return;
  }
  if (step.id === 'profile') {
    $('#open-profile').click();
    return;
  }
  // Các bước còn lại làm ngay trong slide thiết lập: nhanh hơn mở từng form đầy đủ.
  openWelcome(step.id);
}

export function openAgentWithPrompt(prompt) {
  showView('insights');
  const input = $('#assistant-question');
  input.value = prompt;
  input.focus();
}

/** Thẻ tiến trình thiết lập trên Tổng quan. */
export function setupOnboarding() {
  $('#onboarding-continue').addEventListener('click', () => performOnboardingStep(nextOnboardingStep()?.id));
  $('#onboarding-steps').addEventListener('click', (event) => {
    const step = event.target.closest('[data-onboarding-step]');
    if (step) performOnboardingStep(step.dataset.onboardingStep);
  });
  $('#onboarding-dismiss').addEventListener('click', async () => {
    try {
      await setOnboardingPreference({ dismissed: true });
      toast('Muốn làm lại, bấm ảnh đại diện › Làm lại thiết lập ban đầu.');
    } catch (error) {
      toast(error.message, true);
    }
  });
  $('#onboarding-ask-agent').addEventListener('click', () =>
    openAgentWithPrompt('Tôi mới sử dụng Sổ Mộc. Hãy xem trạng thái thiết lập và hướng dẫn tôi bước phù hợp tiếp theo.')
  );
}
