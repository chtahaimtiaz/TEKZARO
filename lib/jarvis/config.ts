import "server-only";

export interface JarvisConfig {
  automationEnabled: boolean;
  dryRun: boolean;
  approvalMode: boolean;
  emergencyStop: boolean;
  maxArticlesPerRun: number;
  maxArticlesPerDay: number;
}

export interface InstagramConfig {
  enabled: boolean;
  autoPublish: boolean;
  maxPostsPerRun: number;
  maxPostsPerDay: number;
}

export function getJarvisConfig(): JarvisConfig {
  return {
    automationEnabled: process.env.JARVIS_AUTOMATION_ENABLED === "true",
    dryRun: process.env.JARVIS_DRY_RUN === "true",
    approvalMode: process.env.JARVIS_APPROVAL_MODE === "true",
    emergencyStop: process.env.JARVIS_EMERGENCY_STOP === "true",
    maxArticlesPerRun: parseInt(process.env.JARVIS_MAX_ARTICLES_PER_RUN || "3", 10),
    maxArticlesPerDay: parseInt(process.env.JARVIS_MAX_ARTICLES_PER_DAY || "20", 10),
  };
}

export function getInstagramConfig(): InstagramConfig {
  return {
    enabled: process.env.INSTAGRAM_ENABLED === "true",
    autoPublish: process.env.INSTAGRAM_AUTO_PUBLISH === "true",
    maxPostsPerRun: parseInt(process.env.JARVIS_MAX_INSTAGRAM_PER_RUN || "3", 10),
    maxPostsPerDay: parseInt(process.env.JARVIS_MAX_INSTAGRAM_PER_DAY || "10", 10),
  };
}

export function isEnabled(): boolean {
  return getJarvisConfig().automationEnabled;
}

export function isEmergencyStop(): boolean {
  return getJarvisConfig().emergencyStop;
}

export function isDryRun(): boolean {
  return getJarvisConfig().dryRun;
}

export function isApprovalMode(): boolean {
  return getJarvisConfig().approvalMode;
}
