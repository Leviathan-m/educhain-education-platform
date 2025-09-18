const reportingService = require('../services/reportingService');
const logger = require('../utils/logger');

// 부서별 성과 리포트 생성
exports.generateDepartmentReport = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '시작일과 종료일을 지정해주세요.'
      });
    }

    const period = { start: startDate, end: endDate };

    logger.info(`Generating department report for ${departmentId}`);

    const report = await reportingService.scheduleDepartmentReport(departmentId, period);

    res.json({
      success: true,
      message: '부서 리포트가 성공적으로 생성되었습니다.',
      data: report
    });

  } catch (error) {
    logger.error('Error generating department report:', error);
    res.status(500).json({
      success: false,
      message: '부서 리포트 생성 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// 개인별 성과 리포트 생성
exports.generateUserReport = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '시작일과 종료일을 지정해주세요.'
      });
    }

    const period = { start: startDate, end: endDate };

    logger.info(`Generating user report for ${userId}`);

    const metrics = await reportingService.calculateUserMetrics(userId, period);

    // 차트 데이터 생성
    const chartData = [
      { label: '코스 완료율', value: metrics.completionRate },
      { label: '평균 점수', value: metrics.avgScore },
      { label: 'NFT 획득', value: metrics.nftEarned },
      { label: '총 학습 시간', value: Math.round(metrics.totalTime / 3600) }
    ];

    const chartImage = await reportingService.generateChartImage(chartData, 'bar', {
      title: '개인 성과 지표',
      width: 600,
      height: 400
    });

    const report = await reportingService.generatePDFReport(metrics, [chartImage], {
      title: `개인 성과 리포트`,
      reportType: 'user',
      entityId: userId,
      period
    });

    res.json({
      success: true,
      message: '개인 리포트가 성공적으로 생성되었습니다.',
      data: {
        metrics,
        report
      }
    });

  } catch (error) {
    logger.error('Error generating user report:', error);
    res.status(500).json({
      success: false,
      message: '개인 리포트 생성 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// 실시간 대시보드 데이터 조회
exports.getDashboardData = async (req, res) => {
  try {
    const { departmentId, period = '30d' } = req.query;

    // 기간 계산
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    const periodObj = {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };

    let metrics;
    let timeSeriesData;

    if (departmentId) {
      // 부서별 데이터
      metrics = await reportingService.calculateDepartmentMetrics(departmentId, periodObj);
      timeSeriesData = await reportingService.generateTimeSeriesData(departmentId, 'course_completion', periodObj);
    } else {
      // 전체 데이터 (간단한 구현)
      metrics = {
        courseCompletion: [],
        nftIssuance: { totalNFTs: 0, avgESGScore: 0 },
        learningTime: []
      };
      timeSeriesData = [];
    }

    // 예측 데이터 생성
    const predictions = reportingService.calculateTrendPrediction(timeSeriesData);

    res.json({
      success: true,
      data: {
        metrics,
        timeSeries: timeSeriesData,
        predictions,
        period: periodObj
      }
    });

  } catch (error) {
    logger.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: '대시보드 데이터 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// 리포트 목록 조회
exports.getReportsList = async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');

    const reportsDir = path.join(__dirname, '../../reports');

    try {
      const files = await fs.readdir(reportsDir);
      const reports = files
        .filter(file => file.endsWith('.html') || file.endsWith('.pdf'))
        .map(file => ({
          filename: file,
          url: `/reports/${file}`,
          createdAt: new Date(parseInt(file.split('_').pop().replace(/\.(html|pdf)$/, ''))).toISOString(),
          type: file.includes('department') ? 'department' : 'user',
          format: file.endsWith('.html') ? 'html' : 'pdf'
        }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.json({
        success: true,
        data: reports
      });

    } catch (dirError) {
      // reports 디렉토리가 없는 경우
      res.json({
        success: true,
        data: []
      });
    }

  } catch (error) {
    logger.error('Error fetching reports list:', error);
    res.status(500).json({
      success: false,
      message: '리포트 목록 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// 리포트 삭제
exports.deleteReport = async (req, res) => {
  try {
    const { filename } = req.params;
    const fs = require('fs').promises;
    const path = require('path');

    const filepath = path.join(__dirname, '../../reports', filename);

    try {
      await fs.unlink(filepath);
      logger.info(`Report deleted: ${filename}`);

      res.json({
        success: true,
        message: '리포트가 성공적으로 삭제되었습니다.'
      });

    } catch (fileError) {
      if (fileError.code === 'ENOENT') {
        return res.status(404).json({
          success: false,
          message: '리포트를 찾을 수 없습니다.'
        });
      }
      throw fileError;
    }

  } catch (error) {
    logger.error('Error deleting report:', error);
    res.status(500).json({
      success: false,
      message: '리포트 삭제 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// 리포트 스케줄 설정 (관리자용)
exports.scheduleReports = async (req, res) => {
  try {
    const { schedules } = req.body;

    // 실제 구현에서는 데이터베이스에 스케줄 정보를 저장하고
    // cron job이나 queue 시스템으로 처리

    logger.info('Report schedules updated:', schedules);

    res.json({
      success: true,
      message: '리포트 스케줄이 성공적으로 설정되었습니다.',
      data: schedules
    });

  } catch (error) {
    logger.error('Error scheduling reports:', error);
    res.status(500).json({
      success: false,
      message: '리포트 스케줄 설정 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// 데이터 익스포트 (CSV/Excel)
exports.exportData = async (req, res) => {
  try {
    const { type, departmentId, format = 'csv' } = req.query;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '시작일과 종료일을 지정해주세요.'
      });
    }

    const period = { start: startDate, end: endDate };

    let data;
    let filename;

    switch (type) {
      case 'department_metrics':
        data = await reportingService.calculateDepartmentMetrics(departmentId, period);
        filename = `department_metrics_${departmentId}_${startDate}_${endDate}`;
        break;

      case 'time_series':
        data = await reportingService.generateTimeSeriesData(departmentId, 'course_completion', period);
        filename = `time_series_${departmentId}_${startDate}_${endDate}`;
        break;

      default:
        return res.status(400).json({
          success: false,
          message: '지원하지 않는 데이터 타입입니다.'
        });
    }

    // CSV 형식으로 변환 (간단한 구현)
    let csvContent = '';

    if (Array.isArray(data)) {
      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        csvContent = headers.join(',') + '\n';
        data.forEach(row => {
          csvContent += headers.map(header => row[header] || '').join(',') + '\n';
        });
      }
    } else {
      // 객체인 경우
      const headers = Object.keys(data);
      csvContent = headers.join(',') + '\n';
      csvContent += headers.map(header => {
        const value = data[header];
        return Array.isArray(value) ? JSON.stringify(value) : value || '';
      }).join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);

    res.send(csvContent);

  } catch (error) {
    logger.error('Error exporting data:', error);
    res.status(500).json({
      success: false,
      message: '데이터 익스포트 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};
