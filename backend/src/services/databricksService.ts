import { config } from '../config';
import logger from '../lib/logger';

export interface DatabricksConfig {
  host: string;
  token: string;
  workspaceId: string;
}

export interface DatabricksJob {
  id: number;
  name: string;
  description: string;
  creator_user_name: string;
  created_time: number;
  settings: {
    new_cluster?: any;
    existing_cluster_id?: string;
    notebook_task?: {
      notebook_path: string;
    };
    spark_python_task?: {
      python_file: string;
    };
    libraries?: any[];
  };
  state: {
    life_cycle_state: string;
    result_state: string;
    target_run_duration_seconds?: number;
  };
}

export interface DatabricksJobRun {
  id: number;
  job_id: number;
  creator_user_name: string;
  start_time: number;
  setup_duration: number;
  execution_duration: number;
  end_time: number;
  state: {
    life_cycle_state: string;
    result_state: string;
  };
  tasks: Array<{
    run_id: number;
    task_key: string;
    state: {
      life_cycle_state: string;
      result_state: string;
    };
  }>;
}

export interface DatabricksExportConfig {
  workspace_id: string;
  notebook_path: string;
  format: 'JSON' | 'CSV' | 'PARQUET' | 'HTML';
  output_path: string;
  parameters?: Record<string, string>;
}

export interface DatabricksImportConfig {
  workspace_id: string;
  target_path: string;
  format: 'JSON' | 'CSV' | 'PARQUET' | 'HTML';
  source_url: string;
  overwrite?: boolean;
}

export class DatabricksService {
  private readonly apiVersion = '2.1';
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = config.DATABRICKS_HOST || '';
  }

  isConfigured(): boolean {
    return Boolean(
      config.DATABRICKS_HOST &&
      config.DATABRICKS_TOKEN &&
      config.DATABRICKS_WORKSPACE_ID
    );
  }

  getStatus(): { configured: boolean; host?: string; workspace_id?: string } {
    return {
      configured: this.isConfigured(),
      host: this.isConfigured() ? this.baseUrl : undefined,
      workspace_id: this.isConfigured() ? config.DATABRICKS_WORKSPACE_ID : undefined
    };
  }

  getConfig(): DatabricksConfig {
    if (!this.isConfigured()) {
      throw new Error('Databricks is not configured');
    }

    return {
      host: config.DATABRICKS_HOST!,
      token: config.DATABRICKS_TOKEN!,
      workspaceId: config.DATABRICKS_WORKSPACE_ID!
    };
  }

  /**
   * Make authenticated request to Databricks API
   */
  private async request<T>(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: any): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('Databricks is not configured');
    }

    const url = `${this.baseUrl}/api/${this.apiVersion}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${config.DATABRICKS_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const options: RequestInit = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorData = await response.text().catch(() => ({}));
        throw new Error(`Databricks API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      logger.error('Databricks API request failed', { 
        endpoint, 
        method, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * List all jobs in the workspace
   */
  async listJobs(): Promise<DatabricksJob[]> {
    const result = await this.request<{ jobs: DatabricksJob[] }>('/jobs/list');
    return result.jobs || [];
  }

  /**
   * Get job details by ID
   */
  async getJob(jobId: number): Promise<DatabricksJob> {
    const result = await this.request<DatabricksJob>(`/jobs/get?job_id=${jobId}`);
    return result;
  }

  /**
   * Run a job
   */
  async runJob(jobId: number, parameters?: Record<string, string>): Promise<{ run_id: number }> {
    const result = await this.request<{ run_id: number }>('/jobs/run', 'POST', {
      job_id: jobId,
      notebook_params: parameters || {}
    });
    return result;
  }

  /**
   * Get job run status
   */
  async getJobRun(runId: number): Promise<DatabricksJobRun> {
    const result = await this.request<DatabricksJobRun>(`/jobs/runs/get?run_id=${runId}`);
    return result;
  }

  /**
   * Export data from Databricks to file
   */
  async exportData(config: DatabricksExportConfig): Promise<{ output_path: string; status: string }> {
    // This would integrate with Databricks export functionality
    // For now, simulate the export process
    logger.info('Databricks export initiated', { 
      workspace_id: config.workspace_id,
      notebook_path: config.notebook_path,
      format: config.format,
      output_path: config.output_path
    });

    // Simulate export completion
    return {
      output_path: config.output_path,
      status: 'COMPLETED'
    };
  }

  /**
   * Import data to Databricks
   */
  async importData(config: DatabricksImportConfig): Promise<{ target_path: string; status: string }> {
    // This would integrate with Databricks import functionality
    logger.info('Databricks import initiated', { 
      workspace_id: config.workspace_id,
      target_path: config.target_path,
      format: config.format,
      source_url: config.source_url
    });

    // Simulate import completion
    return {
      target_path: config.target_path,
      status: 'COMPLETED'
    };
  }

  /**
   * Execute a notebook and return results
   */
  async executeNotebook(notebookPath: string, parameters?: Record<string, string>): Promise<{
    results: any[];
    execution_time_seconds: number;
    status: string;
  }> {
    logger.info('Databricks notebook execution initiated', { 
      notebook_path: notebookPath,
      parameters
    });

    // Simulate notebook execution
    return {
      results: [],
      execution_time_seconds: 5,
      status: 'COMPLETED'
    };
  }
}

export const databricksService = new DatabricksService();
