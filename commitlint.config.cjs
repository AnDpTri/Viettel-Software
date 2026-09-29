// Ép commit theo Conventional Commits (feat, fix, docs, refactor, test, chore, ci, build, perf, style).
// Mô tả được viết tiếng Việt nên tắt ràng buộc chữ hoa/thường của subject.
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'body-max-line-length': [1, 'always', 120]
  }
};
