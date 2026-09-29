import { api } from '../core/api';
import { $ } from '../core/dom';
import { escapeHtml, localDateValue, moneyCurrency, shortDate } from '../core/format';
import { state } from '../core/state';
import { toast } from '../core/toast';
import { fillForm, openModal } from './transactions';

export async function loadInsightOverview() {
  try {
    const insight = await api('/insights/overview');
    const forecast = insight.forecast;
    $('#insight-metrics').innerHTML =
      `<article class="metric-card net"><div class="metric-icon">◎</div><div><span>An toàn có thể chi</span><strong>${moneyCurrency(forecast.safeToSpend, state.user.currency)}</strong><small>Sau hóa đơn và mức chi trung bình</small></div></article><article class="metric-card expense"><div class="metric-icon">!</div><div><span>Khoản bất thường</span><strong>${insight.anomalies.length}</strong><small>Cần kiểm tra lại</small></div></article><article class="metric-card income"><div class="metric-icon">↻</div><div><span>Chi định kỳ nhận diện</span><strong>${insight.subscriptions.length}</strong><small>Mẫu lặp có độ tin cậy cao</small></div></article>`;
    $('#recommendation-list').innerHTML =
      insight.recommendations
        .map(
          (item) =>
            `<article class="recommendation ${item.level}"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.message)}</p></article>`
        )
        .join('') || '<div class="empty">Dòng tiền đang ổn định, chưa có cảnh báo mới.</div>';
  } catch (error) {
    toast(error.message, true);
  }
}

/** Phân tích nhanh và nhập giao dịch bằng câu tiếng Việt tự nhiên. */
export function setupInsights() {
  $('#refresh-insights').addEventListener('click', loadInsightOverview);
  $('#natural-transaction-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const parsed = await api('/insights/parse-transaction', {
        method: 'POST',
        body: JSON.stringify({ text: $('#natural-transaction').value })
      });
      $('#natural-result').innerHTML =
        `<strong>${parsed.type === 'INCOME' ? 'Khoản thu' : 'Khoản chi'} · ${moneyCurrency(parsed.amount, state.user.currency)}</strong><p>${escapeHtml(parsed.note || 'Không có ghi chú')} · ${shortDate(parsed.occurredAt)}</p><button id="use-natural-result" class="outline-btn" type="button">Dùng kết quả để tạo giao dịch</button>`;
      $('#use-natural-result').onclick = () => {
        openModal();
        $(`input[name="type"][value="${parsed.type}"]`).checked = true;
        fillForm();
        $('#tx-amount').value = parsed.amount;
        $('#tx-note').value = parsed.note;
        $('#tx-date').value = localDateValue(new Date(parsed.occurredAt));
      };
    } catch (error) {
      toast(error.message, true);
    }
  });
}
