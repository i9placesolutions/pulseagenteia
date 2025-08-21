import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { UazapiWebhookSchema, ProcessedMessage } from '../types/schemas';
import { logger } from '../utils/logger';
import { supabase } from '../config/supabase';
import { asyncHandler } from '../middleware/errorHandler';
import { MessageProcessor } from '../services/messageProcessor';

const router = Router();

// Middleware para validar token do webhook
const validateWebhookToken = (req: Request, res: Response, next: any) => {
  const token = req.headers['x-webhook-token'] || req.query.token;
  
  if (!token || token !== process.env.WEBHOOK_TOKEN) {
    logger.warn('Tentativa de acesso ao webhook com token inválido', {
      ip: req.ip,
      token: token ? 'presente' : 'ausente'
    });
    
    return res.status(401).json({ error: 'Token de webhook inválido' });
  }
  
  return next();
};

// Função para extrair conteúdo da mensagem
const extractMessageContent = (message: any): { content: string; type: string } => {
  // Mensagem de texto simples
  if (message.conversation) {
    return {
      content: message.conversation,
      type: 'text'
    };
  }

  // Mensagem de texto estendida
  if (message.extendedTextMessage?.text) {
    return {
      content: message.extendedTextMessage.text,
      type: 'text'
    };
  }

  // Mensagem de imagem
  if (message.imageMessage) {
    return {
      content: message.imageMessage.caption || '[Imagem]',
      type: 'image'
    };
  }

  // Mensagem de áudio
  if (message.audioMessage) {
    return {
      content: '[Áudio]',
      type: 'audio'
    };
  }

  // Mensagem de vídeo
  if (message.videoMessage) {
    return {
      content: message.videoMessage.caption || '[Vídeo]',
      type: 'video'
    };
  }

  // Mensagem de documento
  if (message.documentMessage) {
    return {
      content: message.documentMessage.caption || `[Documento: ${message.documentMessage.fileName || 'arquivo'}]`,
      type: 'document'
    };
  }

  return {
    content: '[Mensagem não suportada]',
    type: 'unknown'
  };
};

// Função para extrair número de telefone
const extractPhoneNumber = (remoteJid: string): string => {
  // Remove o sufixo @s.whatsapp.net ou @c.us
  const phone = remoteJid?.split('@')[0];
  if (!phone) {
    throw new Error('Número de telefone inválido');
  }
  return phone;
};

// Função para buscar configuração da instância
const getInstanceConfig = async (instanceName: string) => {
  try {
    const { data, error } = await supabase
      .from('uazapi_configurations')
      .select('*')
      .eq('instance_name', instanceName)
      .eq('status', 'connected')
      .single();

    if (error) {
      logger.error('Erro ao buscar configuração da instância:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Erro ao buscar configuração da instância:', error);
    return null;
  }
};

// Endpoint principal do webhook
router.post('/', validateWebhookToken, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Validar estrutura do webhook
    const webhookData = UazapiWebhookSchema.parse(req.body);
    
    logger.info('Webhook recebido:', {
      instanceName: webhookData.instanceName,
      messageId: webhookData.data.key.id,
      fromMe: webhookData.data.key.fromMe
    });

    // Ignorar mensagens enviadas pela própria instância
    if (webhookData.data.key.fromMe) {
      logger.debug('Ignorando mensagem enviada pela própria instância');
      return res.status(200).json({ status: 'ignored', reason: 'message_from_me' });
    }

    // Buscar configuração da instância
    const instanceConfig = await getInstanceConfig(webhookData.instanceName);
    if (!instanceConfig) {
      logger.warn('Configuração da instância não encontrada:', webhookData.instanceName);
      return res.status(404).json({ error: 'Instância não configurada' });
    }

    // Extrair informações da mensagem
    const { content, type } = extractMessageContent(webhookData.data.message);
    const clientPhone = extractPhoneNumber(webhookData.data.key.remoteJid);
    const clientName = webhookData.data.pushName || 'Cliente';

    // Criar objeto de mensagem processada
    const processedMessage: ProcessedMessage = {
      messageId: webhookData.data.key.id,
      instanceName: webhookData.instanceName,
      clientPhone,
      clientName,
      messageContent: content,
      messageType: type as any,
      timestamp: webhookData.data.messageTimestamp,
      isFromClient: true,
      metadata: {
        remoteJid: webhookData.data.key.remoteJid,
        originalMessage: webhookData.data.message
      }
    };

    // Salvar mensagem no banco de dados
    const { error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        message_id: processedMessage.messageId,
        establishment_id: instanceConfig.establishment_id,
        client_phone: processedMessage.clientPhone,
        client_name: processedMessage.clientName,
        message_content: processedMessage.messageContent,
        message_type: processedMessage.messageType,
        sender_type: 'client',
        is_from_client: true,
        metadata: JSON.stringify(processedMessage.metadata),
        processed: false,
        created_at: new Date(processedMessage.timestamp * 1000).toISOString()
      });

    if (saveError) {
      logger.error('Erro ao salvar mensagem no banco:', saveError);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }

    // Processar mensagem se IA estiver habilitada
    if (instanceConfig.ai_enabled) {
      try {
        const messageProcessor = new MessageProcessor();
        await messageProcessor.processMessage(processedMessage);
        logger.info('Mensagem processada com sucesso');
      } catch (error) {
        logger.error('Erro ao processar mensagem:', error);
        // Não retornar erro para não afetar o webhook
      }
    }

    return res.status(200).json({ 
      status: 'success', 
      messageId: processedMessage.messageId,
      processed: instanceConfig.ai_enabled
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Estrutura de webhook inválida:', error.errors);
      return res.status(400).json({ 
        error: 'Estrutura de dados inválida',
        details: error.errors
      });
    }

    logger.error('Erro no processamento do webhook:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}));

// Endpoint para verificar status do webhook
router.get('/status', (req: Request, res: Response) => {
  res.json({
    status: 'active',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Endpoint para testar webhook (apenas em desenvolvimento)
if (process.env.NODE_ENV === 'development') {
  router.post('/test', asyncHandler(async (req: Request, res: Response) => {
    logger.info('Webhook de teste recebido:', req.body);
    res.json({ status: 'test_received', data: req.body });
  }));
}

export default router;