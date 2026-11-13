export interface AcceptQuoteRequest {
  quoteId: string;
  shippingAddress?: ShippingAddress | null;
}

// Same field names as the address book and the checkout form
export interface ShippingAddress {
  firstName: string;
  lastName: string;
  address: string;
  addressInfo?: string;
  city: string;
  zip: string;
  country: string;
  isPrimary?: boolean;
}

export interface OrderResponse {
  orderId: string;
  orderNumber: string;
  quoteId: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: Date;
}
