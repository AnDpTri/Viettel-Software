import type { AgentToolName } from '../agent.types';

type JsonSchema = Record<string, unknown>;
const text = (description: string, extra: JsonSchema = {}) => ({ type: 'string', description, ...extra });
const number = (description: string) => ({ type: 'number', description });
const boolean = (description: string) => ({ type: 'boolean', description });
const array = (description: string, items: JsonSchema) => ({ type: 'array', description, items });
const objectSchema = (properties: JsonSchema, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
});
const tool = (name: AgentToolName, description: string, parameters: JsonSchema) => ({
  type: 'function' as const,
  function: { name, description, parameters, strict: false }
});

export const AGENT_TOOL_DEFINITIONS = [
  tool(
    'SEARCH_TRANSACTIONS',
    'Tìm giao dịch theo nội dung, loại, ví, danh mục, ngày hoặc số tiền. Dùng khi cần dữ liệu giao dịch cụ thể.',
    objectSchema({
      query: text('Từ khóa trong ghi chú hoặc người nhận'),
      type: text('INCOME, EXPENSE hoặc TRANSFER', { enum: ['INCOME', 'EXPENSE', 'TRANSFER'] }),
      walletName: text('Tên ví'),
      categoryName: text('Tên danh mục'),
      from: text('Ngày bắt đầu ISO 8601'),
      to: text('Ngày kết thúc ISO 8601'),
      minAmount: number('Số tiền tối thiểu'),
      maxAmount: number('Số tiền tối đa'),
      limit: number('Số kết quả, tối đa 50')
    })
  ),
  tool(
    'FINANCIAL_SUMMARY',
    'Tổng hợp thu, chi và dòng tiền trong một khoảng thời gian.',
    objectSchema({ from: text('Ngày bắt đầu ISO 8601'), to: text('Ngày kết thúc ISO 8601') })
  ),
  tool(
    'EXPORT_TRANSACTIONS_CSV',
    'Chuẩn bị liên kết tải CSV giao dịch theo bộ lọc.',
    objectSchema({
      from: text('Ngày bắt đầu ISO 8601'),
      to: text('Ngày kết thúc ISO 8601'),
      type: text('INCOME, EXPENSE hoặc TRANSFER', { enum: ['INCOME', 'EXPENSE', 'TRANSFER'] }),
      walletName: text('Tên ví'),
      categoryName: text('Tên danh mục')
    })
  ),
  tool(
    'LIST_UPCOMING_BILLS',
    'Liệt kê hóa đơn sắp đến hạn.',
    objectSchema({ days: number('Số ngày sắp tới, mặc định 30') })
  ),
  tool(
    'GET_ONBOARDING_STATUS',
    'Kiểm tra người dùng đã thiết lập hồ sơ, ví, danh mục và giao dịch đến bước nào. Hãy dùng khi người dùng mới, hỏi cách bắt đầu hoặc cần hướng dẫn tiếp theo.',
    objectSchema({})
  ),
  tool(
    'LIST_WALLETS',
    'Liệt kê các ví đang hoạt động để hướng dẫn hoặc giúp người dùng chọn đúng ví.',
    objectSchema({})
  ),
  tool(
    'LIST_CATEGORIES',
    'Liệt kê danh mục thu chi đang hoạt động. Có thể lọc theo loại.',
    objectSchema({ type: text('INCOME hoặc EXPENSE', { enum: ['INCOME', 'EXPENSE'] }) })
  ),
  tool(
    'GET_APP_GUIDE',
    'Đọc hướng dẫn chính xác về vị trí và mục đích các màn hình trong Sổ Mộc.',
    objectSchema({
      topic: text(
        'dashboard, transactions, wallets, categories, budgets, goals, reports, planning, insights hoặc profile'
      )
    })
  ),
  tool(
    'CREATE_TRANSACTION',
    'Tạo bản xem trước cho MỘT khoản thu hoặc chi đã phát sinh; nhiều khoản thì gọi nhiều lần. Dùng cho ghi chép chi tiêu, kể cả ghi chú riêng tư hoặc nhạy cảm. Ví/danh mục có thể là cái vừa đề xuất trong cùng lượt.',
    objectSchema(
      {
        type: text('Loại giao dịch', { enum: ['INCOME', 'EXPENSE'] }),
        amount: number('Số tiền dương'),
        walletId: text('ID ví'),
        walletName: text('Tên ví'),
        categoryId: text('ID danh mục'),
        categoryName: text('Tên danh mục'),
        occurredAt: text('Thời điểm ISO 8601'),
        note: text('Ghi chú nguyên văn, tối đa 500 ký tự'),
        payee: text('Người nhận hoặc đơn vị')
      },
      ['type', 'amount']
    )
  ),
  tool(
    'UPDATE_TRANSACTION',
    'Tạo bản xem trước sửa một giao dịch.',
    objectSchema(
      {
        transactionId: text('ID giao dịch'),
        amount: number('Số tiền mới'),
        categoryId: text('ID danh mục mới'),
        categoryName: text('Tên danh mục mới'),
        occurredAt: text('Thời điểm mới ISO 8601'),
        note: text('Ghi chú mới'),
        payee: text('Người nhận mới'),
        status: text('Trạng thái mới')
      },
      ['transactionId']
    )
  ),
  tool(
    'DELETE_TRANSACTION',
    'Tạo bản xem trước xóa một giao dịch cụ thể.',
    objectSchema({ transactionId: text('ID giao dịch') }, ['transactionId'])
  ),
  tool(
    'CREATE_TRANSFER',
    'Tạo bản xem trước chuyển tiền giữa hai ví.',
    objectSchema(
      {
        amount: number('Số tiền'),
        sourceWalletId: text('ID ví nguồn'),
        sourceWalletName: text('Tên ví nguồn'),
        destinationWalletId: text('ID ví đích'),
        destinationWalletName: text('Tên ví đích'),
        occurredAt: text('Thời điểm ISO 8601'),
        note: text('Ghi chú')
      },
      ['amount']
    )
  ),
  tool(
    'BULK_CATEGORIZE',
    'Tạo bản xem trước phân loại nhiều giao dịch cùng loại.',
    objectSchema(
      {
        transactionIds: array('Danh sách ID giao dịch', { type: 'string' }),
        categoryId: text('ID danh mục'),
        categoryName: text('Tên danh mục')
      },
      ['transactionIds']
    )
  ),
  tool(
    'CREATE_WALLET',
    'Tạo bản xem trước thêm ví.',
    objectSchema(
      {
        name: text('Tên ví'),
        type: text('CASH, BANK, E_WALLET, CREDIT hoặc OTHER'),
        currency: text('Mã tiền tệ 3 ký tự'),
        openingBalance: number('Số dư đầu kỳ')
      },
      ['name', 'type']
    )
  ),
  tool(
    'UPDATE_WALLET',
    'Tạo bản xem trước cập nhật ví.',
    objectSchema(
      {
        walletId: text('ID ví'),
        name: text('Tên mới'),
        type: text('Loại ví mới'),
        currency: text('Tiền tệ mới'),
        openingBalance: number('Số dư đầu kỳ mới')
      },
      ['walletId']
    )
  ),
  tool('ARCHIVE_WALLET', 'Tạo bản xem trước lưu trữ ví.', objectSchema({ walletId: text('ID ví') }, ['walletId'])),
  tool(
    'CREATE_CATEGORY',
    'Tạo bản xem trước thêm danh mục hoặc danh mục con. Danh mục cha có thể là danh mục đã có hoặc danh mục vừa đề xuất trong cùng lượt (tham chiếu bằng parentName).',
    objectSchema(
      {
        name: text('Tên danh mục'),
        type: text('INCOME hoặc EXPENSE', { enum: ['INCOME', 'EXPENSE'] }),
        parentId: text('ID danh mục cha'),
        parentName: text('Tên danh mục cha'),
        color: text('Màu dạng #RRGGBB')
      },
      ['name', 'type']
    )
  ),
  tool(
    'CREATE_STARTER_CATEGORIES',
    'Tạo một bản xem trước cho bộ danh mục khởi đầu cân bằng dành cho người mới. Chỉ dùng khi người dùng đồng ý muốn dùng bộ gợi ý.',
    objectSchema({})
  ),
  tool(
    'UPDATE_CATEGORY',
    'Tạo bản xem trước cập nhật danh mục, kể cả chuyển nó thành danh mục con của danh mục khác.',
    objectSchema(
      {
        categoryId: text('ID danh mục'),
        name: text('Tên mới'),
        color: text('Màu mới'),
        parentId: text('ID danh mục cha mới'),
        parentName: text('Tên danh mục cha mới')
      },
      ['categoryId']
    )
  ),
  tool(
    'ARCHIVE_CATEGORY',
    'Tạo bản xem trước lưu trữ danh mục.',
    objectSchema({ categoryId: text('ID danh mục') }, ['categoryId'])
  ),
  tool(
    'CREATE_BUDGET',
    'Tạo bản xem trước thêm ngân sách.',
    objectSchema(
      {
        name: text('Tên ngân sách'),
        amount: number('Hạn mức'),
        categoryId: text('ID danh mục'),
        categoryName: text('Tên danh mục'),
        startDate: text('Ngày bắt đầu ISO 8601'),
        endDate: text('Ngày kết thúc ISO 8601'),
        rollover: boolean('Có chuyển phần dư hay không')
      },
      ['name', 'amount', 'startDate', 'endDate']
    )
  ),
  tool(
    'UPDATE_BUDGET',
    'Tạo bản xem trước sửa ngân sách.',
    objectSchema(
      {
        budgetId: text('ID ngân sách'),
        name: text('Tên mới'),
        amount: number('Hạn mức mới'),
        startDate: text('Ngày bắt đầu mới'),
        endDate: text('Ngày kết thúc mới'),
        rollover: boolean('Chuyển phần dư')
      },
      ['budgetId']
    )
  ),
  tool(
    'DELETE_BUDGET',
    'Tạo bản xem trước xóa ngân sách.',
    objectSchema({ budgetId: text('ID ngân sách') }, ['budgetId'])
  ),
  tool(
    'CREATE_GOAL',
    'Tạo bản xem trước thêm mục tiêu.',
    objectSchema(
      {
        name: text('Tên mục tiêu'),
        targetAmount: number('Số tiền mục tiêu'),
        currentAmount: number('Số tiền hiện có'),
        targetDate: text('Ngày mục tiêu ISO 8601')
      },
      ['name', 'targetAmount']
    )
  ),
  tool(
    'UPDATE_GOAL',
    'Tạo bản xem trước sửa mục tiêu.',
    objectSchema(
      {
        goalId: text('ID mục tiêu'),
        name: text('Tên mới'),
        targetAmount: number('Số tiền mục tiêu mới'),
        targetDate: text('Ngày mục tiêu mới'),
        status: text('Trạng thái mới')
      },
      ['goalId']
    )
  ),
  tool(
    'CONTRIBUTE_GOAL',
    'Tạo bản xem trước đóng góp vào mục tiêu.',
    objectSchema({ goalId: text('ID mục tiêu'), amount: number('Số tiền đóng góp'), note: text('Ghi chú') }, [
      'goalId',
      'amount'
    ])
  ),
  tool(
    'PAUSE_GOAL',
    'Tạo bản xem trước tạm dừng hoặc tiếp tục mục tiêu.',
    objectSchema({ goalId: text('ID mục tiêu'), paused: boolean('true để tạm dừng') }, ['goalId'])
  ),
  tool('DELETE_GOAL', 'Tạo bản xem trước xóa mục tiêu.', objectSchema({ goalId: text('ID mục tiêu') }, ['goalId'])),
  tool(
    'CREATE_BILL',
    'Tạo bản xem trước hóa đơn cần thanh toán trong tương lai. Không dùng cho khoản chi đã phát sinh.',
    objectSchema(
      {
        name: text('Tên hóa đơn'),
        amount: number('Số tiền'),
        dueAt: text('Hạn thanh toán ISO 8601'),
        walletId: text('ID ví'),
        walletName: text('Tên ví'),
        recurrence: text('Chu kỳ')
      },
      ['name', 'amount', 'dueAt']
    )
  ),
  tool(
    'PAY_BILL',
    'Tạo bản xem trước thanh toán một hóa đơn hiện có.',
    objectSchema(
      {
        billId: text('ID hóa đơn'),
        walletId: text('ID ví'),
        walletName: text('Tên ví'),
        occurredAt: text('Thời điểm thanh toán')
      },
      ['billId']
    )
  ),
  tool(
    'CREATE_RECURRING',
    'Tạo bản xem trước khoản thu chi định kỳ.',
    objectSchema(
      {
        name: text('Tên'),
        type: text('INCOME hoặc EXPENSE'),
        amount: number('Số tiền'),
        walletId: text('ID ví'),
        walletName: text('Tên ví'),
        categoryId: text('ID danh mục'),
        categoryName: text('Tên danh mục'),
        frequency: text('DAILY, WEEKLY, MONTHLY, QUARTERLY hoặc YEARLY'),
        nextRunAt: text('Lần chạy tiếp theo ISO 8601'),
        autoPost: boolean('Tự động ghi sổ')
      },
      ['name', 'type', 'amount', 'frequency', 'nextRunAt']
    )
  ),
  tool(
    'CREATE_AUTOMATION_RULE',
    'Tạo bản xem trước quy tắc phân loại tự động.',
    objectSchema(
      {
        name: text('Tên quy tắc'),
        field: text('note, payee, reference hoặc amount'),
        operator: text('contains, equals, startsWith, gte hoặc lte'),
        value: text('Giá trị so sánh'),
        categoryId: text('ID danh mục'),
        categoryName: text('Tên danh mục'),
        tagName: text('Tên nhãn'),
        priority: number('Độ ưu tiên')
      },
      ['name', 'field', 'operator', 'value']
    )
  ),
  tool(
    'RECONCILE_WALLET',
    'Tạo bản xem trước điều chỉnh số dư ví theo số dư thực tế.',
    objectSchema(
      {
        walletId: text('ID ví'),
        walletName: text('Tên ví'),
        actualBalance: number('Số dư thực tế'),
        occurredAt: text('Thời điểm đối soát'),
        note: text('Ghi chú')
      },
      ['actualBalance']
    )
  ),
  tool(
    'SAVE_MEMORY',
    'Lưu một sở thích hoặc thông tin mà người dùng yêu cầu agent ghi nhớ.',
    objectSchema({ content: text('Thông tin cần nhớ'), kind: text('PREFERENCE, CONTEXT hoặc OTHER') }, ['content'])
  ),
  tool(
    'LIST_MEMORIES',
    'Xem các ghi nhớ dài hạn hiện có của người dùng.',
    objectSchema({ limit: number('Số kết quả, tối đa 50') })
  ),
  tool(
    'DELETE_MEMORY',
    'Xóa một ghi nhớ cụ thể. Cần ID ghi nhớ; nếu chưa biết hãy gọi LIST_MEMORIES trước.',
    objectSchema({ memoryId: text('ID ghi nhớ') }, ['memoryId'])
  ),
  tool(
    'GET_CONVERSATION_HISTORY',
    'Đọc các tin nhắn gần đây trong cuộc trò chuyện hiện tại.',
    objectSchema({ limit: number('Số tin nhắn, tối đa 30') })
  ),
  tool(
    'PREVIEW_DATA_RESET',
    'Chỉ thống kê dữ liệu sẽ bị ảnh hưởng nếu người dùng muốn làm lại từ đầu. Không xóa dữ liệu.',
    objectSchema(
      { scope: text('TRANSACTIONS hoặc ALL_FINANCIAL_DATA', { enum: ['TRANSACTIONS', 'ALL_FINANCIAL_DATA'] }) },
      ['scope']
    )
  ),
  tool(
    'EXPORT_DATA_BACKUP',
    'Chuẩn bị liên kết tải bản sao dữ liệu cá nhân trước thao tác nguy hiểm.',
    objectSchema({})
  )
];
