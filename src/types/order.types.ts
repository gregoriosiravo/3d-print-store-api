export interface AcceptQuoteRequest {
  quoteId: string;
  shippingAddress: ShippingAddress;
}

export interface ShippingAddress {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
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
