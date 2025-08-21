import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { ProcessedMessage } from '../types/schemas';
import { openaiService, ChatMessage } from './openaiService';
import { messageService } from './messageService';
import { contextService } from './contextService';
import { intentService } from './intentService';
import { appointmentService } from './appointmentService';
import { automaticMessageService } from './automaticMessageService';
import { monitoringService } from './monitoringService';

interface ProcessingResult {
  success: boolean;
  response?: string;
  error?: string;
  messageId?: string | undefined;
}

export class MessageProcessor {
  async processMessage(message: ProcessedMessage): Promise<ProcessingResult> {
    const startTime = Date.now();
    try {
      logger.info('Processando mensagem', {
        from: message.clientPhone,
        messageType: message.messageType,
        messageId: message.messageId
      });

      // Rastrear mensagem recebida
      await monitoringService.trackMessage(Date.now() - startTime);

      // Salvar mensagem no banco
      await this.saveMessage(message);

      // Só processar mensagens de texto por enquanto
      if (message.messageType !== 'text' || !message.messageContent) {
        return {
          success: true,
          response: 'Mensagem recebida. No momento, só posso responder mensagens de texto.'
        };
      }

      // Obter ou criar contexto da conversação
      const context = await contextService.getOrCreateContext('default', message.clientPhone);
      
      if (!context) {
        return {
          success: false,
          error: 'Falha ao obter contexto da conversação'
        };
      }
      
      // Verificar se é um novo cliente (primeira interação)
      const isNewClient = context.context_data?.messageCount === 0;
      if (isNewClient) {
        // Enviar mensagem de boas-vindas para novos clientes
        await automaticMessageService.sendWelcomeMessage(message.clientPhone);
      }
      
      // Detectar intenção da mensagem
      const intent = await intentService.detectIntent(message.messageContent, context);
      
      // Atualizar contexto com a nova intenção
      if (intent !== context.intent) {
        await contextService.updateContext(
          context.establishment_id,
          context.client_phone,
          {
            intent: intent
          }
        );
        context.intent = intent;
      }

      // Obter histórico de mensagens para contexto
      const conversationHistory = await this.getConversationHistory(message.clientPhone);

      // Verificar se precisa de tratamento especial baseado na intenção
      let responseMessage: string;
      
      if (intent === 'scheduling') {
        responseMessage = await this.handleSchedulingIntent(message, context);
      } else if (intent === 'cancel') {
        responseMessage = await this.handleCancellationIntent(message, context);
      } else {
        // Gerar resposta com IA para outras intenções
        const aiResponse = await openaiService.generateResponse(
          message.messageContent,
          context,
          conversationHistory
        );
        responseMessage = aiResponse.message;
      }

      // Enviar resposta
      const sendResult = await messageService.sendTextMessage({
        phone: message.clientPhone,
        message: responseMessage
      });

      if (sendResult.success) {
        // Salvar resposta no banco
        await this.saveOutboundMessage(message.clientPhone, responseMessage, sendResult.messageId);
        
        // Atualizar contexto
        await contextService.updateContext(
          context.establishment_id,
          context.client_phone,
          {
            lastMessage: message.messageContent,
            lastResponse: responseMessage
          }
        );

        // Rastrear mensagem enviada e performance
        await monitoringService.trackMessage(Date.now() - startTime);
        await monitoringService.trackPerformance('message_processing', Date.now() - startTime);

        logger.info('Mensagem processada e resposta enviada', {
          from: message.clientPhone,
          responseMessageId: sendResult.messageId
        });

        return {
          success: true,
          response: responseMessage,
          messageId: sendResult.messageId || undefined
        };
      } else {
        logger.error('Falha ao enviar resposta', {
          from: message.clientPhone,
          error: sendResult.error
        });

        return {
          success: false,
          error: 'Falha ao enviar resposta'
        };
      }
    } catch (error) {
      logger.error('Erro ao processar mensagem', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        message
      });

      // Rastrear erro
      await monitoringService.trackError('message_processing', (error as Error).message, (error as Error).stack, {
        context: 'message_processing',
        userId: message.clientPhone,
        messageType: message.messageType
      });

      return {
        success: false,
        error: 'Falha no processamento da mensagem'
      };
    }
  }

  private async saveMessage(message: ProcessedMessage): Promise<void> {
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          phone_number: message.clientPhone,
          message_content: message.messageContent,
          message_type: message.messageType,
          timestamp: new Date().toISOString(),
          webhook_data: message,
          direction: 'inbound'
        });

      if (error) {
        throw error;
      }

      logger.info('Mensagem salva no banco', {
        from: message.clientPhone,
        type: message.messageType
      });
    } catch (error) {
      logger.error('Erro ao salvar mensagem', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        from: message.clientPhone
      });
      throw error;
    }
  }

  private async saveOutboundMessage(phone: string, content: string, messageId?: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          phone_number: phone,
          message_content: content,
          message_type: 'text',
          timestamp: new Date().toISOString(),
          direction: 'outbound',
          external_message_id: messageId
        });

      if (error) {
        throw error;
      }

      logger.info('Resposta salva no banco', {
        phone,
        messageId
      });
    } catch (error) {
      logger.error('Erro ao salvar resposta', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        phone
      });
    }
  }

  private async getConversationHistory(phone: string, limit: number = 10): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('message_content, direction, timestamp')
        .eq('phone_number', phone)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      // Converter para formato ChatMessage e inverter ordem (mais antiga primeiro)
      const history: ChatMessage[] = (data || [])
        .reverse()
        .map(msg => ({
          role: msg.direction === 'inbound' ? 'user' : 'assistant',
          content: msg.message_content
        }));

      return history;
    } catch (error) {
      logger.error('Erro ao obter histórico de conversação', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        phone
      });
      return [];
    }
  }

  /**
   * Processa mensagens em lote (para casos de múltiplas mensagens)
   */
  async processBatchMessages(messages: ProcessedMessage[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    for (const message of messages) {
      try {
        const result = await this.processMessage(message);
        results.push(result);
        
        // Pequeno delay entre mensagens para evitar spam
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.push({
          success: false,
          error: 'Erro no processamento em lote'
        });
      }
    }
    
    return results;
  }

  private async handleSchedulingIntent(message: ProcessedMessage, context: any): Promise<string> {
    try {
      const messageText = message.messageContent?.toLowerCase() || '';
      
      // Verificar se é uma consulta de horários disponíveis
      if (messageText.includes('horário') || messageText.includes('disponível') || messageText.includes('vago')) {
        const availableSlots = await appointmentService.getAvailableSlots(
          process.env.DEFAULT_ESTABLISHMENT_ID || '',
          undefined, // data atual
          undefined  // todos os profissionais
        );
        
        if (availableSlots.length === 0) {
          return 'Não há horários disponíveis para hoje. Gostaria de verificar outro dia?';
        }
        
        // Agrupar por profissional
        const slotsByProfessional = availableSlots.reduce((acc, slot) => {
          if (!acc[slot.professional_name]) {
            acc[slot.professional_name] = [];
          }
          acc[slot.professional_name]?.push(appointmentService.formatTimeForDisplay(slot.time));
          return acc;
        }, {} as Record<string, string[]>);
        
        let response = '📅 *Horários disponíveis para hoje:*\n\n';
        
        for (const [professional, times] of Object.entries(slotsByProfessional)) {
          response += `👨‍💼 *${professional}*\n`;
          response += `⏰ ${times.slice(0, 6).join(', ')}${times.length > 6 ? '...' : ''}\n\n`;
        }
        
        response += 'Para agendar, me informe:\n';
        response += '• Profissional desejado\n';
        response += '• Horário preferido\n';
        response += '• Serviço desejado';
        
        return response;
      }
      
      // Verificar se é uma consulta de agendamentos existentes
      if (messageText.includes('meus agendamentos') || messageText.includes('consultar') || messageText.includes('ver agendamento')) {
        const appointments = await appointmentService.getClientAppointmentsByPhone(
          message.clientPhone,
          process.env.DEFAULT_ESTABLISHMENT_ID || ''
        );
        
        if (appointments.length === 0) {
          return 'Você não possui agendamentos. Gostaria de fazer um novo agendamento?';
        }
        
        let response = '📋 *Seus agendamentos:*\n\n';
        
        for (const apt of appointments.slice(0, 5)) { // Mostrar apenas os 5 mais recentes
          const date = appointmentService.formatDateForDisplay(apt.appointment_date);
          const time = appointmentService.formatTimeForDisplay(apt.appointment_time);
          const status = this.getStatusEmoji(apt.status);
          
          response += `${status} *${apt.services.name}*\n`;
          response += `📅 ${date} às ${time}\n`;
          response += `👨‍💼 ${apt.professionals.name}\n`;
          response += `💰 R$ ${apt.services.price.toFixed(2)}\n\n`;
        }
        
        if (appointments.length > 5) {
          response += `... e mais ${appointments.length - 5} agendamento(s)`;
        }
        
        return response;
      }
      
      // Verificar se é um cancelamento
      if (messageText.includes('cancelar') || messageText.includes('desmarcar')) {
        const appointments = await appointmentService.getClientAppointmentsByPhone(
          message.clientPhone,
          process.env.DEFAULT_ESTABLISHMENT_ID || ''
        );
        
        const futureAppointments = appointments.filter(apt => 
          apt.status === 'scheduled' || apt.status === 'confirmed'
        );
        
        if (futureAppointments.length === 0) {
          return 'Você não possui agendamentos que possam ser cancelados.';
        }
        
        let response = '❌ *Cancelar agendamento:*\n\n';
        response += 'Qual agendamento você gostaria de cancelar?\n\n';
        
        for (let i = 0; i < Math.min(futureAppointments.length, 3); i++) {
          const apt = futureAppointments[i];
          const date = appointmentService.formatDateForDisplay(apt.appointment_date);
          const time = appointmentService.formatTimeForDisplay(apt.appointment_time);
          
          response += `${i + 1}. *${apt.services.name}*\n`;
          response += `📅 ${date} às ${time}\n`;
          response += `👨‍💼 ${apt.professionals.name}\n\n`;
        }
        
        response += 'Responda com o número do agendamento que deseja cancelar.';
        
        // Salvar contexto para próxima interação
         await contextService.updateContext(context.establishment_id, message.clientPhone, {
           awaitingCancellation: true,
           cancellableAppointments: futureAppointments.slice(0, 3)
         });
        
        return response;
      }
      
      // Verificar se é uma confirmação
      if (messageText.includes('confirmar') || messageText.includes('confirmo')) {
        // Buscar agendamentos pendentes de confirmação
        const appointments = await appointmentService.getClientAppointmentsByPhone(
          message.clientPhone,
          process.env.DEFAULT_ESTABLISHMENT_ID || ''
        );
        
        const pendingAppointments = appointments.filter(apt => apt.status === 'scheduled');
        
        if (pendingAppointments.length === 0) {
          return 'Não há agendamentos pendentes de confirmação.';
        }
        
        // Confirmar o primeiro agendamento pendente
        const appointment = pendingAppointments[0];
        const result = await appointmentService.updateAppointmentStatus(appointment.id, 'confirmed');
        
        if (result.success) {
          const date = appointmentService.formatDateForDisplay(appointment.appointment_date);
          const time = appointmentService.formatTimeForDisplay(appointment.appointment_time);
          
          // Agendar lembrete automático para o agendamento confirmado
          try {
            await automaticMessageService.scheduleAppointmentReminders(appointment.id, context.establishment_id);
          } catch (error) {
            logger.error('Erro ao agendar lembrete automático:', error);
          }
          
          return `✅ *Agendamento confirmado!*\n\n📅 ${date} às ${time}\n👨‍💼 ${appointment.professionals.name}\n💼 ${appointment.services.name}\n\nObrigado! Nos vemos em breve! 😊`;
        } else {
          return 'Erro ao confirmar agendamento. Tente novamente ou entre em contato conosco.';
        }
      }
      
      // Resposta padrão para intenção de agendamento
      return '📅 *Agendamentos*\n\nEu posso ajudar você com:\n\n• 🔍 Consultar horários disponíveis\n• 📋 Ver seus agendamentos\n• ✅ Confirmar agendamentos\n• ❌ Cancelar agendamentos\n\nO que você gostaria de fazer?';
      
    } catch (error) {
      logger.error('Erro ao processar intenção de agendamento:', error);
      return 'Desculpe, ocorreu um erro ao processar sua solicitação de agendamento. Tente novamente.';
    }
  }

  private async handleCancellationIntent(message: ProcessedMessage, context: any): Promise<string> {
    try {
      const messageText = message.messageContent?.toLowerCase() || '';
      
      // Verificar se o usuário está respondendo a uma solicitação de cancelamento
      if (context.awaitingCancellation && context.cancellableAppointments) {
        const choice = parseInt(messageText.trim());
        
        if (isNaN(choice) || choice < 1 || choice > context.cancellableAppointments.length) {
          return 'Por favor, responda com o número do agendamento que deseja cancelar.';
        }
        
        const appointmentToCancel = context.cancellableAppointments[choice - 1];
        const result = await appointmentService.cancelAppointment(appointmentToCancel.id);
        
        // Limpar contexto
         await contextService.updateContext(context.establishment_id, message.clientPhone, {
           awaitingCancellation: false,
           cancellableAppointments: undefined
         });
        
        if (result.success) {
          const date = appointmentService.formatDateForDisplay(appointmentToCancel.appointment_date);
          const time = appointmentService.formatTimeForDisplay(appointmentToCancel.appointment_time);
          
          return `❌ *Agendamento cancelado*\n\n📅 ${date} às ${time}\n👨‍💼 ${appointmentToCancel.professionals.name}\n💼 ${appointmentToCancel.services.name}\n\nSeu agendamento foi cancelado com sucesso.`;
        } else {
          return 'Erro ao cancelar agendamento. Tente novamente ou entre em contato conosco.';
        }
      }
      
      // Buscar agendamentos que podem ser cancelados
      const appointments = await appointmentService.getClientAppointmentsByPhone(
        message.clientPhone,
        process.env.DEFAULT_ESTABLISHMENT_ID || ''
      );
      
      const cancellableAppointments = appointments.filter(apt => 
        apt.status === 'scheduled' || apt.status === 'confirmed'
      );
      
      if (cancellableAppointments.length === 0) {
        return 'Você não possui agendamentos que possam ser cancelados.';
      }
      
      let response = '❌ *Cancelar agendamento*\n\n';
      response += 'Qual agendamento você gostaria de cancelar?\n\n';
      
      for (let i = 0; i < Math.min(cancellableAppointments.length, 3); i++) {
        const apt = cancellableAppointments[i];
        const date = appointmentService.formatDateForDisplay(apt.appointment_date);
        const time = appointmentService.formatTimeForDisplay(apt.appointment_time);
        
        response += `${i + 1}. *${apt.services.name}*\n`;
        response += `📅 ${date} às ${time}\n`;
        response += `👨‍💼 ${apt.professionals.name}\n\n`;
      }
      
      response += 'Responda com o número do agendamento que deseja cancelar.';
      
      // Salvar contexto para próxima interação
       await contextService.updateContext(context.establishment_id, message.clientPhone, {
         awaitingCancellation: true,
         cancellableAppointments: cancellableAppointments.slice(0, 3)
       });
      
      return response;
      
    } catch (error) {
      logger.error('Erro ao processar cancelamento:', error);
      return 'Desculpe, ocorreu um erro ao processar seu cancelamento. Tente novamente.';
    }
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'scheduled': return '📅';
      case 'confirmed': return '✅';
      case 'completed': return '✅';
      case 'cancelled': return '❌';
      case 'no_show': return '❌';
      default: return '📅';
    }
  }

  /**
   * Health check do processador
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Verificar se todos os serviços estão funcionando
      const openaiHealth = await openaiService.healthCheck();
      const messageServiceHealth = await messageService.healthCheck();
      
      // Verificar conexão com Supabase
      const { error } = await supabase.from('messages').select('id').limit(1);
      const supabaseHealth = !error;
      
      return openaiHealth && messageServiceHealth && supabaseHealth;
    } catch (error) {
      logger.error('Health check do processador falhou', { error });
      return false;
    }
  }
}

export const messageProcessor = new MessageProcessor();