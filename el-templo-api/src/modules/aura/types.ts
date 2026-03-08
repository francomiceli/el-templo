// Module: aura

export interface AwardInput {
  userId: number;
  sourceType: string; // matches sourceTypeEnum values
  referenceType?: string;
  referenceId?: number;
  amount?: number; // override config default
  description?: string;
}

export interface SpendInput {
  userId: number;
  amount: number;
  description: string;
  referenceType?: string;
  referenceId?: number;
}

export interface AuraBalance {
  userId: number;
  balance: number;
}
