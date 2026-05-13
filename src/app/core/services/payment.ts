import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface PlanDto {
  planId: string;
  name: string;
  description: string;
  amountPaise: number;
  currency: string;
  durationDays: number;
  features: string[];
}

export interface CreateOrderResponse {
  orderId: string;
  amountPaise: number;
  currency: string;
  razorpayKeyId: string;
  planName: string;
  description: string;
}

export interface VerifyPaymentRequest {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface SubscriptionStatus {
  plan: string;
  status: string;
  startDate?: string;
  endDate?: string;
  active: boolean;
}

// Razorpay checkout options interface
declare var Razorpay: any;

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/payments`;

  getPlans(): Observable<PlanDto[]> {
    return this.http.get<PlanDto[]>(`${this.apiUrl}/plans`).pipe(timeout(8000));
  }

  getSubscriptionStatus(): Observable<SubscriptionStatus> {
    return this.http.get<SubscriptionStatus>(`${this.apiUrl}/subscription`).pipe(timeout(8000));
  }

  /** Creates Razorpay order — 10s timeout so button never hangs forever */
  createOrder(planId: string): Observable<CreateOrderResponse> {
    return this.http.post<CreateOrderResponse>(`${this.apiUrl}/create-order`, { planId })
      .pipe(timeout(10000));
  }

  /** Verifies payment signature — 10s timeout */
  verifyPayment(req: VerifyPaymentRequest): Observable<SubscriptionStatus> {
    return this.http.post<SubscriptionStatus>(`${this.apiUrl}/verify`, req)
      .pipe(timeout(10000));
  }

  /**
   * Opens Razorpay checkout. Returns a promise that resolves with
   * the payment response (razorpayPaymentId, orderId, signature).
   */
  openRazorpayCheckout(order: CreateOrderResponse, userEmail: string): Promise<VerifyPaymentRequest> {
    return new Promise((resolve, reject) => {
      try {
        if (typeof Razorpay === 'undefined') {
          return reject(new Error('Razorpay SDK is not loaded. Please disable your adblocker and try again.'));
        }

        if (!order || !order.razorpayKeyId) {
          return reject(new Error('Invalid order configuration received from server.'));
        }

        if (order.razorpayKeyId.includes('REPLACE_ME')) {
          return reject(new Error('Backend is using placeholder Razorpay keys. Please restart your payment-service to load the new keys from .env.'));
        }

        const options = {
          key: order.razorpayKeyId,
          amount: order.amountPaise,
          currency: order.currency,
          name: 'CodeSync',
          description: order.description,
          order_id: order.orderId,
          prefill: { email: userEmail },
          theme: { color: '#7c3aed' },
          handler: (response: any) => {
            resolve({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
          },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled'))
          }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', (response: any) => {
          reject(new Error(response.error?.description || 'Payment failed in Razorpay'));
        });
        rzp.open();
      } catch (err) {
        reject(new Error('Failed to open payment gateway: ' + (err as Error).message));
      }
    });
  }

  /** Format amount from paise to readable currency string */
  formatAmount(paise: number, currency = 'INR'): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: 0
    }).format(paise / 100);
  }
}
