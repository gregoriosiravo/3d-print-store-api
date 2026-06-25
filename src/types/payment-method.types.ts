export interface AuthUser {
  id: string;
  email?: string;
  stripeCustomerId?: string | null;
}

export interface CreateSetupIntentResponse {
  clientSecret: string;
}

export interface SavePaymentMethodBody {
  paymentMethodId: string;
  makeDefault?: boolean;
}

export interface PaymentMethodDto {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  createdAt: Date;
}

export interface SetDefaultPaymentMethodParams {
  id: string;
}

export interface DeletePaymentMethodParams {
  id: string;
}
