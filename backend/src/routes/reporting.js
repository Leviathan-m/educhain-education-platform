const express = require('express');
const router = express.Router();
const reportingController = require('../controllers/reportingController');
const { authenticate, authorize } = require('../middleware/auth');

// 대시보드 데이터 조회 (인증된 사용자)
router.get('/dashboard', authenticate, reportingController.getDashboardData);

// 부서별 리포트 생성 (관리자)
router.post('/departments/:departmentId', authenticate, authorize(['admin', 'instructor']), reportingController.generateDepartmentReport);

// 개인별 리포트 생성 (본인 또는 관리자)
router.post('/users/:userId', authenticate, (req, res, next) => {
  // 본인 또는 관리자인 경우 허용
  if (req.user._id === req.params.userId || req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Access denied' });
}, reportingController.generateUserReport);

// 리포트 목록 조회 (관리자)
router.get('/reports', authenticate, authorize(['admin']), reportingController.getReportsList);

// 리포트 삭제 (관리자)
router.delete('/reports/:filename', authenticate, authorize(['admin']), reportingController.deleteReport);

// 리포트 스케줄 설정 (관리자)
router.post('/schedule', authenticate, authorize(['admin']), reportingController.scheduleReports);

// 데이터 익스포트 (관리자)
router.get('/export', authenticate, authorize(['admin']), reportingController.exportData);

module.exports = router;
