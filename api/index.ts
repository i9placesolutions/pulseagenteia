import { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../src/config/env';
import { logger } from '../src/utils/logger';
import { errorHandler } from '../src/middleware/errorHandler';
import { rateLimiter } from '../src/middleware/rateLimiter';
import webhookRoutes from '../src/routes/webhook';
import healthRoutes from '../src/routes/health';
import { monitoringService } from '../src/services/monitoringService';

const app = express();

// Middleware de segurança
app.use(helmet());
app.use(cors({
  origin: config.security.corsOrigin,
  credentials: true
}));

// Rate limiting
app.use(rateLimiter);

// Parsing de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy para Vercel
app.set('trust proxy', 1);

// Rotas
app.use('/health', healthRoutes);
app.use('/webhook', webhookRoutes);

// Rota de métricas
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await monitoringService.getSystemMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error('Erro ao obter métricas:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Rota de relatórios
app.get('/report', async (req, res) => {
  try {
    const report = await monitoringService.generateReport();
    res.json(report);
  } catch (error) {
    logger.error('Erro ao gerar relatório:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'Pulse WhatsApp API',
    version: '1.0.0',
    status: 'running'
  });
});

// Middleware de erro
app.use(errorHandler);

// Export para Vercel
export default app;

// Para desenvolvimento local
if (process.env.NODE_ENV !== 'production') {
  const PORT = config.port;
  app.listen(PORT, () => {
    logger.info(`🚀 Servidor rodando na porta ${PORT}`);
    logger.info(`📱 Webhook endpoint: http://localhost:${PORT}/webhook`);
    logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
    logger.info(`📊 Métricas: http://localhost:${PORT}/metrics`);
    logger.info(`📈 Relatórios: http://localhost:${PORT}/report`);
    logger.info(`✅ Serviços automáticos iniciados`);
  });
}