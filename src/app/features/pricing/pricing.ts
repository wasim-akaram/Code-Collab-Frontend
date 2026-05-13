import { Component, OnInit, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PaymentService, PlanDto, SubscriptionStatus, CreateOrderResponse } from '../../core/services/payment';
import { AuthService } from '../../core/services/auth';

// Hardcoded fallback plans — page always renders even if payment-service is offline
const FALLBACK_PLANS: PlanDto[] = [
 {
 planId: 'FREE',
 name: 'Free',
 description: 'Get started with CodeSync',
 amountPaise: 0,
 currency: 'INR',
 durationDays: 0,
 features: [
 'Up to 5 projects',
 '1 private project',
 'Code execution (10s timeout)',
 '3 collaborators per session',
 '20 snapshots per file',
 '1 MB file upload limit',
 ]
 },
 {
 planId: 'PRO_MONTHLY',
 name: 'Pro',
 description: 'Unlock the full power of CodeSync',
 amountPaise: 49900,
 currency: 'INR',
 durationDays: 30,
 features: [
 'Unlimited projects',
 'Unlimited private projects',
 'Code execution (60s timeout)',
 '20 collaborators per session',
 'Unlimited snapshots',
 '10 MB file upload limit',
 'Pro badge on profile',
 ]
 }
];

@Component({
 selector: 'app-pricing',
 standalone: true,
 imports: [CommonModule, RouterLink],
 templateUrl: './pricing.html',
 styleUrls: ['./pricing.css']
})
export class Pricing implements OnInit {
 private paymentService = inject(PaymentService);
 protected authService = inject(AuthService);
 private cdr = inject(ChangeDetectorRef);
 private zone = inject(NgZone);

 // Start with fallback plans — page renders immediately
 plans: PlanDto[] = FALLBACK_PLANS;
 subscription: SubscriptionStatus | null = null;

 // Pre-created order — ready before button click
 private preCreatedOrder: CreateOrderResponse | null = null;
 orderReady = false; // true when order is pre-created and button can open Razorpay instantly
 orderLoading = true; // true while pre-creating order on page load
 orderError = ''; // shown if pre-creation fails

 isProcessing = false;
 statusMessage = '';
 successMessage = '';
 errorMessage = '';

 get isLoggedIn(): boolean { return this.authService.hasValidToken(); }
 get isPro(): boolean { return this.authService.isPro(); }
 get userEmail(): string { return this.authService.getCurrentUserEmail(); }

 ngOnInit() {
 // Try to load live plans from backend — update if successful
 this.paymentService.getPlans().subscribe({
 next: (plans) => { if (plans?.length) this.plans = plans; this.cdr.detectChanges(); },
 error: () => { /* keep fallback plans */ }
 });

 if (this.isLoggedIn) {
 this.paymentService.getSubscriptionStatus().subscribe({
 next: (sub) => { this.subscription = sub; this.cdr.detectChanges(); },
 error: () => {}
 });

 // Pre-create the Razorpay order so click → instant popup
 if (!this.isPro) {
 this.preCreateOrder();
 } else {
 this.orderLoading = false;
 }
 } else {
 this.orderLoading = false;
 }
 }

 formatAmount(paise: number): string {
 if (paise === 0) return 'Free';
 return new Intl.NumberFormat('en-IN', {
 style: 'currency', currency: 'INR', maximumFractionDigits: 0
 }).format(paise / 100);
 }

 /**
 * Pre-creates a Razorpay order on page load so that the "Upgrade" button
 * can open the Razorpay checkout instantly without any loading wait.
 */
 private async preCreateOrder() {
 this.orderLoading = true;
 this.orderError = '';
 this.cdr.detectChanges();

 try {
 const order = await this.raceTimeout(
 firstValueFrom(this.paymentService.createOrder('PRO_MONTHLY')),
 8000
 );
 this.preCreatedOrder = order;
 this.orderReady = true;
 this.orderError = '';
 } catch (err: any) {
 this.preCreatedOrder = null;
 this.orderReady = false;
 this.orderError = this.getOrderErrorMessage(err);
 } finally {
 this.orderLoading = false;
 this.zone.run(() => this.cdr.detectChanges());
 }
 }

 /**
 * Main upgrade flow:
 * - If order is pre-created → open Razorpay instantly
 * - If not → try to create order on-the-fly with loading state
 */
 async upgradeToPro() {
 if (!this.isLoggedIn) {
 window.location.href = '/login?redirect=/pricing';
 return;
 }
 if (this.isPro) return;

 this.errorMessage = '';
 this.successMessage = '';

 try {
 let order = this.preCreatedOrder;

 // If pre-created order is not available, create one now
 if (!order) {
 this.isProcessing = true;
 this.statusMessage = 'Creating order...';
 this.cdr.detectChanges();

 order = await this.raceTimeout(
 firstValueFrom(this.paymentService.createOrder('PRO_MONTHLY')),
 10000
 );
 this.isProcessing = false;
 this.statusMessage = '';
 this.cdr.detectChanges();
 }

 // Open Razorpay checkout — user sees payment methods immediately
 const paymentResponse = await this.paymentService.openRazorpayCheckout(order, this.userEmail);

 // Verify payment
 this.isProcessing = true;
 this.statusMessage = 'Verifying payment...';
 this.cdr.detectChanges();

 const result = await this.raceTimeout(
 firstValueFrom(this.paymentService.verifyPayment(paymentResponse)),
 10000
 );

 this.successMessage = ' Welcome to CodeSync Pro! Your subscription is now active.';
 this.subscription = result;
 this.statusMessage = 'Activating Pro...';
 this.cdr.detectChanges();

 // Refresh the JWT so it includes plan: "PRO" — this makes isPro() return true
 // on the dashboard (Pro badge, no upgrade CTA).
 try {
 await this.raceTimeout(firstValueFrom(this.authService.refreshToken()), 5000);
 } catch {
 // Token refresh failed — user will see Pro on next login
 }

 this.cdr.detectChanges();
 setTimeout(() => window.location.href = '/dashboard', 1500);

 } catch (err: any) {
 const msg = err?.message || '';
 if (msg === 'Payment cancelled') {
 this.errorMessage = 'Payment was cancelled.';
 } else if (msg === 'TIMEOUT') {
 this.errorMessage = ' Payment service is not reachable. Please ensure payment-service is running and try again.';
 } else if (err?.status === 0) {
 this.errorMessage = ' Cannot connect to payment server. Please try again.';
 } else {
 this.errorMessage = err?.error?.message || msg || 'Payment failed. Please try again.';
 }
 } finally {
 this.isProcessing = false;
 this.statusMessage = '';
 this.zone.run(() => this.cdr.detectChanges());
 }
 }

 /** Retry pre-creating the order (called from the "Retry" button in template) */
 retryOrder() {
 this.orderError = '';
 this.errorMessage = '';
 this.preCreateOrder();
 }

 // ─── Helpers ────────────────────────────────────────────────────────────────

 /** Race a promise against a timeout. Rejects with 'TIMEOUT' message. */
 private raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
 const timeout = new Promise<never>((_, reject) =>
 setTimeout(() => reject(new Error('TIMEOUT')), ms)
 );
 return Promise.race([promise, timeout]);
 }

 private getOrderErrorMessage(err: any): string {
 const msg = err?.message || '';
 if (msg === 'TIMEOUT') {
 return 'Payment service is not responding. Please ensure it is running.';
 }
 if (err?.status === 0 || err?.status === 503 || err?.status === 502) {
 return 'Payment service is offline. Please start it and refresh.';
 }
 if (msg.includes('Razorpay')) {
 return msg;
 }
 return err?.error?.message || msg || 'Could not prepare payment. Please refresh.';
 }
}
