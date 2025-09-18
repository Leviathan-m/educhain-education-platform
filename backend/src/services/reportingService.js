const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

// 성과 메트릭스 집계 함수들
class ReportingService {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../reports');
    this.ensureReportsDir();
  }

  async ensureReportsDir() {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
    } catch (error) {
      logger.error('Error creating reports directory:', error);
    }
  }

  // 부서별 성과 메트릭스 계산
  async calculateDepartmentMetrics(departmentId, period) {
    const startDate = new Date(period.start);
    const endDate = new Date(period.end);

    // 코스 완료율 계산
    const courseCompletionPipeline = [
      {
        $match: {
          department: departmentId,
          completedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$course',
          completions: { $sum: 1 },
          avgScore: { $avg: '$finalEvaluation.score' }
        }
      }
    ];

    // NFT 발행 수 계산
    const nftIssuancePipeline = [
      {
        $match: {
          'certificate.mintedAt': { $gte: startDate, $lte: endDate },
          department: departmentId
        }
      },
      {
        $group: {
          _id: null,
          totalNFTs: { $sum: 1 },
          avgESGScore: { $avg: '$esgScore.total' }
        }
      }
    ];

    // 학습 시간 분석
    const learningTimePipeline = [
      {
        $match: {
          department: departmentId,
          updatedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
          totalTime: { $sum: '$progress.timeSpent' },
          activeUsers: { $addToSet: '$user' }
        }
      },
      {
        $project: {
          date: '$_id',
          totalTime: 1,
          activeUsersCount: { $size: '$activeUsers' }
        }
      },
      { $sort: { date: 1 } }
    ];

    const [courseData, nftData, timeData] = await Promise.all([
      mongoose.connection.db.collection('enrollments').aggregate(courseCompletionPipeline).toArray(),
      mongoose.connection.db.collection('enrollments').aggregate(nftIssuancePipeline).toArray(),
      mongoose.connection.db.collection('enrollments').aggregate(learningTimePipeline).toArray()
    ]);

    return {
      courseCompletion: courseData,
      nftIssuance: nftData[0] || { totalNFTs: 0, avgESGScore: 0 },
      learningTime: timeData,
      period: { start: startDate, end: endDate }
    };
  }

  // 개인별 성과 메트릭스 계산
  async calculateUserMetrics(userId, period) {
    const startDate = new Date(period.start);
    const endDate = new Date(period.end);

    const userMetrics = await mongoose.connection.db.collection('enrollments').aggregate([
      {
        $match: {
          user: mongoose.Types.ObjectId(userId),
          updatedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalCourses: { $sum: 1 },
          completedCourses: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          totalScore: { $sum: '$finalEvaluation.score' },
          totalTime: { $sum: '$progress.timeSpent' },
          nftEarned: {
            $sum: { $cond: ['$certificate.tokenId', 1, 0] }
          }
        }
      },
      {
        $project: {
          completionRate: { $multiply: [{ $divide: ['$completedCourses', '$totalCourses'] }, 100] },
          avgScore: { $divide: ['$totalScore', '$completedCourses'] },
          totalTime: 1,
          nftEarned: 1,
          coursesCompleted: '$completedCourses'
        }
      }
    ]).toArray();

    return userMetrics[0] || {
      completionRate: 0,
      avgScore: 0,
      totalTime: 0,
      nftEarned: 0,
      coursesCompleted: 0
    };
  }

  // 시계열 차트 데이터 생성
  async generateTimeSeriesData(departmentId, metric, period) {
    const startDate = new Date(period.start);
    const endDate = new Date(period.end);

    let pipeline = [];

    switch (metric) {
      case 'course_completion':
        pipeline = [
          {
            $match: {
              department: departmentId,
              completedAt: { $gte: startDate, $lte: endDate },
              status: 'completed'
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$completedAt' }
              },
              count: { $sum: 1 },
              avgScore: { $avg: '$finalEvaluation.score' }
            }
          },
          { $sort: { '_id': 1 } }
        ];
        break;

      case 'nft_issuance':
        pipeline = [
          {
            $match: {
              department: departmentId,
              'certificate.mintedAt': { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$certificate.mintedAt' }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id': 1 } }
        ];
        break;

      case 'learning_time':
        pipeline = [
          {
            $match: {
              department: departmentId,
              updatedAt: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' }
              },
              totalTime: { $sum: '$progress.timeSpent' }
            }
          },
          { $sort: { '_id': 1 } }
        ];
        break;
    }

    const data = await mongoose.connection.db.collection('enrollments').aggregate(pipeline).toArray();

    // 누락된 날짜 채우기
    return this.fillMissingDates(data, startDate, endDate);
  }

  fillMissingDates(data, startDate, endDate) {
    const filledData = [];
    const dataMap = new Map(data.map(item => [item._id, item]));

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      const existingData = dataMap.get(dateStr);

      if (existingData) {
        filledData.push({
          date: dateStr,
          ...existingData
        });
      } else {
        filledData.push({
          date: dateStr,
          count: 0,
          avgScore: 0,
          totalTime: 0
        });
      }
    }

    return filledData;
  }

  // 차트 이미지 생성 (간단한 구현 - 실제로는 외부 차트 라이브러리 사용 권장)
  async generateChartImage(data, type, options) {
    // 간단한 텍스트 기반 차트 생성 (실제 구현에서는 Chart.js나 D3.js 사용)
    let chartText = `${options.title || 'Chart'}\n\n`;

    if (type === 'bar' && data.length > 0) {
      data.forEach((item, index) => {
        const value = item.value || item.count || 0;
        const bars = '█'.repeat(Math.min(Math.max(Math.round(value / 10), 1), 50));
        const label = item.label || item.date || `Item ${index + 1}`;
        chartText += `${label}: ${bars} (${value})\n`;
      });
    }

    // 텍스트를 PNG로 변환하는 대신 Base64 인코딩된 더미 이미지 반환
    // 실제 구현에서는 차트 라이브러리를 사용해야 함
    const dummyImageBuffer = Buffer.from(chartText, 'utf8');
    return dummyImageBuffer;
  }

  // PDF 리포트 생성 (간단한 HTML to PDF 구현)
  async generatePDFReport(metrics, chartImages, options) {
    const filename = `${options.reportType}_${options.entityId}_${Date.now()}.pdf`;
    const filepath = path.join(this.reportsDir, filename);

    // 간단한 HTML 템플릿
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${options.title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
          .metric { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
          .chart { margin: 20px 0; text-align: center; }
          .footer { margin-top: 50px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${options.title}</h1>
          <p>기간: ${options.period.start} ~ ${options.period.end}</p>
        </div>

        <div class="metrics">
          <div class="metric">
            <h3>코스 완료율</h3>
            <p>${metrics.completionRate || 0}%</p>
          </div>
          <div class="metric">
            <h3>NFT 발행 수</h3>
            <p>${metrics.nftIssuance?.totalNFTs || 0}개</p>
          </div>
          <div class="metric">
            <h3>평균 점수</h3>
            <p>${metrics.avgScore || 0}점</p>
          </div>
          <div class="metric">
            <h3>총 학습 시간</h3>
            <p>${Math.round((metrics.totalTime || 0) / 3600)}시간</p>
          </div>
        </div>

        <div class="chart">
          <h3>성과 추이</h3>
          <p>[차트 이미지가 여기에 표시됩니다]</p>
        </div>

        <div class="footer">
          <p>생성일: ${new Date().toLocaleDateString('ko-KR')}</p>
          <p>NFT 교육 플랫폼 리포트</p>
        </div>
      </body>
      </html>
    `;

    // 실제 PDF 생성을 위해서는 puppeteer나 다른 라이브러리가 필요하지만,
    // 여기서는 HTML 파일로 저장
    const htmlPath = filepath.replace('.pdf', '.html');
    await fs.writeFile(htmlPath, html);

    logger.info(`Report generated: ${htmlPath}`);

    return {
      filename,
      filepath: htmlPath,
      url: `/reports/${filename.replace('.pdf', '.html')}`
    };
  }

  // 스케줄된 리포트 생성
  async scheduleDepartmentReport(departmentId, period) {
    try {
      const metrics = await this.calculateDepartmentMetrics(departmentId, period);
      const timeSeriesData = await this.generateTimeSeriesData(departmentId, 'course_completion', period);

      const chartImage = await this.generateChartImage(
        timeSeriesData.map(item => ({ label: item.date, value: item.count })),
        'bar',
        { title: '일별 코스 완료 수', width: 800, height: 400 }
      );

      const report = await this.generatePDFReport(metrics, [chartImage], {
        title: `부서 성과 리포트 - ${departmentId}`,
        reportType: 'department',
        entityId: departmentId,
        period
      });

      return report;

    } catch (error) {
      logger.error('Error generating scheduled report:', error);
      throw error;
    }
  }

  // 예측 모델 (단순한 선형 추세)
  calculateTrendPrediction(data, periods = 30) {
    if (data.length < 2) return [];

    const values = data.map(item => item.count || item.value || 0);
    const n = values.length;

    // 간단한 선형 회귀
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, idx) => sum + val * idx, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 미래 예측
    const predictions = [];
    for (let i = 1; i <= periods; i++) {
      const futureValue = slope * (n + i - 1) + intercept;
      predictions.push({
        period: i,
        predictedValue: Math.max(0, futureValue),
        confidence: 0.8 // 고정 신뢰도
      });
    }

    return predictions;
  }
}

module.exports = new ReportingService();
