import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { config } from './config/env';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import webhookRoutes from './routes/webhook';
import healthRoutes from './routes/health';
import { automaticMessageService } from './services/automaticMessageService';
import { monitoringService } from './services/monitoringService';

const app = express();
const server = createServer(app);
const PORT = config.port;

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

// Trust proxy se configurado
if (config.security.trustProxy) {
  app.set('trust proxy', 1);
}

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

// Rota de relatório
app.get('/report', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const report = await monitoringService.generateActivityReport(hours);
    res.json(report);
  } catch (error) {
    logger.error('Erro ao gerar relatório:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'Agenteia WhatsApp API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Middleware de tratamento de erros
app.use(errorHandler);

// Inicializar serviços automáticos
automaticMessageService.startAutomaticProcessing();

// Iniciar servidor
server.listen(PORT, () => {
  logger.info(`🚀 Servidor rodando na porta ${PORT}`);
  logger.info(`📱 Webhook endpoint: http://localhost:${PORT}/webhook`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
  logger.info(`📊 Métricas: http://localhost:${PORT}/metrics`);
  logger.info(`📈 Relatórios: http://localhost:${PORT}/report`);
  logger.info('✅ Serviços automáticos iniciados');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, encerrando servidor...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido, encerrando servidor...');
  server.close(() => {
    logger.info('Servidor encerrado');
    process.exit(0);
  });
});

export { app, server };