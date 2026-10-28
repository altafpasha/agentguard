'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ExternalLink,
  ArrowRight,
  ShoppingBag,
  FileSearch,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { Navigation } from '../../../components/Navigation';

interface CaptureResult {
  success: boolean;
  status: string;
  orderNumber: string;
  orderId?: string;
  total?: number;
  totalFormatted?: string;
  currency?: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  message?: string;
  alreadyCaptured?: boolean;
}

function OrderStatusContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token'); // PayPal Order ID token
  const orderId = searchParams.get('orderId') || token;
  const isCancelled = searchParams.get('cancelled') === 'true';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);

  useEffect(() => {
    if (isCancelled) {
      setLoading(false);
      return;
    }

    if (!orderId) {
      setError('No PayPal order token or local order ID provided in URL parameters.');
      setLoading(false);
      return;
    }

    // Call backend to reconcile and capture verified PayPal Sandbox order
    const captureOrder = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/v1/store/orders/${encodeURIComponent(orderId)}/capture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setResult(data);
        } else {
          setError(data.message || 'Failed to capture and verify PayPal Sandbox order.');
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };

    captureOrder();
  }, [orderId, isCancelled]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      {/* Loading State */}
      {loading && (
        <div className="rounded-3xl bg-[#16181D] border border-white/[0.08] p-10 text-center space-y-4">
          <RefreshCw className="w-10 h-10 animate-spin text-[#D7FF70] mx-auto" />
          <h2 className="text-xl font-bold text-white">Reconciling with PayPal Sandbox API...</h2>
          <p className="text-xs text-[#8E929C] max-w-md mx-auto">
            AgentGuard gateway is retrieving order status, validating amounts, payee credentials, and executing trusted server capture.
          </p>
        </div>
      )}

      {/* Cancelled State */}
      {!loading && isCancelled && (
        <div className="rounded-3xl bg-[#16181D] border border-[#FFB800]/30 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#FFB800]/10 border border-[#FFB800]/30 text-[#FFB800] flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-white">Checkout Cancelled</h2>
          <p className="text-xs text-[#8E929C] max-w-md mx-auto">
            The PayPal Sandbox checkout session was cancelled by the buyer. No funds were captured and the local order has been marked CANCELLED.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/storefront"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#D7FF70] text-[#0E1400] text-xs font-bold hover:bg-[#cbf45c] btn-press touch-manipulation min-h-[44px] flex items-center justify-center"
            >
              Return to Storefront
            </Link>
          </div>
        </div>
      )}

      {/* Error State */}
      {!loading && !isCancelled && error && (
        <div className="rounded-3xl bg-[#16181D] border border-[#FF5C5C]/30 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#FF5C5C]/10 border border-[#FF5C5C]/30 text-[#FF5C5C] flex items-center justify-center mx-auto">
            <XCircle className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-extrabold text-white">Verification Failed</h2>
          <p className="text-xs text-[#FF8585] max-w-md mx-auto font-mono bg-[#FF5C5C]/10 p-3 rounded-xl border border-[#FF5C5C]/20">
            {error}
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/storefront"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#22252D] text-white text-xs font-medium hover:bg-[#2C303A] btn-press touch-manipulation min-h-[44px] flex items-center justify-center"
            >
              Return to Storefront
            </Link>
            <Link
              href="/audit"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#1C1E24] border border-white/[0.1] text-xs font-medium text-[#D7FF70] hover:border-[#D7FF70] btn-press touch-manipulation min-h-[44px] flex items-center justify-center"
            >
              Inspect Audit Log
            </Link>
          </div>
        </div>
      )}

      {/* Verified Success State */}
      {!loading && !isCancelled && result && result.success && (
        <div className="rounded-3xl bg-gradient-to-b from-[#1C1F26] to-[#14161B] border-2 border-[#D7FF70] p-8 lg:p-10 space-y-8 shadow-[0_8px_32px_rgba(215,255,112,0.12)] animate-in fade-in duration-300">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-[#D7FF70]/10 border border-[#D7FF70]/40 text-[#D7FF70] flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <span className="inline-block px-3 py-1 rounded-full bg-[#D7FF70]/10 text-[#D7FF70] text-xs font-bold border border-[#D7FF70]/30 uppercase tracking-wider">
              {result.alreadyCaptured ? 'Payment Verified & Captured' : 'PayPal Sandbox Payment Captured'}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
              Order Verified Successfully
            </h1>
            <p className="text-xs text-[#8E929C] max-w-md mx-auto">
              Your transaction was validated by the AgentGuard deterministic gateway and captured through the official PayPal Sandbox Orders v2 API.
            </p>
          </div>

          {/* Receipt Card */}
          <div className="rounded-2xl bg-[#141519] border border-white/[0.08] p-6 space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <span className="text-xs text-[#8E929C]">Store Order Number</span>
              <span className="font-mono text-sm font-bold text-white">{result.orderNumber}</span>
            </div>

            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <span className="text-xs text-[#8E929C]">PayPal Order ID</span>
              <span className="font-mono text-xs text-[#D7FF70]">{result.paypalOrderId || orderId}</span>
            </div>

            {result.paypalCaptureId && (
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
                <span className="text-xs text-[#8E929C]">PayPal Capture Reference</span>
                <span className="font-mono text-xs text-white">{result.paypalCaptureId}</span>
              </div>
            )}

            {result.totalFormatted && (
              <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
                <span className="text-xs text-[#8E929C]">Total Captured Amount</span>
                <span className="font-mono text-base font-extrabold text-white">
                  ${result.totalFormatted} {result.currency || 'USD'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-[#8E929C]">Security Enforcement</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-[#D7FF70] font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Deterministic Policy: ALLOW</span>
              </span>
            </div>
          </div>

          {/* Navigation Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/storefront"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#D7FF70] text-[#0E1400] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#cbf45c] transition-all shadow-[0_2px_12px_rgba(215,255,112,0.25)] btn-press touch-manipulation min-h-[44px]"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" />
              <span>Continue Shopping</span>
            </Link>
            <Link
              href="/transactions"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#22252D] text-white text-xs font-medium flex items-center justify-center gap-2 hover:bg-[#2C303A] border border-white/[0.1] transition-all btn-press touch-manipulation min-h-[44px]"
            >
              <FileSearch className="w-4 h-4 text-[#D7FF70] shrink-0" />
              <span>View in Dashboard Transactions</span>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

export default function OrderStatusPage() {
  return (
    <div className="min-h-screen bg-[#111215] text-[#F4F4F5]">
      <Navigation />
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <RefreshCw className="w-8 h-8 animate-spin text-[#D7FF70]" />
        </div>
      }>
        <OrderStatusContent />
      </Suspense>
    </div>
  );
}
