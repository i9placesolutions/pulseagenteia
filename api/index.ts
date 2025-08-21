import { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Função para criar a aplicação Express
function createApp() {
  const app = express();

  // Middleware de segurança
  app.use(helmet());
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? ['https://pulseagente-5037txuae-i9place.vercel.app'] : '*',
    credentials: true
  }));

  // Parsing de JSON
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Trust proxy para Vercel
  app.set('trust proxy', 1);

  return app;
}

// Função handler para Vercel
export default function handler(req: VercelRequest, res: VercelResponse) {
  const app = createApp();

  // Rotas básicas
  app.get('/', (req, res) => {
    res.json({
      message: 'Pulse WhatsApp API',
      version: '1.0.0',
      status: 'running'
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  app.post('/webhook', (req, res) => {
    try {
      console.log('Webhook recebido:', req.body);
      res.json({ success: true, message: 'Webhook processado' });
    } catch (error) {
      console.error('Erro no webhook:', error);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  app.get('/metrics', (req, res) => {
    res.json({
      status: 'ok',
      memory: process.memoryUsage(),
      uptime: process.uptime()
    });
  });

  // Middleware de erro simples
  app.use((error: any, req: any, res: any, next: any) => {
    console.error('Erro:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  });

  // Processar a requisição
  return app(req, res);
}