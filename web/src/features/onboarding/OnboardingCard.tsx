import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { queryKeys, useOnboarding } from '../../api/queries';
import type { OnboardingStatus } from '../../api/types';
import { useUi } from '../../app/ui-state';
import { Progress } from '../../app/view';
import { errorMessage, useToast } from '../../ui/Toast';

/** Lưu cờ hướng dẫn (đã xem, tạm ẩn, làm lại, mối quan tâm) và cập nhật trạng thái trong bộ nhớ đệm. */
export function useOnboardingPreference() {
  const client = useQueryClient();
  return async (patch: Record<string, unknown>) => {
    const status = await api<OnboardingStatus>('/profile/onboarding', { method: 'PATCH', body: patch });
    client.setQueryData(queryKeys.onboarding, status);
    return status;
  };
}

/** Bước tiếp theo: hồ sơ mở form hồ sơ, các bước còn lại làm ngay trong slide thiết lập. */
export function useOnboardingStep() {
  const { openModal, showView } = useUi();
  const onboarding = useOnboarding().data;
  return (stepId?: string) => {
    const step =
      onboarding?.steps.find((item) => item.id === stepId) ?? onboarding?.steps.find((item) => !item.completed);
    if (!step) return showView('dashboard');
    if (step.id === 'profile') return openModal('profile', null);
    openModal('welcome', step.id);
  };
}

/** Thẻ tiến trình thiết lập trên Tổng quan; ẩn khi đã xong hoặc người dùng tạm ẩn. */
export function OnboardingCard() {
  const { data } = useOnboarding();
  const { askAgent } = useUi();
  const toast = useToast();
  const setPreference = useOnboardingPreference();
  const performStep = useOnboardingStep();
  const hidden = !data || data.completed || data.dismissed;
  const next = data?.steps.find((step) => !step.completed);

  return (
    <section
      id="onboarding-card"
      className={`panel onboarding-card${hidden ? ' hidden' : ''}`}
      aria-labelledby="onboarding-title"
    >
      <div className="onboarding-head">
        <div>
          <span className="eyebrow">BẮT ĐẦU NHANH</span>
          <h2 id="onboarding-title">Thiết lập Sổ Mộc</h2>
          <p>Hoàn thành từng bước nhỏ để báo cáo và Trợ lý hỗ trợ chính xác hơn.</p>
        </div>
        <button
          id="onboarding-dismiss"
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={async () => {
            try {
              await setPreference({ dismissed: true });
              toast('Muốn làm lại, bấm ảnh đại diện › Làm lại thiết lập ban đầu.');
            } catch (error) {
              toast(errorMessage(error), true);
            }
          }}
        >
          Để sau
        </button>
      </div>
      {data && (
        <>
          <div className="onboarding-progress">
            <span id="onboarding-progress-label">
              {data.completedCount}/{data.totalSteps} bước
            </span>
            <Progress percent={data.progressPercent} />
          </div>
          <div id="onboarding-steps" className="onboarding-steps">
            {data.steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={`onboarding-step${step.completed ? ' done' : ''}`}
                data-onboarding-step={step.id}
                onClick={() => performStep(step.id)}
              >
                <span className="onboarding-step-number" aria-hidden="true">
                  {step.completed ? '✓' : index + 1}
                </span>
                <span>
                  <strong>{step.title}</strong>
                  <small>{step.completed ? 'Đã hoàn thành' : step.actionLabel}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="onboarding-footer">
        <button
          id="onboarding-continue"
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => performStep(next?.id)}
        >
          {next ? next.actionLabel : 'Xem tổng quan'}
        </button>
        <button
          id="onboarding-ask-agent"
          className="btn btn-outline btn-sm"
          type="button"
          onClick={() =>
            askAgent('Tôi mới sử dụng Sổ Mộc. Hãy xem trạng thái thiết lập và hướng dẫn tôi bước phù hợp tiếp theo.')
          }
        >
          Hỏi Trợ lý hướng dẫn
        </button>
      </div>
    </section>
  );
}
