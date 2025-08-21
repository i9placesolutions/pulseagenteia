import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { appointmentService } from './appointmentService';
import { contextService } from './contextService';
import { intentService } from './intentService';

export interface SystemMetrics {
  totalMessages: number;
  totalAppointments: number;
  activeContexts: number;
  intentDistribution: Record<string, number>;
  responseTime: number;
  errorRate: number;
  uptime: number;
}

export interface PerformanceMetric {
  id?: string;
  metric_name: string;
  metric_value: number;
  timestamp: string;
  metadata: Record<string, any> | undefined;
}

export interface ErrorLog {
  id?: string;
  error_type: string;
  error_message: string;
  stack_trace?: string | undefined;
  context?: Record<string, any> | undefined;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class MonitoringService {
  private startTime: Date;
  private messageCount: number = 0;
  private errorCount: number = 0;
  private responseTimes: number[] = [];

  constructor() {
    this.startTime = new Date();
    this.initializeMonitoring();
  }

  /**
   * Inicializa o sistema de monitoramento
   */
  private initializeMonitoring(): void {
    // Coletar métricas a cada 5 minutos
    setInterval(async () => {
      await this.collectMetrics();
    }, 5 * 60 * 1000);

    // Limpar logs antigos a cada hora
    setInterval(async () => {
      await this.cleanupOldLogs();
    }, 60 * 60 * 1000);

    logger.info('Sistema de monitoramento iniciado');
  }

  /**
   * Registra uma mensagem processada
   */
  trackMessage(responseTime: number): void {
    this.messageCount++;
    this.responseTimes.push(responseTime);
    
    // Manter apenas os últimos 100 tempos de resposta
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
  }

  /**
   * Registra um erro
   */
  async trackError(
    errorType: string,
    errorMessage: string,
    stackTrace?: string,
    context?: Record<string, any>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<void> {
    try {
      this.errorCount++;

      const errorLog: ErrorLog = {
      error_type: errorType,
      error_message: errorMessage,
      stack_trace: stackTrace || undefined,
      context: context,
      timestamp: new Date().toISOString(),
      severity: severity
    };

      // Salvar no banco
      const { error } = await supabase
        .from('error_logs')
        .insert(errorLog);

      if (error) {
        logger.error('Erro ao salvar log de erro:', error);
      }

      // Log crítico também vai para o console
      if (severity === 'critical') {
        logger.error(`ERRO CRÍTICO: ${errorType} - ${errorMessage}`, {
          stackTrace,
          context
        });
      }

    } catch (error) {
      logger.error('Erro ao registrar erro:', error);
    }
  }

  /**
   * Registra métrica de performance
   */
  async trackPerformance(
    metricName: string,
    value: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const metric: PerformanceMetric = {
        metric_name: metricName,
        metric_value: value,
        timestamp: new Date().toISOString(),
        metadata: metadata || undefined
      };

      const { error } = await supabase
        .from('performance_metrics')
        .insert(metric);

      if (error) {
        logger.error('Erro ao salvar métrica de performance:', error);
      }

    } catch (error) {
      logger.error('Erro ao registrar métrica:', error);
    }
  }

  /**
   * Coleta métricas do sistema
   */
  private async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.getSystemMetrics();

      // Salvar métricas principais
      await this.trackPerformance('total_messages', metrics.totalMessages);
      await this.trackPerformance('total_appointments', metrics.totalAppointments);
      await this.trackPerformance('active_contexts', metrics.activeContexts);
      await this.trackPerformance('response_time_avg', metrics.responseTime);
      await this.trackPerformance('error_rate', metrics.errorRate);
      await this.trackPerformance('uptime_hours', metrics.uptime);

      // Salvar distribuição de intenções
      for (const [intent, count] of Object.entries(metrics.intentDistribution)) {
        await this.trackPerformance(`intent_${intent}`, count);
      }

      logger.info('Métricas coletadas:', metrics);

    } catch (error) {
      logger.error('Erro ao coletar métricas:', error);
      await this.trackError('metrics_collection', 'Erro ao coletar métricas do sistema', (error as Error).stack, undefined, 'medium');
    }
  }

  /**
   * Obtém métricas do sistema
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const now = new Date();
      const uptime = (now.getTime() - this.startTime.getTime()) / (1000 * 60 * 60); // em horas

      // Buscar total de mensagens (últimas 24h)
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const { count: totalMessages } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString());

      // Buscar total de agendamentos (últimas 24h)
      const { count: totalAppointments } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterday.toISOString());

      // Obter contextos ativos
      const activeContexts = await contextService.getActiveContexts('default-establishment');

      // Obter estatísticas de intenções
      const intentStats = await intentService.getIntentStats('default-establishment');

      // Calcular tempo de resposta médio
      const avgResponseTime = this.responseTimes.length > 0
        ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
        : 0;

      // Calcular taxa de erro
      const errorRate = this.messageCount > 0 ? (this.errorCount / this.messageCount) * 100 : 0;

      return {
        totalMessages: totalMessages || 0,
        totalAppointments: totalAppointments || 0,
        activeContexts: activeContexts.length,
        intentDistribution: intentStats,
        responseTime: Math.round(avgResponseTime),
        errorRate: Math.round(errorRate * 100) / 100,
        uptime: Math.round(uptime * 100) / 100
      };

    } catch (error) {
      logger.error('Erro ao obter métricas do sistema:', error);
      return {
        totalMessages: 0,
        totalAppointments: 0,
        activeContexts: 0,
        intentDistribution: {},
        responseTime: 0,
        errorRate: 0,
        uptime: 0
      };
    }
  }

  /**
   * Obtém logs de erro recentes
   */
  async getRecentErrors(limit: number = 50): Promise<ErrorLog[]> {
    try {
      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Erro ao buscar logs de erro:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      logger.error('Erro ao obter logs de erro:', error);
      return [];
    }
  }

  /**
   * Obtém métricas de performance recentes
   */
  async getRecentMetrics(
    metricName?: string,
    hours: number = 24
  ): Promise<PerformanceMetric[]> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      let query = supabase
        .from('performance_metrics')
        .select('*')
        .gte('timestamp', since.toISOString())
        .order('timestamp', { ascending: false });

      if (metricName) {
        query = query.eq('metric_name', metricName);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Erro ao buscar métricas:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      logger.error('Erro ao obter métricas:', error);
      return [];
    }
  }

  /**
   * Verifica saúde do sistema
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    metrics: SystemMetrics;
  }> {
    try {
      const metrics = await this.getSystemMetrics();
      const issues: string[] = [];
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';

      // Verificar taxa de erro
      if (metrics.errorRate > 10) {
        issues.push(`Taxa de erro alta: ${metrics.errorRate}%`);
        status = 'critical';
      } else if (metrics.errorRate > 5) {
        issues.push(`Taxa de erro elevada: ${metrics.errorRate}%`);
        status = 'warning';
      }

      // Verificar tempo de resposta
      if (metrics.responseTime > 5000) {
        issues.push(`Tempo de resposta alto: ${metrics.responseTime}ms`);
        status = status === 'critical' ? 'critical' : 'warning';
      }

      // Verificar contextos ativos (possível vazamento de memória)
      if (metrics.activeContexts > 1000) {
        issues.push(`Muitos contextos ativos: ${metrics.activeContexts}`);
        status = status === 'critical' ? 'critical' : 'warning';
      }

      // Verificar erros críticos recentes
      const recentErrors = await this.getRecentErrors(10);
      const criticalErrors = recentErrors.filter(e => e.severity === 'critical');
      
      if (criticalErrors.length > 0) {
        issues.push(`${criticalErrors.length} erro(s) crítico(s) recente(s)`);
        status = 'critical';
      }

      return {
        status,
        issues,
        metrics
      };

    } catch (error) {
      logger.error('Erro ao verificar saúde do sistema:', error);
      return {
        status: 'critical',
        issues: ['Erro ao verificar saúde do sistema'],
        metrics: await this.getSystemMetrics()
      };
    }
  }

  /**
   * Limpa logs antigos
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Limpar logs de erro antigos
      const { error: errorLogsError } = await supabase
        .from('error_logs')
        .delete()
        .lt('timestamp', thirtyDaysAgo.toISOString());

      if (errorLogsError) {
        logger.error('Erro ao limpar logs de erro antigos:', errorLogsError);
      }

      // Limpar métricas antigas (manter apenas 7 dias)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { error: metricsError } = await supabase
        .from('performance_metrics')
        .delete()
        .lt('timestamp', sevenDaysAgo.toISOString());

      if (metricsError) {
        logger.error('Erro ao limpar métricas antigas:', metricsError);
      }

      logger.info('Limpeza de logs antigos concluída');

    } catch (error) {
      logger.error('Erro na limpeza de logs:', error);
    }
  }

  /**
   * Gera relatório de atividade
   */
  async generateActivityReport(hours: number = 24): Promise<{
    period: string;
    summary: {
      totalMessages: number;
      totalAppointments: number;
      avgResponseTime: number;
      errorCount: number;
      topIntents: Array<{ intent: string; count: number }>;
    };
    trends: {
      messagesPerHour: number[];
      appointmentsPerHour: number[];
      responseTimePerHour: number[];
    };
  }> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

      // Buscar métricas do período
      const metrics = await this.getRecentMetrics(undefined, hours);
      
      // Calcular totais
      const totalMessages = metrics.filter(m => m.metric_name === 'total_messages')
        .reduce((sum, m) => sum + m.metric_value, 0);
      
      const totalAppointments = metrics.filter(m => m.metric_name === 'total_appointments')
        .reduce((sum, m) => sum + m.metric_value, 0);
      
      const responseTimeMetrics = metrics.filter(m => m.metric_name === 'response_time_avg');
      const avgResponseTime = responseTimeMetrics.length > 0
        ? responseTimeMetrics.reduce((sum, m) => sum + m.metric_value, 0) / responseTimeMetrics.length
        : 0;

      // Contar erros
      const recentErrors = await this.getRecentErrors(1000);
      const errorCount = recentErrors.filter(e => 
        new Date(e.timestamp) >= startTime
      ).length;

      // Top intenções
      const intentMetrics = metrics.filter(m => m.metric_name.startsWith('intent_'));
      const topIntents = intentMetrics
        .map(m => ({
          intent: m.metric_name.replace('intent_', ''),
          count: m.metric_value
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        period: `${hours} horas (${startTime.toISOString()} - ${endTime.toISOString()})`,
        summary: {
          totalMessages,
          totalAppointments,
          avgResponseTime: Math.round(avgResponseTime),
          errorCount,
          topIntents
        },
        trends: {
          messagesPerHour: [], // Implementar se necessário
          appointmentsPerHour: [], // Implementar se necessário
          responseTimePerHour: [] // Implementar se necessário
        }
      };

    } catch (error) {
      logger.error('Erro ao gerar relatório:', error);
      throw error;
    }
  }
}

export const monitoringService = new MonitoringService();
export default monitoringService;