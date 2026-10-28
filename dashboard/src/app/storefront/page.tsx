'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Sparkles,
  Bot,
  ExternalLink,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Terminal,
  Bug,
  Lock,
  RefreshCw,
  Zap,
  Plus,
  Minus,
  Trash2,
  X,
  CreditCard,
  Check,
  Eye,
  Info,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';

interface Product {
  id: string;
  name: string;
  category: string;
  priceCents: string;
  priceFormatted: string;
  currency: string;
  description: string;
  details?: string;
  imageUrl?: string;
  stock: number;
  isAvailable: boolean;
  merchantEmail: string;
  merchantName: string;
  isMalicious: boolean;
  expectedScenario?: string;
  injectionSnippet?: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface StoreOrder {
  id: string;
  orderNumber: string;
  agentId?: string;
  status: string;
  totalCents: string;
  totalFormatted: string;
  currency: string;
  securityDecision?: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  merchantEmail: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPriceFormatted: string;
    subtotalFormatted: string;
  }>;
  createdAt: string;
}

export default function StorefrontPage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'orders' | 'agent_demo'>('catalog');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Product Detail Modal
  const [activeProductModal, setActiveProductModal] = useState<Product | null>(null);
  const [modalQuantity, setModalQuantity] = useState<number>(1);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  // Checkout Decision / Verification Modal State
  const [checkoutResult, setCheckoutResult] = useState<{
    status: 'ALLOW' | 'BLOCK' | 'HOLD' | 'ERROR' | null;
    httpCode: number;
    message: string;
    orderId?: string;
    orderNumber?: string;
    paypalOrderId?: string;
    approvalUrl?: string;
    approvalId?: string;
    violations?: string[];
    isInjection?: boolean;
    findings?: string[];
  } | null>(null);

  // Capture in-progress state
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureReceipt, setCaptureReceipt] = useState<{
    orderNumber: string;
    paypalCaptureId: string;
    status: string;
  } | null>(null);

  // Scripted Agent Demo State
  const [agentScenario, setAgentScenario] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [agentExecuting, setAgentExecuting] = useState(false);
  const [agentLogs, setAgentLogs] = useState<Array<{ step: string; text: string; status: 'info' | 'pass' | 'block' | 'hold' }>>([]);

  // Fetch real catalog products from backend data layer
  const loadProducts = async () => {
    try {
      setIsLoadingProducts(true);
      const res = await fetch('/api/v1/store/products');
      const data = await res.json();
      if (data.products) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  // Fetch real store orders from backend
  const loadOrders = async () => {
    try {
      setIsLoadingOrders(true);
      const res = await fetch('/api/v1/store/orders');
      const data = await res.json();
      if (data.orders) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') {
      loadOrders();
    }
  }, [activeTab]);

  // Cart operations
  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    setIsCartOpen(true);
    setActiveProductModal(null);
    setModalQuantity(1);
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  // Calculate cart subtotal (for client preview, but backend validates authoritatively!)
  const cartSubtotal = cart.reduce((acc, item) => {
    return acc + (Number(item.product.priceCents) / 100) * item.quantity;
  }, 0);

  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Real Checkout: sends ONLY product IDs and quantities to server
  const handleCheckout = async (itemsToCheckout = cart) => {
    if (itemsToCheckout.length === 0) return;

    try {
      setIsCheckingOut(true);
      setCheckoutResult(null);
      setCaptureReceipt(null);

      // CRITICAL SECURITY ENFORCEMENT:
      // Notice we send ONLY productId and quantity.
      // Client-supplied prices are strictly NOT sent!
      const checkoutPayload = {
        agentId: `shopper-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        items: itemsToCheckout.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        buyerNotes: 'Order submitted from AgentGuard Demo Storefront',
      };

      const res = await fetch('/api/v1/store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutPayload),
      });

      const data = await res.json();
      const status = res.status;

      if (status === 200 && data.success) {
        setCheckoutResult({
          status: 'ALLOW',
          httpCode: 200,
          message: 'Order evaluated within security limits. PayPal Sandbox order created.',
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          paypalOrderId: data.paypalOrderId,
          approvalUrl: data.approvalUrl,
        });
        // Clear cart on successful order creation
        setCart([]);
        setIsCartOpen(false);
      } else if (status === 403) {
        const isInjection = data.error === 'PROMPT_INJECTION_DETECTED';
        setCheckoutResult({
          status: 'BLOCK',
          httpCode: 403,
          message: data.message || 'Transaction rejected by AgentGuard gateway.',
          isInjection,
          violations: data.details?.violations,
          findings: data.details?.scanResult?.findings?.map((f: { name: string }) => f.name),
        });
      } else if (status === 202) {
        setCheckoutResult({
          status: 'HOLD',
          httpCode: 202,
          message: data.message || 'Amount exceeds automated threshold. Enqueued in Reviewer Queue.',
          orderId: data.details?.orderId,
          orderNumber: data.details?.orderNumber,
          approvalId: data.details?.approvalId,
          violations: data.details?.violations,
        });
        setCart([]);
        setIsCartOpen(false);
      } else {
        setCheckoutResult({
          status: 'ERROR',
          httpCode: status,
          message: data.message || 'Unexpected response from checkout gateway.',
        });
      }
    } catch (err) {
      setCheckoutResult({
        status: 'ERROR',
        httpCode: 500,
        message: `Network or gateway failure: ${String(err)}`,
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Capture PayPal Sandbox Payment
  const handleCaptureOrder = async (orderIdToCapture: string) => {
    try {
      setIsCapturing(true);
      const res = await fetch(`/api/v1/store/orders/${encodeURIComponent(orderIdToCapture)}/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCaptureReceipt({
          orderNumber: data.orderNumber,
          paypalCaptureId: data.paypalCaptureId || 'CAP-VERIFIED',
          status: 'COMPLETED',
        });
        // Refresh orders list
        loadOrders();
      } else {
        alert(data.message || 'Failed to capture payment with PayPal Sandbox.');
      }
    } catch (err) {
      alert(`Capture failed: ${String(err)}`);
    } finally {
      setIsCapturing(false);
    }
  };

  // Scripted Shopping Agent Scenario Runner (for Hackathon Demo)
  const runAgentScenario = async (scenario: 'A' | 'B' | 'C' | 'D') => {
    setAgentScenario(scenario);
    setAgentExecuting(true);
    setAgentLogs([]);
    setCheckoutResult(null);

    const logs: Array<{ step: string; text: string; status: 'info' | 'pass' | 'block' | 'hold' }> = [];
    const addLog = (l: { step: string; text: string; status: 'info' | 'pass' | 'block' | 'hold' }) => {
      logs.push(l);
      setAgentLogs([...logs]);
    };

    // Find fixture product matching scenario
    let targetProduct = products.find((p) => p.expectedScenario === scenario);
    if (!targetProduct) {
      if (scenario === 'A') targetProduct = products.find((p) => p.id === 'prod-devops-license');
      if (scenario === 'B') targetProduct = products.find((p) => p.id === 'prod-server-rack');
      if (scenario === 'C') targetProduct = products.find((p) => p.id === 'prod-smart-cam-injection');
      if (scenario === 'D') targetProduct = products.find((p) => p.id === 'prod-priority-support');
    }

    if (!targetProduct) {
      addLog({ step: 'ERROR', text: `Product fixture for Scenario ${scenario} not found.`, status: 'block' });
      setAgentExecuting(false);
      return;
    }

    addLog({
      step: '1. INTENT REASONING',
      text: `Autonomous agent formulated purchase proposal for "${targetProduct.name}" ($${targetProduct.priceFormatted} ${targetProduct.currency}).`,
      status: 'info',
    });

    addLog({
      step: '2. STOREFRONT CHECKOUT',
      text: `Agent dispatched checkout payload with productId "${targetProduct.id}" and qty 1 to /api/v1/store/checkout.`,
      status: 'info',
    });

    await new Promise((r) => setTimeout(r, 600));

    // Execute real checkout with this single fixture item
    const fixtureCart = [{ product: targetProduct, quantity: 1 }];
    await handleCheckout(fixtureCart);

    setAgentExecuting(false);
  };

  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category)))];

  const filteredProducts = products.filter((p) => {
    if (selectedCategory === 'All') return true;
    return p.category === selectedCategory;
  });

  return (
    <div className="min-h-screen bg-[#111215] text-[#F4F4F5]">
      <Navigation />

      <main className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Storefront Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#1C1E24] via-[#1E222A] to-[#16181D] border border-white/[0.08] p-6 lg:p-8">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D7FF70]/10 border border-[#D7FF70]/30 text-[#D7FF70] text-xs font-semibold">
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Demonstration Merchant: AgentGuard Verified Commerce</span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                Protected Storefront & Autonomous Checkout
              </h1>
              <p className="text-sm text-[#8E929C] max-w-2xl">
                Real database-backed product catalog protected by AgentGuard. Every cart checkout is authoritatively evaluated server-side, enforcing single-transaction spending caps ($50.00), prompt injection filters, and authenticated approvals before PayPal Sandbox orders are created.
              </p>
            </div>

            {/* Quick Actions & Cart Trigger */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="relative flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold hover:bg-[#cbf45c] transition-all shadow-[0_2px_12px_rgba(215,255,112,0.25)] btn-press min-h-[44px]"
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>View Cart</span>
                {cartItemCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-[#0E1400] text-[#D7FF70] text-[11px] font-black">
                    {cartItemCount}
                  </span>
                )}
              </button>

              <Link
                href="/approvals"
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#1C1E24] border border-white/[0.1] hover:border-[#D7FF70]/40 text-xs font-semibold text-white transition-all btn-press min-h-[44px]"
              >
                <Clock className="w-4 h-4 text-[#FFB800] shrink-0" />
                <span className="inline">Reviewer Queue</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-white/[0.08] pb-4 gap-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap min-h-[40px] btn-press ${
                activeTab === 'catalog'
                  ? 'bg-[#1C1E24] text-[#D7FF70] border border-[#D7FF70]/40 shadow-sm'
                  : 'text-[#8E929C] hover:text-white bg-[#141519]/60'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
              <span>Product Catalog ({products.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('agent_demo')}
              className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap min-h-[40px] btn-press ${
                activeTab === 'agent_demo'
                  ? 'bg-[#1C1E24] text-[#D7FF70] border border-[#D7FF70]/40 shadow-sm'
                  : 'text-[#8E929C] hover:text-white bg-[#141519]/60'
              }`}
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span>Autonomous Agent Attack Lab</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`px-3.5 sm:px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap min-h-[40px] btn-press ${
                activeTab === 'orders'
                  ? 'bg-[#1C1E24] text-[#D7FF70] border border-[#D7FF70]/40 shadow-sm'
                  : 'text-[#8E929C] hover:text-white bg-[#141519]/60'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 shrink-0" />
              <span>Order History &amp; Receipts</span>
            </button>
          </div>

          {/* Catalog Category Pills (Fully Responsive on Mobile & Desktop) */}
          {activeTab === 'catalog' && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all btn-press min-h-[34px] ${
                    selectedCategory === cat
                      ? 'bg-white/15 text-[#D7FF70] border border-[#D7FF70]/30 shadow-sm'
                      : 'text-[#8E929C] hover:text-white bg-[#16181D] border border-white/[0.05]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TAB 1: PRODUCT CATALOG */}
        {activeTab === 'catalog' && (
          <div>
            {isLoadingProducts ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#8E929C] space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin text-[#D7FF70]" />
                <p className="text-xs">Loading verified catalog from database...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProducts.map((p) => {
                  const isLimitExceeded = Number(p.priceCents) > 5000;
                  const isHitlRequired = Number(p.priceCents) >= 2500 && Number(p.priceCents) <= 5000;

                  return (
                    <div
                      key={p.id}
                      className="group flex flex-col rounded-2xl bg-[#16181D] border border-white/[0.08] hover:border-[#D7FF70]/40 transition-all overflow-hidden shadow-sm hover:shadow-[0_4px_24px_rgba(215,255,112,0.08)]"
                    >
                      {/* Product Image Frame */}
                      <div className="relative w-full h-48 bg-[#1F222A] overflow-hidden">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">
                            <ShoppingBag className="w-12 h-12" />
                          </div>
                        )}

                        {/* Scenario / Policy Badges */}
                        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
                          {p.isMalicious && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FF5C5C]/90 text-white text-[10px] font-bold shadow-md flex items-center gap-1">
                              <Bug className="w-3 h-3" />
                              <span>Malicious Listing</span>
                            </span>
                          )}
                          {isLimitExceeded && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FF5C5C]/90 text-white text-[10px] font-bold shadow-md">
                              Exceeds $50 Limit
                            </span>
                          )}
                          {isHitlRequired && (
                            <span className="px-2 py-0.5 rounded-full bg-[#FFB800]/90 text-[#0E1400] text-[10px] font-bold shadow-md">
                              Requires Review (&gt;$25)
                            </span>
                          )}
                          {!p.isMalicious && !isLimitExceeded && !isHitlRequired && (
                            <span className="px-2 py-0.5 rounded-full bg-[#D7FF70]/90 text-[#0E1400] text-[10px] font-bold shadow-md">
                              Within Limit
                            </span>
                          )}
                        </div>

                        {/* Availability Stock Tag */}
                        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-mono text-white/80">
                          {p.stock} in stock
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="flex-1 p-5 flex flex-col justify-between space-y-4">
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold text-[#8E929C] uppercase tracking-wider">
                            {p.category}
                          </div>
                          <h3 className="text-sm font-bold text-white group-hover:text-[#D7FF70] transition-colors line-clamp-1">
                            {p.name}
                          </h3>
                          <p className="text-xs text-[#8E929C] line-clamp-2 leading-relaxed">
                            {p.description}
                          </p>
                        </div>

                        {/* Price & Actions */}
                        <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
                          <div>
                            <span className="text-base font-extrabold text-white font-mono">
                              ${p.priceFormatted}
                            </span>
                            <span className="text-[10px] text-[#8E929C] ml-1">{p.currency}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveProductModal(p);
                                setModalQuantity(1);
                              }}
                              className="p-2.5 min-w-[40px] min-h-[40px] rounded-xl bg-[#22252D] hover:bg-[#2C303A] text-white/80 hover:text-white transition-all flex items-center justify-center btn-press touch-manipulation"
                              title="View Details"
                              aria-label={`View details for ${p.name}`}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => addToCart(p, 1)}
                              className="px-4 py-2 min-h-[40px] rounded-xl bg-[#D7FF70] hover:bg-[#cbf45c] text-[#0E1400] text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm btn-press touch-manipulation"
                              aria-label={`Add ${p.name} to cart`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AUTONOMOUS AGENT ATTACK LAB (For Hackathon Scenarios) */}
        {activeTab === 'agent_demo' && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-[#16181D] border border-white/[0.08] p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-[#D7FF70]" />
                <h2 className="text-base font-bold text-white">Demonstrate Autonomous Agent Scenarios</h2>
              </div>
              <p className="text-xs text-[#8E929C] leading-relaxed max-w-3xl">
                Select a scenario below to run an autonomous shopping agent against the live storefront. The agent submits real product IDs to the server-side gateway endpoint. Watch AgentGuard evaluate policy limits, catch prompt injections, hold high-value orders, or complete genuine PayPal Sandbox checkouts.
              </p>

              {/* Scenario Selection Grid (Responsive: 1 col on mobile, 2 col on tablet, 4 col on desktop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={() => runAgentScenario('A')}
                  disabled={agentExecuting}
                  className={`p-4 rounded-2xl border text-left transition-all btn-press touch-manipulation min-h-[44px] ${
                    agentScenario === 'A'
                      ? 'bg-[#1C1E24] border-[#D7FF70] ring-1 ring-[#D7FF70]/50'
                      : 'bg-[#141519] border-white/[0.06] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-[#D7FF70]/10 border border-[#D7FF70]/30 text-[#D7FF70] text-[10px] font-bold">
                      Scenario A
                    </span>
                    <span className="font-mono text-xs text-[#D7FF70] font-bold">$18.50</span>
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">Normal Purchase</h4>
                  <p className="text-[11px] text-[#8E929C]">DevOps License within $50 cap. Evaluated &amp; approved for PayPal checkout.</p>
                </button>

                <button
                  type="button"
                  onClick={() => runAgentScenario('B')}
                  disabled={agentExecuting}
                  className={`p-4 rounded-2xl border text-left transition-all btn-press touch-manipulation min-h-[44px] ${
                    agentScenario === 'B'
                      ? 'bg-[#1C1E24] border-[#FF5C5C] ring-1 ring-[#FF5C5C]/50'
                      : 'bg-[#141519] border-white/[0.06] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-[#FF5C5C]/10 border border-[#FF5C5C]/30 text-[#FF5C5C] text-[10px] font-bold">
                      Scenario B
                    </span>
                    <span className="font-mono text-xs text-[#FF5C5C] font-bold">$75.00</span>
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">Spending Limit</h4>
                  <p className="text-[11px] text-[#8E929C]">Server Rack exceeds $50.00 cap. Blocked before PayPal order creation.</p>
                </button>

                <button
                  type="button"
                  onClick={() => runAgentScenario('C')}
                  disabled={agentExecuting}
                  className={`p-4 rounded-2xl border text-left transition-all btn-press touch-manipulation min-h-[44px] ${
                    agentScenario === 'C'
                      ? 'bg-[#1C1E24] border-[#FF5C5C] ring-1 ring-[#FF5C5C]/50'
                      : 'bg-[#141519] border-white/[0.06] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-[#FF5C5C]/10 border border-[#FF5C5C]/30 text-[#FF5C5C] text-[10px] font-bold">
                      Scenario C
                    </span>
                    <span className="font-mono text-xs text-[#FF8585] font-bold">$19.99</span>
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">Prompt Injection</h4>
                  <p className="text-[11px] text-[#8E929C]">Smart Cam with embedded instruction override. Blocked by dual-layer regex scanner.</p>
                </button>

                <button
                  type="button"
                  onClick={() => runAgentScenario('D')}
                  disabled={agentExecuting}
                  className={`p-4 rounded-2xl border text-left transition-all btn-press touch-manipulation min-h-[44px] ${
                    agentScenario === 'D'
                      ? 'bg-[#1C1E24] border-[#FFB800] ring-1 ring-[#FFB800]/50'
                      : 'bg-[#141519] border-white/[0.06] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-[#FFB800]/10 border border-[#FFB800]/30 text-[#FFB800] text-[10px] font-bold">
                      Scenario D
                    </span>
                    <span className="font-mono text-xs text-[#FFB800] font-bold">$35.00</span>
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">Human Review (HOLD)</h4>
                  <p className="text-[11px] text-[#8E929C]">Priority SLA exceeds $25.00 threshold. Enqueued in Reviewer Queue.</p>
                </button>
              </div>

              {/* Execution Terminal */}
              <div className="rounded-xl bg-[#0F1013] border border-white/[0.06] p-4 font-mono text-xs space-y-2">
                <div className="flex items-center justify-between text-white/50 pb-2 border-b border-white/[0.06]">
                  <span className="flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-[#D7FF70]" />
                    <span>AgentGuard Gateway Live Execution Log</span>
                  </span>
                  <span>{agentExecuting ? 'Executing...' : 'Idle'}</span>
                </div>

                {agentLogs.length === 0 ? (
                  <p className="text-white/40 italic py-2">Click any scenario above to trigger an autonomous purchasing proposal.</p>
                ) : (
                  <div className="space-y-1.5 py-1">
                    {agentLogs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-[#D7FF70]">{'>'}</span>
                        <span className="font-bold text-white/80">{log.step}:</span>
                        <span className={log.status === 'block' ? 'text-[#FF8585]' : 'text-white/70'}>
                          {log.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ORDER HISTORY & RECEIPTS */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Verified Store Orders</h2>
                <p className="text-xs text-[#8E929C]">
                  All transactions persisted in the AgentGuard database with PayPal Sandbox capture references.
                </p>
              </div>
              <button
                type="button"
                onClick={loadOrders}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1C1E24] border border-white/[0.08] hover:border-white/20 text-xs text-white"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {isLoadingOrders ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#8E929C]">
                <RefreshCw className="w-8 h-8 animate-spin text-[#D7FF70] mb-2" />
                <p className="text-xs">Loading persisted orders...</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-2xl bg-[#16181D] border border-white/[0.08] p-12 text-center space-y-3">
                <ShoppingBag className="w-10 h-10 text-white/20 mx-auto" />
                <h3 className="text-sm font-bold text-white">No store orders found</h3>
                <p className="text-xs text-[#8E929C] max-w-sm mx-auto">
                  Execute a purchase from the catalog or run a scenario in the Attack Lab to generate genuine database records.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-[#16181D] border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-[#8E929C] bg-[#141519]">
                        <th className="py-3 px-4 font-semibold">Order #</th>
                        <th className="py-3 px-4 font-semibold">Date &amp; Time</th>
                        <th className="py-3 px-4 font-semibold">Purchased Items</th>
                        <th className="py-3 px-4 font-semibold">Total</th>
                        <th className="py-3 px-4 font-semibold">PayPal Reference</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {orders.map((order) => {
                        const isCompleted = order.status === 'COMPLETED';
                        const isPending = order.status === 'PAYPAL_ORDER_CREATED';
                        const isHeld = order.status === 'HELD_APPROVAL';
                        const isBlocked = order.status === 'BLOCKED';

                        return (
                          <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-white">
                              {order.orderNumber}
                            </td>
                            <td className="py-3.5 px-4 text-[#8E929C]">
                              {new Date(order.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4 text-[#E4E4E7]">
                              {order.items.map((it) => `${it.quantity}x ${it.productName}`).join(', ')}
                            </td>
                            <td className="py-3.5 px-4 font-mono font-bold text-white">
                              ${order.totalFormatted} {order.currency}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-[11px] text-[#8E929C]">
                              {order.paypalCaptureId || order.paypalOrderId || '—'}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  isCompleted
                                    ? 'bg-[#D7FF70]/10 text-[#D7FF70] border-[#D7FF70]/30'
                                    : isHeld
                                    ? 'bg-[#FFB800]/10 text-[#FFB800] border-[#FFB800]/30'
                                    : isBlocked
                                    ? 'bg-[#FF5C5C]/10 text-[#FF5C5C] border-[#FF5C5C]/30'
                                    : 'bg-white/10 text-white border-white/20'
                                }`}
                              >
                                {order.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {isPending && order.paypalOrderId && (
                                <button
                                  type="button"
                                  onClick={() => handleCaptureOrder(order.id)}
                                  disabled={isCapturing}
                                  className="px-2.5 py-1 rounded-lg bg-[#D7FF70] text-[#0E1400] text-[11px] font-bold hover:bg-[#cbf45c]"
                                >
                                  {isCapturing ? 'Verifying...' : 'Capture'}
                                </button>
                              )}
                              {isCompleted && (
                                <Link
                                  href={`/storefront/order-status?orderId=${encodeURIComponent(order.id)}`}
                                  className="text-[11px] text-[#D7FF70] hover:underline"
                                >
                                  Receipt
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* PRODUCT DETAIL MODAL */}
      {activeProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-3xl bg-[#1A1C22] border border-white/[0.1] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Image */}
            <div className="relative w-full h-56 bg-[#16181D]">
              {activeProductModal.imageUrl ? (
                <img
                  src={activeProductModal.imageUrl}
                  alt={activeProductModal.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20">
                  <ShoppingBag className="w-16 h-16" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setActiveProductModal(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <span className="text-[10px] font-bold text-[#8E929C] uppercase tracking-wider">
                  {activeProductModal.category}
                </span>
                <h2 className="text-xl font-extrabold text-white mt-1">
                  {activeProductModal.name}
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-2xl font-extrabold text-[#D7FF70] font-mono">
                  ${activeProductModal.priceFormatted}
                </span>
                <span className="text-xs text-[#8E929C]">{activeProductModal.currency}</span>
                <span className="ml-auto text-xs text-[#8E929C] font-mono">
                  Stock: {activeProductModal.stock} units
                </span>
              </div>

              <p className="text-xs text-[#C5C8D0] leading-relaxed">
                {activeProductModal.description}
              </p>

              {activeProductModal.details && (
                <div className="p-3 rounded-xl bg-[#141519] border border-white/[0.06] text-xs text-[#8E929C] space-y-1">
                  <span className="font-bold text-white/80 block">Specifications:</span>
                  <p>{activeProductModal.details}</p>
                </div>
              )}

              {activeProductModal.isMalicious && (
                <div className="p-3.5 rounded-xl bg-[#FF5C5C]/10 border border-[#FF5C5C]/25 text-xs text-[#FF8585] space-y-1.5">
                  <div className="flex items-center gap-2 font-bold">
                    <Bug className="w-4 h-4" />
                    <span>Adversarial Prompt Injection Fixture</span>
                  </div>
                  <p className="text-[11px] text-white/70">
                    This item contains an adversarial prompt payload designed to test the AgentGuard gateway scanner.
                  </p>
                </div>
              )}

              {/* Quantity Selector & Add */}
              <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-1 sm:gap-2 rounded-xl bg-[#141519] border border-white/[0.1] p-1">
                  <button
                    type="button"
                    onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
                    aria-label="Decrease quantity"
                    className="p-2 min-w-[36px] min-h-[36px] rounded-lg hover:bg-white/10 text-white flex items-center justify-center btn-press touch-manipulation"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center font-mono font-bold text-xs text-white">
                    {modalQuantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalQuantity(modalQuantity + 1)}
                    aria-label="Increase quantity"
                    className="p-2 min-w-[36px] min-h-[36px] rounded-lg hover:bg-white/10 text-white flex items-center justify-center btn-press touch-manipulation"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => addToCart(activeProductModal, modalQuantity)}
                  className="flex-1 py-3 px-5 rounded-xl bg-[#D7FF70] hover:bg-[#cbf45c] text-[#0E1400] text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all btn-press touch-manipulation min-h-[44px]"
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  <span>Add to Cart (${(Number(activeProductModal.priceFormatted) * modalQuantity).toFixed(2)})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CART SLIDE-OVER DRAWER */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md h-full bg-[#181A20] border-l border-white/[0.1] p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#D7FF70]" />
                <h3 className="text-base font-bold text-white">Shopping Cart</h3>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-mono text-white/80">
                  {cartItemCount}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                aria-label="Close cart drawer"
                className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-lg bg-white/[0.05] hover:bg-white/10 flex items-center justify-center text-[#8E929C] hover:text-white transition-colors btn-press touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {cart.length === 0 ? (
                <div className="py-20 text-center space-y-3 text-[#8E929C]">
                  <ShoppingBag className="w-12 h-12 text-white/10 mx-auto" />
                  <p className="text-xs">Your cart is empty.</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#141519] border border-white/[0.06]"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{item.product.name}</h4>
                      <span className="text-[11px] text-[#D7FF70] font-mono">
                        ${item.product.priceFormatted} each
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 bg-[#1C1E24] rounded-lg border border-white/[0.06] p-0.5">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.product.id, -1)}
                        aria-label="Decrease item quantity"
                        className="p-1.5 min-w-[32px] min-h-[32px] hover:text-[#D7FF70] text-white/70 flex items-center justify-center btn-press touch-manipulation"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-mono font-bold text-white">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.product.id, 1)}
                        aria-label="Increase item quantity"
                        className="p-1.5 min-w-[32px] min-h-[32px] hover:text-[#D7FF70] text-white/70 flex items-center justify-center btn-press touch-manipulation"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.product.id)}
                      aria-label="Remove item from cart"
                      className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-white/40 hover:text-[#FF5C5C] transition-colors btn-press touch-manipulation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Drawer Footer & Checkout */}
            {cart.length > 0 && (
              <div className="pt-4 border-t border-white/[0.08] space-y-4">
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[#8E929C]">
                    <span>Item Subtotal</span>
                    <span className="font-mono text-white">${cartSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#8E929C]">
                    <span>Sandbox Demo Tax / Shipping</span>
                    <span className="font-mono text-white">$0.00</span>
                  </div>
                  <div className="flex items-center justify-between text-sm font-bold text-white pt-2 border-t border-white/[0.06]">
                    <span>Estimated Total</span>
                    <span className="font-mono text-[#D7FF70]">${cartSubtotal.toFixed(2)} USD</span>
                  </div>
                </div>

                <div className="rounded-xl bg-[#141519] border border-white/[0.06] p-2.5 text-[11px] text-[#8E929C] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#D7FF70] shrink-0" />
                  <span>AgentGuard server will look up authoritative prices and enforce policy limits.</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCheckout()}
                  disabled={isCheckingOut}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#D7FF70] hover:bg-[#cbf45c] text-[#0E1400] text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg transition-all btn-press touch-manipulation min-h-[48px]"
                >
                  {isCheckingOut ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                      <span>Evaluating Security Gateway...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 shrink-0" />
                      <span>Checkout via PayPal Sandbox</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CHECKOUT RESULT & DECISION MODAL */}
      {checkoutResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-[#1A1C22] border border-white/[0.1] p-6 space-y-6 shadow-2xl">
            {/* Modal Header by Status */}
            {checkoutResult.status === 'ALLOW' && (
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-[#D7FF70]/10 border border-[#D7FF70]/30 text-[#D7FF70] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">PayPal Sandbox Order Created</h3>
                <p className="text-xs text-[#8E929C]">
                  AgentGuard verified server-side prices, stock, and spending limits. The transaction is authorized.
                </p>
              </div>
            )}

            {checkoutResult.status === 'BLOCK' && (
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-[#FF5C5C]/10 border border-[#FF5C5C]/30 text-[#FF5C5C] flex items-center justify-center mx-auto">
                  <XCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">
                  {checkoutResult.isInjection ? 'Prompt Injection Blocked' : 'Policy Block: Limit Exceeded'}
                </h3>
                <p className="text-xs text-[#FF8585] bg-[#FF5C5C]/10 p-2.5 rounded-xl border border-[#FF5C5C]/20">
                  {checkoutResult.message}
                </p>
              </div>
            )}

            {checkoutResult.status === 'HOLD' && (
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-[#FFB800]/10 border border-[#FFB800]/30 text-[#FFB800] flex items-center justify-center mx-auto">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Human Approval Required (HOLD)</h3>
                <p className="text-xs text-[#8E929C]">
                  {checkoutResult.message}
                </p>
              </div>
            )}

            {/* Details Box */}
            <div className="rounded-xl bg-[#141519] border border-white/[0.06] p-4 text-xs space-y-2 font-mono">
              {checkoutResult.orderNumber && (
                <div className="flex justify-between">
                  <span className="text-[#8E929C]">Order Number:</span>
                  <span className="text-white font-bold">{checkoutResult.orderNumber}</span>
                </div>
              )}
              {checkoutResult.paypalOrderId && (
                <div className="flex justify-between">
                  <span className="text-[#8E929C]">PayPal Order ID:</span>
                  <span className="text-[#D7FF70]">{checkoutResult.paypalOrderId}</span>
                </div>
              )}
              {checkoutResult.approvalId && (
                <div className="flex justify-between">
                  <span className="text-[#8E929C]">Pending Approval ID:</span>
                  <span className="text-[#FFB800]">{checkoutResult.approvalId}</span>
                </div>
              )}
              {checkoutResult.findings && checkoutResult.findings.length > 0 && (
                <div className="text-[11px] text-[#FF8585] pt-1 border-t border-white/[0.06]">
                  Threat finding: {checkoutResult.findings.join(', ')}
                </div>
              )}
            </div>

            {/* Post-Capture Receipt Box */}
            {captureReceipt && (
              <div className="p-4 rounded-xl bg-[#D7FF70]/10 border border-[#D7FF70]/30 text-xs space-y-1.5 text-center">
                <Check className="w-5 h-5 text-[#D7FF70] mx-auto" />
                <h4 className="font-bold text-white">Payment Verified &amp; Captured!</h4>
                <p className="text-[#D7FF70] font-mono text-[11px]">
                  PayPal Capture Reference: {captureReceipt.paypalCaptureId}
                </p>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              {checkoutResult.status === 'ALLOW' && !captureReceipt && (
                <>
                  {checkoutResult.approvalUrl && (
                    <a
                      href={checkoutResult.approvalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#22252D] hover:bg-[#2C303A] text-white text-xs font-semibold flex items-center justify-center gap-2 border border-white/[0.1] btn-press touch-manipulation min-h-[44px]"
                    >
                      <ExternalLink className="w-4 h-4 text-[#D7FF70] shrink-0" />
                      <span>Approve in PayPal Sandbox</span>
                    </a>
                  )}
                  {checkoutResult.orderId && (
                    <button
                      type="button"
                      onClick={() => handleCaptureOrder(checkoutResult.orderId!)}
                      disabled={isCapturing}
                      className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#D7FF70] text-[#0E1400] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#cbf45c] btn-press touch-manipulation min-h-[44px]"
                    >
                      {isCapturing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                          <span>Capturing...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 shrink-0" />
                          <span>Verify &amp; Capture Order</span>
                        </>
                      )}
                    </button>
                  )}
                </>
              )}

              {checkoutResult.status === 'HOLD' && (
                <Link
                  href="/approvals"
                  onClick={() => setCheckoutResult(null)}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#FFB800] text-[#0E1400] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#f5b000] btn-press touch-manipulation min-h-[44px]"
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>Open in Reviewer Queue</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => setCheckoutResult(null)}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#1C1E24] text-white text-xs font-medium hover:bg-[#242730] border border-white/[0.08] btn-press touch-manipulation min-h-[44px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
