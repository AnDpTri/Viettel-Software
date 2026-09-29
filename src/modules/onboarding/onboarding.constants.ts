/** 4 bước thiết lập cốt lõi; tiến độ được suy ra từ dữ liệu thật chứ không lưu cờ riêng. */
export const ONBOARDING_STEPS = [
  {
    id: 'profile',
    title: 'Hoàn thiện hồ sơ',
    description: 'Kiểm tra họ tên, tiền tệ và múi giờ.',
    view: 'profile',
    actionLabel: 'Mở hồ sơ'
  },
  {
    id: 'wallet',
    title: 'Tạo ví đầu tiên',
    description: 'Cho Sổ Mộc biết bạn đang quản lý tiền ở đâu.',
    view: 'wallets',
    actionLabel: 'Tạo ví'
  },
  {
    id: 'categories',
    title: 'Thiết lập danh mục',
    description: 'Phân loại khoản thu và chi để báo cáo chính xác.',
    view: 'categories',
    actionLabel: 'Chọn danh mục'
  },
  {
    id: 'transaction',
    title: 'Ghi giao dịch đầu tiên',
    description: 'Ghi một khoản thu hoặc chi để bắt đầu theo dõi.',
    view: 'transactions',
    actionLabel: 'Ghi giao dịch'
  }
] as const;

/** Bộ danh mục gợi ý cho người mới, chỉ tạo khi người dùng đồng ý. */
export const STARTER_CATEGORIES = [
  { name: 'Lương', type: 'INCOME' as const, icon: '↙', color: '#2f8f68' },
  { name: 'Thu nhập khác', type: 'INCOME' as const, icon: '＋', color: '#589d7d' },
  { name: 'Ăn uống', type: 'EXPENSE' as const, icon: '◉', color: '#db7042' },
  { name: 'Di chuyển', type: 'EXPENSE' as const, icon: '↗', color: '#4d83e6' },
  { name: 'Mua sắm', type: 'EXPENSE' as const, icon: '◇', color: '#a56cc1' },
  { name: 'Hóa đơn', type: 'EXPENSE' as const, icon: '▤', color: '#c28b36' },
  { name: 'Sức khỏe', type: 'EXPENSE' as const, icon: '＋', color: '#d65f6e' },
  { name: 'Giải trí', type: 'EXPENSE' as const, icon: '☆', color: '#577c70' }
];

/** Mối quan tâm người dùng chọn ở hộp chào mừng. */
export const ONBOARDING_INTERESTS = ['track', 'budget', 'save', 'bills'] as const;

/** Vị trí và mục đích từng màn hình, dùng cho hướng dẫn và cho Agent. */
export const APP_GUIDE = {
  dashboard: {
    title: 'Tổng quan',
    description: 'Xem tài sản, thu, chi, dòng tiền và các giao dịch gần nhất. Tab Báo cáo nằm ngay cạnh.',
    view: 'dashboard'
  },
  transactions: { title: 'Giao dịch', description: 'Ghi, lọc, chỉnh sửa và xuất giao dịch CSV.', view: 'transactions' },
  wallets: {
    title: 'Ví của tôi',
    description: 'Quản lý tiền mặt, tài khoản ngân hàng, ví điện tử và thẻ. Nằm trong nhóm Thiết lập ở menu.',
    view: 'wallets'
  },
  categories: {
    title: 'Danh mục',
    description: 'Tổ chức khoản thu chi theo danh sách hoặc dạng cây. Nằm trong nhóm Thiết lập ở menu.',
    view: 'categories'
  },
  budgets: {
    title: 'Kế hoạch › Ngân sách',
    description: 'Đặt hạn mức chi tiêu theo thời gian hoặc danh mục.',
    view: 'budgets'
  },
  goals: {
    title: 'Kế hoạch › Mục tiêu',
    description:
      'Tiết kiệm cho kế hoạch tương lai. Mục tiêu liên kết ví tiết kiệm thì mỗi lần góp là một khoản chuyển tiền thật từ ví khác sang.',
    view: 'goals'
  },
  reports: {
    title: 'Tổng quan › Báo cáo',
    description: 'Xem dòng tiền theo kỳ, đối soát số dư ví và xuất CSV. Đổi khoảng ngày là báo cáo tự tính lại.',
    view: 'reports'
  },
  planning: {
    title: 'Kế hoạch › Định kỳ, Hóa đơn, Nhãn, Gia đình',
    description: 'Khoản thu chi lặp lại, nhắc hóa đơn, nhãn và nhóm gia đình dùng chung.',
    view: 'planning'
  },
  insights: { title: 'Trợ lý', description: 'Hỏi về tài chính hoặc nhờ Agent thao tác có xác nhận.', view: 'insights' },
  profile: {
    title: 'Hồ sơ',
    description:
      'Bấm ảnh đại diện góc trên để cập nhật tài khoản, giao diện sáng tối, phiên đăng nhập, bảo mật và xem lại hướng dẫn.',
    view: 'profile'
  }
} as const;
