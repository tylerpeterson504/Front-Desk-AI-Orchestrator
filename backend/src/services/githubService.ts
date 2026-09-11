import { config } from '../config';

export class GitHubService {
  isConfigured(): boolean {
    return Boolean(
      config.GITHUB_TOKEN &&
      config.GITHUB_REPOSITORY
    );
  }

  getStatus(): { configured: boolean } {
    return { configured: this.isConfigured() };
  }
}

export const githubService = new GitHubService();
