const { HRISClient, HrisSyncLog, HrisConfig, mapHrisToPlatform } = require('../services/hrisService');
const User = require('../models/User');
const logger = require('../utils/logger');

// HRIS 설정 관리
exports.createHrisConfig = async (req, res) => {
  try {
    const configData = req.body;
    const config = new HrisConfig(configData);
    await config.save();

    logger.info(`HRIS config created for ${config.provider}`);
    res.status(201).json({
      success: true,
      message: 'HRIS 설정이 성공적으로 생성되었습니다.',
      data: config
    });
  } catch (error) {
    logger.error('Error creating HRIS config:', error);
    res.status(500).json({
      success: false,
      message: 'HRIS 설정 생성 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.getHrisConfigs = async (req, res) => {
  try {
    const configs = await HrisConfig.find({ isActive: true }).select('-clientSecret');
    res.json({
      success: true,
      data: configs
    });
  } catch (error) {
    logger.error('Error fetching HRIS configs:', error);
    res.status(500).json({
      success: false,
      message: 'HRIS 설정 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

exports.updateHrisConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const config = await HrisConfig.findByIdAndUpdate(id, updates, { new: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'HRIS 설정을 찾을 수 없습니다.'
      });
    }

    logger.info(`HRIS config updated for ${config.provider}`);
    res.json({
      success: true,
      message: 'HRIS 설정이 성공적으로 업데이트되었습니다.',
      data: config
    });
  } catch (error) {
    logger.error('Error updating HRIS config:', error);
    res.status(500).json({
      success: false,
      message: 'HRIS 설정 업데이트 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// HRIS 동기화 실행
exports.syncHrisData = async (req, res) => {
  try {
    const { provider } = req.params;
    const { syncType = 'full_sync' } = req.query;

    const config = await HrisConfig.findOne({ provider, isActive: true });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'HRIS 설정을 찾을 수 없습니다.'
      });
    }

    const startTime = Date.now();
    const hrisClient = new HRISClient({
      baseUrl: config.baseUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret
    });

    // 동기화 실행
    const result = await performSync(hrisClient, config, syncType);

    // 동기화 로그 저장
    const syncLog = new HrisSyncLog({
      provider,
      operation: syncType,
      status: result.errors.length > 0 ? 'partial_success' : 'success',
      recordsProcessed: result.processed,
      recordsFailed: result.errors.length,
      errors: result.errors,
      duration: Date.now() - startTime,
      metadata: result.metadata
    });

    await syncLog.save();

    // 마지막 동기화 시간 업데이트
    config.lastSync = new Date();
    await config.save();

    res.json({
      success: true,
      message: 'HRIS 동기화가 완료되었습니다.',
      data: {
        processed: result.processed,
        errors: result.errors.length,
        duration: Date.now() - startTime,
        logId: syncLog._id
      }
    });

  } catch (error) {
    logger.error('Error syncing HRIS data:', error);
    res.status(500).json({
      success: false,
      message: 'HRIS 동기화 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

async function performSync(hrisClient, config, syncType) {
  const result = {
    processed: 0,
    errors: [],
    metadata: {}
  };

  try {
    // HRIS에서 사용자 데이터 가져오기
    const hrisUsers = await hrisClient.fetchUsers();

    for (const hrisUser of hrisUsers) {
      try {
        // HRIS 데이터를 플랫폼 형식으로 매핑
        const platformUser = mapHrisToPlatform(hrisUser);

        // 기존 사용자 찾기 또는 새로 생성
        let user = await User.findOne({ email: platformUser.email });

        if (user) {
          // 기존 사용자 업데이트
          await User.findByIdAndUpdate(user._id, {
            ...platformUser,
            hrisLastSync: new Date()
          });
        } else {
          // 새 사용자 생성
          const newUser = new User({
            ...platformUser,
            password: 'temp_password_' + Date.now(), // 임시 비밀번호
            role: 'student', // 기본 역할
            walletAddress: '0x' + Math.random().toString(16).substr(2, 40), // 임시 지갑 주소
            encryptedPrivateKey: 'temp_key_' + Date.now() // 임시 키
          });
          await newUser.save();
        }

        result.processed++;

      } catch (userError) {
        logger.error(`Error processing user ${hrisUser.id}:`, userError);
        result.errors.push({
          userId: hrisUser.id,
          error: userError.message,
          timestamp: new Date()
        });
      }
    }

  } catch (error) {
    logger.error('Error during HRIS sync:', error);
    result.errors.push({
      userId: 'system',
      error: error.message,
      timestamp: new Date()
    });
  }

  return result;
}

// HRIS 동기화 로그 조회
exports.getHrisSyncLogs = async (req, res) => {
  try {
    const { page = 1, limit = 10, provider, status } = req.query;

    const query = {};
    if (provider) query.provider = provider;
    if (status) query.status = status;

    const logs = await HrisSyncLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v');

    const total = await HrisSyncLog.countDocuments(query);

    res.json({
      success: true,
      data: logs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalLogs: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    logger.error('Error fetching HRIS sync logs:', error);
    res.status(500).json({
      success: false,
      message: 'HRIS 동기화 로그 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

// HRIS 웹훅 핸들러 (실시간 동기화용)
exports.handleHrisWebhook = async (req, res) => {
  try {
    const { provider } = req.params;
    const webhookData = req.body;

    // 웹훅 시크릿 검증 (실제 구현에서는 HMAC 검증 필요)
    const config = await HrisConfig.findOne({ provider, isActive: true });
    if (!config) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    logger.info(`HRIS webhook received from ${provider}:`, webhookData);

    // 실시간 동기화 처리
    if (webhookData.type === 'user.updated' || webhookData.type === 'user.created') {
      const platformUser = mapHrisToPlatform(webhookData.data);

      let user = await User.findOne({ email: platformUser.email });
      if (user) {
        await User.findByIdAndUpdate(user._id, {
          ...platformUser,
          hrisLastSync: new Date()
        });
      } else {
        // 새 사용자 생성 로직
        const newUser = new User({
          ...platformUser,
          password: 'temp_password_' + Date.now(),
          role: 'student',
          walletAddress: '0x' + Math.random().toString(16).substr(2, 40),
          encryptedPrivateKey: 'temp_key_' + Date.now()
        });
        await newUser.save();
      }
    }

    // 동기화 로그 기록
    const syncLog = new HrisSyncLog({
      provider,
      operation: 'webhook_sync',
      status: 'success',
      recordsProcessed: 1,
      duration: 0,
      metadata: { webhookData }
    });
    await syncLog.save();

    res.json({ success: true, message: 'Webhook processed successfully' });

  } catch (error) {
    logger.error('Error processing HRIS webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

// HRIS 사용자 매핑 조회
exports.getHrisUserMapping = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required'
      });
    }

    const user = await User.findOne({ email }).select('name email userId department position hrisLastSync');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    logger.error('Error fetching HRIS user mapping:', error);
    res.status(500).json({
      success: false,
      message: 'HRIS 사용자 매핑 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};
