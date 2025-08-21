import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { supabase } from '@/config/supabase';
import { logger } from '@/utils/logger';

const router = Router();

// Health check básico
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      api: 'healthy',
      database: 'checking',
      openai: 'checking'
    }
  };

  try {
    // Verificar conexão com Supabase
    const { data, error } = await supabase
      .from('establishments')
      .select('id')
      .limit(1);
    
    if (error) {
      healthCheck.services.database = 'unhealthy';
      logger.error('Health check - Erro no Supabase:', error);
    } else {
      healthCheck.services.database = 'healthy';
    }
  } catch (error) {
    healthCheck.services.database = 'unhealthy';
    logger.error('Health check - Erro na conexão com Supabase:', error);
  }

  // Verificar se OpenAI API key está configurada
  if (process.env.OPENAI_API_KEY) {
    healthCheck.services.openai = 'configured';
  } else {
    healthCheck.services.openai = 'not_configured';
  }

  // Determinar status geral
  const isHealthy = Object.values(healthCheck.services).every(
    status => status === 'healthy' || status === 'configured'
  );

  if (!isHealthy) {
    healthCheck.status = 'degraded';
  }

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(healthCheck);
}));

// Health check detalhado
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const detailedHealth = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    services: {
      api: {
        status: 'healthy',
        responseTime: Date.now()
      },
      database: {
        status: 'checking',
        responseTime: null as number | null,
        error: null as string | null
      },
      openai: {
        status: 'checking',
        configured: !!process.env.OPENAI_API_KEY
      }
    },
    configuration: {
      port: process.env.PORT || 3000,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };

  const startTime = Date.now();

  try {
    // Teste mais detalhado do Supabase
    const { data, error } = await supabase
      .from('establishments')
      .select('id, name')
      .limit(1);
    
    detailedHealth.services.database.responseTime = Date.now() - startTime;
    
    if (error) {
      detailedHealth.services.database.status = 'unhealthy';
      detailedHealth.services.database.error = error.message;
      logger.error('Health check detalhado - Erro no Supabase:', error);
    } else {
      detailedHealth.services.database.status = 'healthy';
    }
  } catch (error) {
    detailedHealth.services.database.status = 'unhealthy';
    detailedHealth.services.database.responseTime = Date.now() - startTime;
    detailedHealth.services.database.error = error instanceof Error ? error.message : 'Erro desconhecido';
    logger.error('Health check detalhado - Erro na conexão com Supabase:', error);
  }

  // Verificar OpenAI
  if (process.env.OPENAI_API_KEY) {
    detailedHealth.services.openai.status = 'configured';
  } else {
    detailedHealth.services.openai.status = 'not_configured';
  }

  detailedHealth.services.api.responseTime = Date.now() - detailedHealth.services.api.responseTime;

  // Determinar status geral
  const isHealthy = detailedHealth.services.database.status === 'healthy' &&
                   detailedHealth.services.openai.status === 'configured';

  if (!isHealthy) {
    detailedHealth.status = 'degraded';
  }

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(detailedHealth);
}));

export default router;