import { config } from '../config';

export class DatabricksService {
  isConfigured(): boolean {
    return Boolean(
      config.DATABRICKS_HOST &&
      config.DATABRICKS_TOKEN &&
      config.DATABRICKS_WORKSPACE_ID
    );
  }

  getStatus(): { configured: boolean } {
    return { configured: this.isConfigured() };
  }
}

export const databricksService = new DatabricksService();
