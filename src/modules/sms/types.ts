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
  sid: string;
  token: string;
  fromNumber: string;
  fallbackTo?: string;
  serviceSid?: string;
  isActive?: boolean;
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