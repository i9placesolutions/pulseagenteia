import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { addDays, format, parse, isAfter, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { automaticMessageService } from './automaticMessageService';

// Schemas de validação
const AppointmentSchema = z.object({
  professional_id: z.string().uuid(),
  client_id: z.string().uuid(),
  service_id: z.string().uuid(),
  appointment_date: z.string(),
  appointment_time: z.string(),
  total_price: z.number(),
  commission_value: z.number(),
  establishment_id: z.string().uuid()
});

const AppointmentSearchSchema = z.object({
  date: z.string().optional(),
  professional_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  status: z.enum(['scheduled', 'confirmed', 'cancelled', 'completed', 'pending', 'no_show']).optional()
});

export interface AppointmentData {
  id?: string;
  professional_id: string;
  client_id: string;
  service_id: string;
  appointment_date: string;
  appointment_time: string;
  total_price: number;
  commission_value: number;
  status?: string;
  establishment_id: string;
}

export interface AvailableSlot {
  date: string;
  time: string;
  professional_id: string;
  professional_name: string;
}

export interface AppointmentSearchParams {
  date?: string;
  professional_id?: string;
  client_id?: string;
  status?: string;
}

class AppointmentService {
  /**
   * Cria um novo agendamento
   */
  async createAppointment(appointmentData: AppointmentData): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Validar dados
      const validatedData = AppointmentSchema.parse(appointmentData);
      
      // Verificar se o horário está disponível
      const isAvailable = await this.checkAvailability(
        validatedData.professional_id,
        validatedData.appointment_date,
        validatedData.appointment_time
      );
      
      if (!isAvailable) {
        return {
          success: false,
          error: 'Horário não disponível para agendamento'
        };
      }
      
      // Criar agendamento
      const { data, error } = await supabase
        .from('appointments')
        .insert({
          ...validatedData,
          status: 'scheduled'
        })
        .select('*')
        .single();
      
      if (error) {
        logger.error('Erro ao criar agendamento:', error);
        return {
          success: false,
          error: 'Erro interno ao criar agendamento'
        };
      }
      
      logger.info('Agendamento criado com sucesso:', { appointmentId: data.id });
      
      // Enviar confirmação automática do agendamento
      try {
        await automaticMessageService.sendAppointmentConfirmation(data.id);
        
        // Agendar follow-up automático (24h após o agendamento)
        await automaticMessageService.scheduleFollowUp(data.id, 'appointment_followup');
      } catch (error) {
        logger.error('Erro ao enviar confirmação automática:', error);
      }
      
      return {
        success: true,
        data
      };
      
    } catch (error) {
      logger.error('Erro ao criar agendamento:', error);
      return {
        success: false,
        error: error instanceof z.ZodError ? 'Dados inválidos' : 'Erro interno'
      };
    }
  }
  
  /**
   * Verifica disponibilidade de horário
   */
  async checkAvailability(
    professionalId: string,
    date: string,
    time: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('id')
        .eq('professional_id', professionalId)
        .eq('appointment_date', date)
        .eq('appointment_time', time)
        .in('status', ['scheduled', 'confirmed'])
        .limit(1);
      
      if (error) {
        logger.error('Erro ao verificar disponibilidade:', error);
        return false;
      }
      
      return data.length === 0;
      
    } catch (error) {
      logger.error('Erro ao verificar disponibilidade:', error);
      return false;
    }
  }
  
  /**
   * Busca horários disponíveis
   */
  async getAvailableSlots(
    establishmentId: string,
    date?: string,
    professionalId?: string
  ): Promise<AvailableSlot[]> {
    try {
      const targetDate = date || format(new Date(), 'yyyy-MM-dd');
      
      // Buscar profissionais
      let professionalsQuery = supabase
        .from('professionals')
        .select('id, name')
        .eq('establishment_id', establishmentId)
        .eq('active', true);
      
      if (professionalId) {
        professionalsQuery = professionalsQuery.eq('id', professionalId);
      }
      
      const { data: professionals, error: profError } = await professionalsQuery;
      
      if (profError || !professionals) {
        logger.error('Erro ao buscar profissionais:', profError);
        return [];
      }
      
      // Buscar agendamentos existentes
      const { data: existingAppointments, error: apptError } = await supabase
        .from('appointments')
        .select('professional_id, appointment_time')
        .eq('appointment_date', targetDate)
        .in('status', ['scheduled', 'confirmed']);
      
      if (apptError) {
        logger.error('Erro ao buscar agendamentos:', apptError);
        return [];
      }
      
      // Gerar horários disponíveis (8h às 18h, intervalos de 30min)
      const availableSlots: AvailableSlot[] = [];
      const startHour = 8;
      const endHour = 18;
      
      for (const professional of professionals) {
        for (let hour = startHour; hour < endHour; hour++) {
          for (const minute of [0, 30]) {
            const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
            
            // Verificar se horário está ocupado
            const isOccupied = existingAppointments?.some(
              apt => apt.professional_id === professional.id && apt.appointment_time === timeSlot
            );
            
            if (!isOccupied) {
              availableSlots.push({
                date: targetDate,
                time: timeSlot,
                professional_id: professional.id,
                professional_name: professional.name
              });
            }
          }
        }
      }
      
      return availableSlots;
      
    } catch (error) {
      logger.error('Erro ao buscar horários disponíveis:', error);
      return [];
    }
  }
  
  /**
   * Busca agendamentos
   */
  async searchAppointments(params: AppointmentSearchParams): Promise<any[]> {
    try {
      const validatedParams = AppointmentSearchSchema.parse(params);
      
      let query = supabase
        .from('appointments')
        .select(`
          *,
          clients(name, phone),
          professionals(name),
          services(name, duration_minutes, price)
        `);
      
      if (validatedParams.date) {
        query = query.eq('appointment_date', validatedParams.date);
      }
      
      if (validatedParams.professional_id) {
        query = query.eq('professional_id', validatedParams.professional_id);
      }
      
      if (validatedParams.client_id) {
        query = query.eq('client_id', validatedParams.client_id);
      }
      
      if (validatedParams.status) {
        query = query.eq('status', validatedParams.status);
      }
      
      const { data, error } = await query.order('appointment_date', { ascending: true });
      
      if (error) {
        logger.error('Erro ao buscar agendamentos:', error);
        return [];
      }
      
      return data || [];
      
    } catch (error) {
      logger.error('Erro ao buscar agendamentos:', error);
      return [];
    }
  }
  
  /**
   * Atualiza status do agendamento
   */
  async updateAppointmentStatus(
    appointmentId: string,
    status: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);
      
      if (error) {
        logger.error('Erro ao atualizar status do agendamento:', error);
        return {
          success: false,
          error: 'Erro interno ao atualizar agendamento'
        };
      }
      
      logger.info('Status do agendamento atualizado:', { appointmentId, status });
      
      return { success: true };
      
    } catch (error) {
      logger.error('Erro ao atualizar status do agendamento:', error);
      return {
        success: false,
        error: 'Erro interno'
      };
    }
  }
  
  /**
   * Cancela agendamento
   */
  async cancelAppointment(
    appointmentId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);
      
      if (error) {
        logger.error('Erro ao cancelar agendamento:', error);
        return {
          success: false,
          error: 'Erro interno ao cancelar agendamento'
        };
      }
      
      logger.info('Agendamento cancelado:', { appointmentId, reason });
      
      return { success: true };
      
    } catch (error) {
      logger.error('Erro ao cancelar agendamento:', error);
      return {
        success: false,
        error: 'Erro interno'
      };
    }
  }
  
  /**
   * Busca agendamentos do cliente por telefone
   */
  async getClientAppointmentsByPhone(
    phone: string,
    establishmentId: string
  ): Promise<any[]> {
    try {
      // Primeiro buscar o cliente pelo telefone
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('phone', phone)
        .eq('establishment_id', establishmentId)
        .single();
      
      if (clientError || !client) {
        return [];
      }
      
      // Buscar agendamentos do cliente
      const appointments = await this.searchAppointments({
        client_id: client.id
      });
      
      return appointments;
      
    } catch (error) {
      logger.error('Erro ao buscar agendamentos do cliente:', error);
      return [];
    }
  }
  
  /**
   * Formata data para exibição
   */
  formatDateForDisplay(date: string): string {
    try {
      const parsedDate = new Date(date);
      return format(parsedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return date;
    }
  }
  
  /**
   * Formata horário para exibição
   */
  formatTimeForDisplay(time: string): string {
    try {
      return time.substring(0, 5); // Remove segundos
    } catch {
      return time;
    }
  }
}

export const appointmentService = new AppointmentService();
export default appointmentService;