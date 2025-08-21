import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { messageService } from './messageService';
import { appointmentService } from './appointmentService';
import { format, addDays, subDays, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  type: 'reminder' | 'confirmation' | 'welcome' | 'follow_up';
  variables: string[];
}

export interface ScheduledMessage {
  id?: string;
  client_phone: string;
  message_content: string;
  scheduled_for: string;
  status: 'pending' | 'sent' | 'failed';
  appointment_id?: string;
  establishment_id: string;
}

class AutomaticMessageService {
  private messageTemplates: MessageTemplate[] = [
    {
      id: 'reminder_24h',
      name: 'Lembrete 24h',
      content: 'Olá {client_name}! 👋\n\nLembramos que você tem um agendamento marcado para amanhã ({date}) às {time} com {professional_name}.\n\nServiço: {service_name}\nValor: R$ {price}\n\nPara confirmar, responda "CONFIRMAR".\nPara cancelar, responda "CANCELAR".\n\nObrigado! 😊',
      type: 'reminder',
      variables: ['client_name', 'date', 'time', 'professional_name', 'service_name', 'price']
    },
    {
      id: 'confirmation',
      name: 'Confirmação de Agendamento',
      content: '✅ Agendamento confirmado!\n\nCliente: {client_name}\nData: {date}\nHorário: {time}\nProfissional: {professional_name}\nServiço: {service_name}\nValor: R$ {price}\n\nNos vemos em breve! 😊',
      type: 'confirmation',
      variables: ['client_name', 'date', 'time', 'professional_name', 'service_name', 'price']
    },
    {
      id: 'welcome',
      name: 'Boas-vindas',
      content: 'Olá! 👋 Bem-vindo(a) ao nosso atendimento via WhatsApp!\n\nEu sou seu assistente virtual e estou aqui para ajudar você com:\n\n📅 Agendamentos\n🔍 Consulta de horários\n❌ Cancelamentos\n💬 Dúvidas gerais\n\nComo posso ajudar você hoje?',
      type: 'welcome',
      variables: []
    },
    {
      id: 'follow_up',
      name: 'Pós-atendimento',
      content: 'Olá {client_name}! 😊\n\nEsperamos que tenha gostado do seu atendimento de {service_name} com {professional_name}.\n\nSua opinião é muito importante para nós! Como foi sua experiência?\n\n⭐⭐⭐⭐⭐\n\nObrigado pela preferência! 💙',
      type: 'follow_up',
      variables: ['client_name', 'service_name', 'professional_name']
    }
  ];

  /**
   * Agenda mensagem automática
   */
  async scheduleMessage(
    clientPhone: string,
    templateId: string,
    scheduledFor: Date,
    variables: Record<string, string> = {},
    appointmentId?: string,
    establishmentId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const template = this.messageTemplates.find(t => t.id === templateId);
      if (!template) {
        return {
          success: false,
          error: 'Template de mensagem não encontrado'
        };
      }

      // Substituir variáveis no template
      let messageContent = template.content;
      for (const [key, value] of Object.entries(variables)) {
        messageContent = messageContent.replace(new RegExp(`{${key}}`, 'g'), value);
      }

      // Salvar mensagem agendada
      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert({
          client_phone: clientPhone,
          message_content: messageContent,
          scheduled_for: scheduledFor.toISOString(),
          status: 'pending',
          appointment_id: appointmentId,
          establishment_id: establishmentId
        })
        .select('*')
        .single();

      if (error) {
        logger.error('Erro ao agendar mensagem:', error);
        return {
          success: false,
          error: 'Erro interno ao agendar mensagem'
        };
      }

      logger.info('Mensagem agendada com sucesso:', { 
        messageId: data.id, 
        scheduledFor: scheduledFor.toISOString() 
      });

      return { success: true };

    } catch (error) {
      logger.error('Erro ao agendar mensagem:', error);
      return {
        success: false,
        error: 'Erro interno'
      };
    }
  }

  /**
   * Processa mensagens pendentes
   */
  async processPendingMessages(): Promise<void> {
    try {
      const now = new Date();
      
      // Buscar mensagens pendentes que devem ser enviadas
      const { data: pendingMessages, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_for', now.toISOString())
        .order('scheduled_for', { ascending: true });

      if (error) {
        logger.error('Erro ao buscar mensagens pendentes:', error);
        return;
      }

      if (!pendingMessages || pendingMessages.length === 0) {
        return;
      }

      logger.info(`Processando ${pendingMessages.length} mensagens pendentes`);

      // Processar cada mensagem
      for (const message of pendingMessages) {
        await this.sendScheduledMessage(message);
        
        // Aguardar um pouco entre envios para evitar spam
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      logger.error('Erro ao processar mensagens pendentes:', error);
    }
  }

  /**
   * Envia mensagem agendada
   */
  private async sendScheduledMessage(message: ScheduledMessage): Promise<void> {
    try {
      // Tentar enviar mensagem
      const result = await messageService.sendTextMessage({
        phone: message.client_phone,
        message: message.message_content
      });
      const success = result.success;
      
      const newStatus = success ? 'sent' : 'failed';
      
      // Atualizar status da mensagem
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ 
          status: newStatus,
          sent_at: success ? new Date().toISOString() : null
        })
        .eq('id', message.id);

      if (error) {
        logger.error('Erro ao atualizar status da mensagem:', error);
      }

      if (success) {
        logger.info('Mensagem enviada com sucesso:', { messageId: message.id });
      } else {
        logger.error('Falha ao enviar mensagem:', { messageId: message.id });
      }

    } catch (error) {
      logger.error('Erro ao enviar mensagem agendada:', error);
      
      // Marcar como falha
      await supabase
        .from('scheduled_messages')
        .update({ status: 'failed' })
        .eq('id', message.id);
    }
  }

  /**
   * Agenda lembretes para agendamentos
   */
  async scheduleAppointmentReminders(
    appointmentId: string,
    establishmentId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Buscar dados do agendamento
      const { data: appointment, error: apptError } = await supabase
        .from('appointments')
        .select(`
          *,
          clients(name, phone),
          professionals(name),
          services(name, price)
        `)
        .eq('id', appointmentId)
        .single();

      if (apptError || !appointment) {
        return {
          success: false,
          error: 'Agendamento não encontrado'
        };
      }

      const appointmentDate = parseISO(`${appointment.appointment_date}T${appointment.appointment_time}`);
      const reminderDate = subDays(appointmentDate, 1); // 24h antes

      // Só agendar se a data do lembrete for no futuro
      if (isAfter(reminderDate, new Date())) {
        const variables = {
          client_name: appointment.clients.name,
          date: appointmentService.formatDateForDisplay(appointment.appointment_date),
          time: appointmentService.formatTimeForDisplay(appointment.appointment_time),
          professional_name: appointment.professionals.name,
          service_name: appointment.services.name,
          price: appointment.services.price.toFixed(2)
        };

        await this.scheduleMessage(
          appointment.clients.phone,
          'reminder_24h',
          reminderDate,
          variables,
          appointmentId,
          establishmentId
        );
      }

      return { success: true };

    } catch (error) {
      logger.error('Erro ao agendar lembretes:', error);
      return {
        success: false,
        error: 'Erro interno'
      };
    }
  }

  /**
   * Envia mensagem de confirmação de agendamento
   */
  async sendAppointmentConfirmation(
    appointmentId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Buscar dados do agendamento
      const { data: appointment, error: apptError } = await supabase
        .from('appointments')
        .select(`
          *,
          clients(name, phone),
          professionals(name),
          services(name, price)
        `)
        .eq('id', appointmentId)
        .single();

      if (apptError || !appointment) {
        return {
          success: false,
          error: 'Agendamento não encontrado'
        };
      }

      const variables = {
        client_name: appointment.clients.name,
        date: appointmentService.formatDateForDisplay(appointment.appointment_date),
        time: appointmentService.formatTimeForDisplay(appointment.appointment_time),
        professional_name: appointment.professionals.name,
        service_name: appointment.services.name,
        price: appointment.services.price.toFixed(2)
      };

      const template = this.messageTemplates.find(t => t.id === 'confirmation');
      if (!template) {
        return {
          success: false,
          error: 'Template de confirmação não encontrado'
        };
      }

      let messageContent = template.content;
      for (const [key, value] of Object.entries(variables)) {
        messageContent = messageContent.replace(new RegExp(`{${key}}`, 'g'), value);
      }

      // Enviar mensagem imediatamente
      const result = await messageService.sendTextMessage({
        phone: appointment.clients.phone,
        message: messageContent
      });
      const success = result.success;
      
      if (success) {
        logger.info('Confirmação de agendamento enviada:', { appointmentId });
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Falha ao enviar mensagem'
        };
      }

    } catch (error) {
      logger.error('Erro ao enviar confirmação:', error);
      return {
        success: false,
        error: 'Erro interno'
      };
    }
  }

  /**
   * Envia mensagem de boas-vindas
   */
  async sendWelcomeMessage(clientPhone: string): Promise<{ success: boolean; error?: string }> {
    try {
      const template = this.messageTemplates.find(t => t.id === 'welcome');
      if (!template) {
        return {
          success: false,
          error: 'Template de boas-vindas não encontrado'
        };
      }

      const result = await messageService.sendTextMessage({
        phone: clientPhone,
        message: template.content
      });
      const success = result.success;
      
      if (success) {
        logger.info('Mensagem de boas-vindas enviada:', { clientPhone });
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Falha ao enviar mensagem'
        };
      }

    } catch (error) {
      logger.error('Erro ao enviar boas-vindas:', error);
      return {
        success: false,
        error: 'Erro interno'
      };
    }
  }

  /**
   * Agenda follow-up pós-atendimento
   */
  async scheduleFollowUp(
    appointmentId: string,
    establishmentId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Buscar dados do agendamento
      const { data: appointment, error: apptError } = await supabase
        .from('appointments')
        .select(`
          *,
          clients(name, phone),
          professionals(name),
          services(name)
        `)
        .eq('id', appointmentId)
        .single();

      if (apptError || !appointment) {
        return {
          success: false,
          error: 'Agendamento não encontrado'
        };
      }

      const appointmentDate = parseISO(`${appointment.appointment_date}T${appointment.appointment_time}`);
      const followUpDate = addDays(appointmentDate, 1); // 1 dia após o atendimento

      const variables = {
        client_name: appointment.clients.name,
        service_name: appointment.services.name,
        professional_name: appointment.professionals.name
      };

      await this.scheduleMessage(
        appointment.clients.phone,
        'follow_up',
        followUpDate,
        variables,
        appointmentId,
        establishmentId
      );

      return { success: true };

    } catch (error) {
      logger.error('Erro ao agendar follow-up:', error);
      return {
        success: false,
        error: 'Erro interno'
      };
    }
  }

  /**
   * Inicia processamento automático de mensagens
   */
  startAutomaticProcessing(): void {
    // Processar mensagens a cada 5 minutos
    setInterval(async () => {
      await this.processPendingMessages();
    }, 5 * 60 * 1000);

    logger.info('Processamento automático de mensagens iniciado');
  }

  /**
   * Obtém templates disponíveis
   */
  getAvailableTemplates(): MessageTemplate[] {
    return this.messageTemplates;
  }
}

export const automaticMessageService = new AutomaticMessageService();
export default automaticMessageService;