import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';

interface UazAPIConfig {
  baseUrl: string;
  token: string;
  instanceId: string;
}

interface SendMessageRequest {
  phone: string;
  message: string;
  delay?: number;
}

interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface MessageStatus {
  messageId: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
}

interface MediaMessage {
  phone: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  filename?: string;
}

class MessageService {
  private config: UazAPIConfig;
  private axiosInstance;

  constructor() {
    this.config = {
      baseUrl: process.env.UAZAPI_BASE_URL || 'https://api.uazapi.com',
      token: process.env.UAZAPI_TOKEN || '',
      instanceId: process.env.UAZAPI_INSTANCE_ID || ''
    };

    if (!this.config.token || !this.config.instanceId) {
      throw new Error('UAZAPI_TOKEN e UAZAPI_INSTANCE_ID devem ser configurados');
    }

    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Interceptor para logs
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.info('Enviando requisição para UazAPI', {
          method: config.method,
          url: config.url,
          data: config.data ? JSON.stringify(config.data).substring(0, 200) : undefined
        });
        return config;
      },
      (error) => {
        logger.error('Erro na requisição UazAPI', { error });
        return Promise.reject(error);
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.info('Resposta recebida da UazAPI', {
          status: response.status,
          data: JSON.stringify(response.data).substring(0, 200)
        });
        return response;
      },
      (error) => {
        logger.error('Erro na resposta UazAPI', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Envia uma mensagem de texto
   */
  async sendTextMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    try {
      const payload = {
        phone: this.formatPhoneNumber(request.phone),
        message: request.message,
        delay: request.delay || 0
      };

      const response: AxiosResponse = await this.axiosInstance.post(
        `/instances/${this.config.instanceId}/messages/text`,
        payload
      );

      if (response.data.success) {
        logger.info('Mensagem enviada com sucesso', {
          phone: payload.phone,
          messageId: response.data.messageId
        });

        return {
          success: true,
          messageId: response.data.messageId
        };
      } else {
        logger.warn('Falha ao enviar mensagem', {
          phone: payload.phone,
          error: response.data.error
        });

        return {
          success: false,
          error: response.data.error || 'Erro desconhecido'
        };
      }
    } catch (error) {
      logger.error('Erro ao enviar mensagem de texto', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        phone: request.phone
      });

      return {
        success: false,
        error: 'Falha na comunicação com a API'
      };
    }
  }

  /**
   * Envia uma mensagem com mídia
   */
  async sendMediaMessage(request: MediaMessage): Promise<SendMessageResponse> {
    try {
      const payload = {
        phone: this.formatPhoneNumber(request.phone),
        mediaUrl: request.mediaUrl,
        mediaType: request.mediaType,
        caption: request.caption || '',
        filename: request.filename
      };

      const response: AxiosResponse = await this.axiosInstance.post(
        `/instances/${this.config.instanceId}/messages/media`,
        payload
      );

      if (response.data.success) {
        logger.info('Mensagem de mídia enviada com sucesso', {
          phone: payload.phone,
          mediaType: request.mediaType,
          messageId: response.data.messageId
        });

        return {
          success: true,
          messageId: response.data.messageId
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Erro desconhecido'
        };
      }
    } catch (error) {
      logger.error('Erro ao enviar mensagem de mídia', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        phone: request.phone,
        mediaType: request.mediaType
      });

      return {
        success: false,
        error: 'Falha na comunicação com a API'
      };
    }
  }

  /**
   * Verifica o status de uma mensagem
   */
  async getMessageStatus(messageId: string): Promise<MessageStatus | null> {
    try {
      const response: AxiosResponse = await this.axiosInstance.get(
        `/instances/${this.config.instanceId}/messages/${messageId}/status`
      );

      if (response.data.success) {
        return {
          messageId,
          status: response.data.status,
          timestamp: new Date(response.data.timestamp)
        };
      }

      return null;
    } catch (error) {
      logger.error('Erro ao verificar status da mensagem', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        messageId
      });
      return null;
    }
  }

  /**
   * Marca uma mensagem como lida
   */
  async markAsRead(phone: string, messageId: string): Promise<boolean> {
    try {
      const response: AxiosResponse = await this.axiosInstance.post(
        `/instances/${this.config.instanceId}/messages/read`,
        {
          phone: this.formatPhoneNumber(phone),
          messageId
        }
      );

      return response.data.success || false;
    } catch (error) {
      logger.error('Erro ao marcar mensagem como lida', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        phone,
        messageId
      });
      return false;
    }
  }

  /**
   * Envia indicador de digitação
   */
  async sendTypingIndicator(phone: string, duration: number = 3000): Promise<boolean> {
    try {
      const response: AxiosResponse = await this.axiosInstance.post(
        `/instances/${this.config.instanceId}/messages/typing`,
        {
          phone: this.formatPhoneNumber(phone),
          duration
        }
      );

      return response.data.success || false;
    } catch (error) {
      logger.error('Erro ao enviar indicador de digitação', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        phone
      });
      return false;
    }
  }

  /**
   * Verifica se um número está no WhatsApp
   */
  async checkWhatsAppNumber(phone: string): Promise<boolean> {
    try {
      const response: AxiosResponse = await this.axiosInstance.get(
        `/instances/${this.config.instanceId}/contacts/check`,
        {
          params: {
            phone: this.formatPhoneNumber(phone)
          }
        }
      );

      return response.data.exists || false;
    } catch (error) {
      logger.error('Erro ao verificar número no WhatsApp', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        phone
      });
      return false;
    }
  }

  /**
   * Obtém informações do perfil de um contato
   */
  async getContactProfile(phone: string): Promise<any> {
    try {
      const response: AxiosResponse = await this.axiosInstance.get(
        `/instances/${this.config.instanceId}/contacts/profile`,
        {
          params: {
            phone: this.formatPhoneNumber(phone)
          }
        }
      );

      return response.data.profile || null;
    } catch (error) {
      logger.error('Erro ao obter perfil do contato', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        phone
      });
      return null;
    }
  }

  /**
   * Verifica o status da instância
   */
  async getInstanceStatus(): Promise<any> {
    try {
      const response: AxiosResponse = await this.axiosInstance.get(
        `/instances/${this.config.instanceId}/status`
      );

      return response.data;
    } catch (error) {
      logger.error('Erro ao verificar status da instância', {
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
      return null;
    }
  }

  /**
   * Formata número de telefone para o padrão internacional
   */
  private formatPhoneNumber(phone: string): string {
    // Remove todos os caracteres não numéricos
    let cleaned = phone.replace(/\D/g, '');
    
    // Se não começar com código do país, adiciona o código do Brasil (55)
    if (!cleaned.startsWith('55') && cleaned.length === 11) {
      cleaned = '55' + cleaned;
    }
    
    // Adiciona o sufixo @c.us se não estiver presente
    if (!cleaned.includes('@')) {
      cleaned = cleaned + '@c.us';
    }
    
    return cleaned;
  }

  /**
   * Envia mensagem com retry automático
   */
  async sendMessageWithRetry(
    request: SendMessageRequest,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<SendMessageResponse> {
    let lastError: string = '';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.sendTextMessage(request);
        
        if (result.success) {
          if (attempt > 1) {
            logger.info('Mensagem enviada com sucesso após retry', {
              phone: request.phone,
              attempt,
              messageId: result.messageId
            });
          }
          return result;
        }
        
        lastError = result.error || 'Erro desconhecido';
        
        if (attempt < maxRetries) {
          logger.warn('Tentativa de envio falhou, tentando novamente', {
            phone: request.phone,
            attempt,
            error: lastError,
            nextRetryIn: retryDelay
          });
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= 2; // Backoff exponencial
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Erro desconhecido';
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryDelay *= 2;
        }
      }
    }
    
    logger.error('Falha ao enviar mensagem após todas as tentativas', {
      phone: request.phone,
      maxRetries,
      lastError
    });
    
    return {
      success: false,
      error: `Falha após ${maxRetries} tentativas: ${lastError}`
    };
  }

  /**
   * Health check da API
   */
  async healthCheck(): Promise<boolean> {
    try {
      const status = await this.getInstanceStatus();
      return status && status.connected === true;
    } catch (error) {
      return false;
    }
  }
}

export const messageService = new MessageService();
export { MessageService, SendMessageRequest, SendMessageResponse, MessageStatus, MediaMessage };