import axios, { AxiosResponse } from 'axios';
import { SendMessage } from '@/types/schemas';
import { logger } from '@/utils/logger';
import { supabase } from '@/config/supabase';

// Interface para resposta da UazAPI
interface UazapiResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: string;
}

// Interface para status da instância
interface InstanceStatus {
  instance: string;
  status: 'open' | 'close' | 'connecting';
  qrcode?: string;
}

// Classe para gerenciar comunicação com UazAPI
class UazapiService {
  private baseUrl: string;
  private adminToken: string;

  constructor(baseUrl: string, adminToken: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.adminToken = adminToken;
  }

  // Configurar headers padrão
  private getHeaders(instanceToken?: string) {
    const headers: any = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (instanceToken) {
      headers['Authorization'] = `Bearer ${instanceToken}`;
    } else {
      headers['Authorization'] = `Bearer ${this.adminToken}`;
    }

    return headers;
  }

  // Enviar mensagem de texto
  async sendTextMessage(
    instanceName: string,
    instanceToken: string,
    phone: string,
    message: string
  ): Promise<UazapiResponse> {
    try {
      const url = `${this.baseUrl}/message/sendText/${instanceName}`;
      const payload = {
        number: phone,
        text: message
      };

      logger.info('Enviando mensagem de texto:', {
        instanceName,
        phone,
        messageLength: message.length
      });

      const response: AxiosResponse = await axios.post(url, payload, {
        headers: this.getHeaders(instanceToken),
        timeout: 30000
      });

      logger.info('Mensagem enviada com sucesso:', {
        instanceName,
        phone,
        status: response.status
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      logger.error('Erro ao enviar mensagem de texto:', {
        instanceName,
        phone,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      return {
        success: false,
        error: error.message || 'Erro desconhecido'
      };
    }
  }

  // Enviar mensagem com mídia
  async sendMediaMessage(
    instanceName: string,
    instanceToken: string,
    phone: string,
    mediaUrl: string,
    caption?: string,
    fileName?: string
  ): Promise<UazapiResponse> {
    try {
      const url = `${this.baseUrl}/message/sendMedia/${instanceName}`;
      const payload = {
        number: phone,
        mediaurl: mediaUrl,
        caption: caption || '',
        fileName: fileName || 'arquivo'
      };

      logger.info('Enviando mensagem com mídia:', {
        instanceName,
        phone,
        mediaUrl,
        fileName
      });

      const response: AxiosResponse = await axios.post(url, payload, {
        headers: this.getHeaders(instanceToken),
        timeout: 60000 // Timeout maior para mídia
      });

      logger.info('Mensagem com mídia enviada com sucesso:', {
        instanceName,
        phone,
        status: response.status
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      logger.error('Erro ao enviar mensagem com mídia:', {
        instanceName,
        phone,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });

      return {
        success: false,
        error: error.message || 'Erro desconhecido'
      };
    }
  }

  // Verificar status da instância
  async getInstanceStatus(instanceName: string): Promise<InstanceStatus | null> {
    try {
      const url = `${this.baseUrl}/instance/status/${instanceName}`;
      
      const response: AxiosResponse = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: 15000
      });

      return response.data;
    } catch (error: any) {
      logger.error('Erro ao verificar status da instância:', {
        instanceName,
        error: error.message
      });
      return null;
    }
  }

  // Criar nova instância
  async createInstance(
    instanceName: string,
    webhookUrl?: string
  ): Promise<UazapiResponse> {
    try {
      const url = `${this.baseUrl}/instance/create`;
      const payload = {
        instanceName,
        webhook: webhookUrl || '',
        webhookByEvents: false,
        webhookBase64: false
      };

      const response: AxiosResponse = await axios.post(url, payload, {
        headers: this.getHeaders(),
        timeout: 30000
      });

      logger.info('Instância criada com sucesso:', {
        instanceName,
        status: response.status
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      logger.error('Erro ao criar instância:', {
        instanceName,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Erro desconhecido'
      };
    }
  }

  // Conectar instância
  async connectInstance(instanceName: string): Promise<UazapiResponse> {
    try {
      const url = `${this.baseUrl}/instance/connect/${instanceName}`;
      
      const response: AxiosResponse = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: 30000
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error: any) {
      logger.error('Erro ao conectar instância:', {
        instanceName,
        error: error.message
      });

      return {
        success: false,
        error: error.message || 'Erro desconhecido'
      };
    }
  }
}

// Instância global do serviço (será configurada dinamicamente)
let uazapiService: UazapiService | null = null;

// Função para obter configuração da instância
const getInstanceConfig = async (instanceName: string) => {
  try {
    const { data, error } = await supabase
      .from('uazapi_configurations')
      .select('*')
      .eq('instance_name', instanceName)
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

// Função principal para enviar mensagem
export const sendMessage = async (messageData: SendMessage): Promise<boolean> => {
  try {
    // Buscar configuração da instância
    const config = await getInstanceConfig(messageData.instanceName);
    if (!config) {
      logger.error('Configuração da instância não encontrada:', messageData.instanceName);
      return false;
    }

    // Criar serviço UazAPI
    const service = new UazapiService(config.uazapi_url, config.admin_token);

    let result: UazapiResponse;

    // Enviar mensagem baseada no tipo
    if (messageData.messageType === 'text') {
      result = await service.sendTextMessage(
        messageData.instanceName,
        config.instance_token,
        messageData.phone,
        messageData.message
      );
    } else if (messageData.mediaUrl) {
      result = await service.sendMediaMessage(
        messageData.instanceName,
        config.instance_token,
        messageData.phone,
        messageData.mediaUrl,
        messageData.caption,
        messageData.fileName
      );
    } else {
      logger.error('Tipo de mensagem não suportado ou URL de mídia ausente');
      return false;
    }

    if (!result.success) {
      logger.error('Falha ao enviar mensagem:', result.error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Erro ao enviar mensagem:', error);
    return false;
  }
};

// Função para verificar status de todas as instâncias
export const checkAllInstancesStatus = async (): Promise<void> => {
  try {
    const { data: configs, error } = await supabase
      .from('uazapi_configurations')
      .select('*');

    if (error) {
      logger.error('Erro ao buscar configurações das instâncias:', error);
      return;
    }

    for (const config of configs) {
      const service = new UazapiService(config.uazapi_url, config.admin_token);
      const status = await service.getInstanceStatus(config.instance_name);
      
      if (status) {
        // Atualizar status no banco
        const newStatus = status.status === 'open' ? 'connected' : 'disconnected';
        
        await supabase
          .from('uazapi_configurations')
          .update({ 
            status: newStatus,
            qr_code: status.qrcode || null
          })
          .eq('id', config.id);

        logger.info('Status da instância atualizado:', {
          instanceName: config.instance_name,
          status: newStatus
        });
      }
    }
  } catch (error) {
    logger.error('Erro ao verificar status das instâncias:', error);
  }
};

export { UazapiService };