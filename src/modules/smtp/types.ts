// SMTP Configuration Types
export interface SmtpConfigInput {
  scope: 'GLOBAL' | 'TENANT' | 'APP';
  tenantId?: string;
  appId?: string;
  host: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromAddress?: string;
  fromName?: string;
  service?: 'smtp' | 'ses';
  awsRegion?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  isActive?: boolean;
}

export interface SmtpConfigOutput {
  id: string;
  scope: 'GLOBAL' | 'TENANT' | 'APP';
  tenantId?: string;
  appId?: string;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string; // will be masked in responses
  fromAddress?: string;
  fromName?: string;
  service: string;
  awsRegion?: string;
  awsAccessKey?: string; // will be masked in responses
  awsSecretKey?: string; // will be masked in responses
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  // Additional computed fields
  tenantName?: string;
  appName?: string;
  isInherited?: boolean; // true if this config is inherited from a higher level
  inheritedFrom?: 'GLOBAL' | 'TENANT'; // which level this config is inherited from
}

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromAddress?: string;
  fromName?: string;
  service: string;
  awsRegion?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  // Resolution metadata
  resolvedFrom: 'GLOBAL' | 'TENANT' | 'APP';
  configId: string;
  isActive: boolean;
}