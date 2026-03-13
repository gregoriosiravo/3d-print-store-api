export interface Address {
  id?: string;
  userId?: string;
  firstName: string;
  lastName: string;
  address: string;
  addressInfo: string;
  city: string;
  zip: string;
  country: string;
  isPrimary: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
