import type { Response } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId } from '../../core/http/request';
import { success } from '../../core/http/response';
import { toCsv } from '../../shared/csv';
import { reportPeriod, wantsCsv } from './report.schemas';
import type { ReportService } from './report.service';

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

const day = (date: Date) => date.toISOString().slice(0, 10);

export class ReportController {
  constructor(private readonly reports: ReportService) {}

  summary = asyncHandler(async (req, res) => {
    const { from, to } = reportPeriod(req.query);
    const report = await this.reports.summary(currentUserId(req), from, to);
    if (!wantsCsv(req.query)) return success(res, report);
    const rows = [
      ...report.byCurrency.map((item) => ({ section: 'Tổng hợp', label: item.currency, ...item })),
      ...report.monthly.map((item) => ({
        section: 'Theo tháng',
        label: item.month,
        currency: report.currency,
        income: item.income,
        expense: item.expense,
        net: item.income - item.expense
      })),
      ...report.expenseByCategory.map((item) => ({
        section: 'Chi theo danh mục',
        label: item.categoryName,
        currency: item.currency,
        income: '',
        expense: item.amount,
        net: ''
      }))
    ];
    return sendCsv(
      res,
      `bao-cao-tong-hop_${day(from)}_${day(to)}.csv`,
      toCsv(rows, {
        section: 'Phần',
        label: 'Mục',
        currency: 'Tiền tệ',
        income: 'Thu',
        expense: 'Chi',
        net: 'Chênh lệch'
      })
    );
  });

  reconciliation = asyncHandler(async (req, res) => {
    const report = await this.reports.reconciliation(currentUserId(req));
    if (!wantsCsv(req.query)) return success(res, report);
    return sendCsv(
      res,
      `doi-soat-vi_${day(new Date())}.csv`,
      toCsv(
        report.wallets.map((row) => ({ ...row, archived: row.archived ? 'Có' : 'Không' })),
        {
          walletName: 'Ví',
          currency: 'Tiền tệ',
          openingBalance: 'Số dư đầu kỳ',
          calculatedBalance: 'Số dư tính toán',
          archived: 'Đã lưu trữ'
        }
      )
    );
  });

  netWorth = asyncHandler(async (req, res) => success(res, await this.reports.netWorth(currentUserId(req))));
}
