import { Injectable } from '@angular/core';

export interface RazorpayInstance {
  open(): void;
  close(): void;
}

export interface RazorpayConstructor {
  new (options: any): RazorpayInstance;
}

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 1500;
const LOAD_TIMEOUT_MS = 20000;

@Injectable({ providedIn: 'root' })
export class RazorpayService {
  private loadPromise: Promise<RazorpayConstructor> | null = null;

  // Dynamically loads the Razorpay checkout script with retries and a hard
  // timeout, so checkout never hangs forever when the CDN is slow/unreachable.
  load(): Promise<RazorpayConstructor> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadScript();
    }
    return this.loadPromise;
  }

  private loadScript(): Promise<RazorpayConstructor> {
    return new Promise<RazorpayConstructor>((resolve, reject) => {
      const attempt = (remaining: number) => {
        if (typeof (window as any).Razorpay === 'function') {
          resolve((window as any).Razorpay as RazorpayConstructor);
          return;
        }

        const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`) as HTMLScriptElement | null;
        if (!existing) {
          const script = document.createElement('script');
          script.src = SCRIPT_URL;
          script.async = true;
          script.id = 'razorpay-checkout-js';
          script.onload = () => {
            if (typeof (window as any).Razorpay === 'function') {
              resolve((window as any).Razorpay as RazorpayConstructor);
            } else {
              retryOrFail(remaining, 'Script loaded but Razorpay is not defined');
            }
          };
          script.onerror = () => retryOrFail(remaining, 'Script failed to load');
          document.head.appendChild(script);
        } else {
          // Script tag exists but Razorpay is not defined yet — wait and retry.
          window.setTimeout(() => retryOrFail(remaining, 'Razorpay not ready'), RETRY_DELAY_MS);
        }
      };

      const retryOrFail = (remaining: number, reason: string) => {
        if (remaining <= 0) {
          reject(new Error(`Razorpay checkout script could not be loaded: ${reason}`));
          return;
        }
        window.setTimeout(() => attempt(remaining - 1), RETRY_DELAY_MS);
      };

      attempt(MAX_ATTEMPTS);

      // Hard timeout: guarantee we never wait forever.
      window.setTimeout(() => {
        if (typeof (window as any).Razorpay !== 'function') {
          reject(new Error('Razorpay checkout script load timed out'));
        }
      }, LOAD_TIMEOUT_MS);
    });
  }
}