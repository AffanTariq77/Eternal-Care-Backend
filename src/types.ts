export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // plain for prototype only — replace with hashed in prod
  expo_tokens?: string[];
}

export interface Booking {
  id: string;
  userId: string;
  packageId: string;
  date: string; // ISO
  status: 'pending' | 'confirmed' | 'cancelled' | 'paid';
  meta?: any;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'failed' | 'paid';
}

export interface DataShape {
  users: User[];
  bookings: Booking[];
  payments: Payment[];
}
