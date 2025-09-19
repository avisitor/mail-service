// SMS Configuration Types
export interface SmsConfig {
  id: string;
  scope: 'GLOBAL' | 'TENANT' | 'APP';
  tenantId?: string;
  appId?: string;
  sid: string;
  token: string;
  fromNumber: string;
  fallbackTo?: string;
  serviceSid?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SmsConfigInput {
  scope: 'GLOBAL' | 'TENANT' | 'APP';
  tenantId?: string;
  appId?: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  fallbackToNumber?: string;
  messagingServiceSid?: string;
  isActive?: boolean;
}

export interface SmsConfigOutput {
  id: string;
  scope: string;
  tenantId?: string;
  appId?: string;
  tenantName?: string;
  appName?: string;
  sid: string;
  token?: string; // Masked for security
  fromNumber: string;
  fallbackTo?: string;
  serviceSid?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SmsConfigListItem {
  id: string;
  scope: string;
  tenantId?: string;
  appId?: string;
  fromNumber: string;
  isActive: boolean;
  createdAt: Date;
}

export interface EffectiveSmsConfig {
  sid: string;
  token: string;
  fromNumber: string;
  fallbackTo?: string;
  serviceSid?: string;
  scope: string;
  configId: string;
}

export interface ResolvedSmsConfig {
  id: string;
  scope: 'GLOBAL' | 'TENANT' | 'APP';
  tenantId?: string;
  appId?: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  fallbackToNumber?: string;
  messagingServiceSid?: string;
  isActive: boolean;
  source: 'GLOBAL' | 'TENANT' | 'APP';
}