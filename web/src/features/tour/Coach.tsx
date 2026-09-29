import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useOnboarding } from '../../api/queries';
import { useUser } from '../../app/auth';
import { useUi } from '../../app/ui-state';
import { autoToursDisabled, markTourSeen, seenTours, TOURS, tourTarget } from './tours';

const MOBILE = '(max-width: 950px)';

/** Lớp hướng dẫn: làm tối màn hình, chỉ sáng đúng phần tử cần biết, kèm một câu giải thích và nút Tiếp/Bỏ qua. */
export function Coach() {
  const { tour, startTour, endTour, view, setSidebarOpen } = useUi();
  const user = useUser();
  const onboarding = useOnboarding().data;
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const steps = tour ? (TOURS[tour.id] ?? []) : [];
  const step = steps[index];

  const finish = useCallback(() => {
    if (tour) markTourSeen(user.id, tour.id);
    endTour();
    if (matchMedia(MOBILE).matches) setSidebarOpen(false);
  }, [tour, user.id, endTour, setSidebarOpen]);

  // Bắt đầu vòng mới (vòng đã xem thì bỏ qua, trừ khi mở thủ công).
  useEffect(() => {
    if (!tour) return;
    if (!TOURS[tour.id] || (!tour.force && seenTours(user.id).includes(tour.id))) endTour();
    setIndex(0);
    setTarget(null);
  }, [tour, user.id, endTour]);

  // Tìm phần tử của bước hiện tại; phần tử trong menu trên mobile cần mở menu và chờ menu trượt ra.
  useEffect(() => {
    if (!tour || !step) {
      if (tour && !step) finish();
      return;
    }
    const inSidebar = ([] as string[]).concat(step.target).some((selector) => selector.startsWith('.nav-item'));
    const mobile = matchMedia(MOBILE).matches;
    if (mobile) setSidebarOpen(inSidebar);
    const timer = setTimeout(
      () => {
        const element = tourTarget(step);
        if (!element) return setIndex((current) => current + 1);
        if (!element.closest('.sidebar,.topbar')) element.scrollIntoView({ block: 'center' });
        setTarget(element);
        nextRef.current?.focus();
      },
      mobile ? 280 : 0
    );
    return () => clearTimeout(timer);
  }, [tour, step, finish, setSidebarOpen]);

  const position = useCallback(() => {
    const spot = spotRef.current;
    const bubble = bubbleRef.current;
    if (!target || !spot || !bubble) return;
    const rect = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(spot.style, {
      left: `${rect.left - pad}px`,
      top: `${rect.top - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`
    });
    const width = Math.min(320, innerWidth - 24);
    bubble.style.width = `${width}px`;
    const height = bubble.offsetHeight;
    const below = rect.bottom + pad + 14 + height <= innerHeight;
    const beside = rect.right + pad + 14 + width <= innerWidth && rect.left < innerWidth / 3;
    let left = beside ? rect.right + pad + 14 : rect.left + rect.width / 2 - width / 2;
    let top = beside
      ? rect.top + rect.height / 2 - height / 2
      : below
        ? rect.bottom + pad + 14
        : rect.top - pad - 14 - height;
    left = Math.max(12, Math.min(left, innerWidth - width - 12));
    top = Math.max(12, Math.min(top, innerHeight - height - 12));
    Object.assign(bubble.style, { left: `${left}px`, top: `${top}px` });
  }, [target]);

  useLayoutEffect(position, [position, index]);
  useEffect(() => {
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [position]);

  useEffect(() => {
    if (!tour) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && finish();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [tour, finish]);

  // Vòng ngắn tự hiện ở lần đầu mở một màn hình (sau khi người dùng đã qua slide chào mừng).
  useEffect(() => {
    if (!TOURS[view] || tour || autoToursDisabled() || !onboarding?.welcomeSeen || seenTours(user.id).includes(view))
      return;
    const timer = setTimeout(() => {
      if (!document.querySelector('.modal:not(.hidden)')) startTour(view);
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ xét khi đổi màn hình
  }, [view, onboarding?.welcomeSeen]);

  const visible = Boolean(tour && step && target);
  return (
    <div id="coach" className={`coach${visible ? '' : ' hidden'}`} aria-hidden={!visible}>
      <div className="coach-spot" ref={spotRef} />
      <div className="coach-bubble" role="dialog" aria-live="polite" aria-labelledby="coach-title" ref={bubbleRef}>
        <span id="coach-count" className="coach-count">
          {visible ? `${index + 1}/${steps.length}` : ''}
        </span>
        <strong id="coach-title">{visible ? step!.title : ''}</strong>
        <p id="coach-text">{visible ? step!.text : ''}</p>
        <div className="coach-actions">
          <button
            id="coach-skip"
            className={`btn btn-ghost btn-sm${index === steps.length - 1 ? ' invisible' : ''}`}
            type="button"
            onClick={finish}
          >
            Bỏ qua
          </button>
          <button
            id="coach-next"
            ref={nextRef}
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => {
              if (index + 1 >= steps.length) finish();
              else setIndex(index + 1);
            }}
          >
            {index === steps.length - 1 ? 'Xong' : 'Tiếp'}
          </button>
        </div>
      </div>
    </div>
  );
}
