'use client';

import React, { useState, useEffect } from 'react';
import {
  Plug,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Play,
  Database,
  Cpu,
  CreditCard,
  Bot,
  Clock,
  ShieldCheck,
  Sliders,
  Save,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';
import { AuthGuard } from '../../components/AuthGuard';
import { fetchIntegrations, testIntegration, configureIntegration } from '../../lib/api';
import { IntegrationStatusItem } from '../../types';

export default function IntegrationsPage() {
  return (
    <AuthGuard>
      <IntegrationsContent />
    </AuthGuard>
  );
}

function IntegrationsContent() {
  const [integrations, setIntegrations] = useState<IntegrationStatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; message: string; isError?: boolean } | null>(null);

  // Edit / Custom testing state per integration
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({
    paypal: {
      clientId: '',
      clientSecret: '',
      environment: 'sandbox',
      apiBaseUrl: 'https://api-m.sandbox.paypal.com',
    },
    openrouter: {
      apiKey: '',
      model: 'anthropic/claude-3.5-sonnet',
      baseUrl: 'https://openrouter.ai/api/v1',
    },
    postgres: {
      connectionUrl: '',
    },
    gateway: {
      logLevel: 'info',
    },
  });

  const loadData = async () => {
    try {
      setRefreshing(true);
      const res = await fetchIntegrations();
      setIntegrations(res.integrations);
    } catch (err: any) {
      console.error('Failed to load integrations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleTestIntegration = async (id: string, customPayload?: Record<string, unknown>) => {
    try {
      setTestingId(id);
      setActionFeedback(null);
      const res = await testIntegration(id, customPayload);

      // Update in local state
      setIntegrations((prev) =>
        prev.map((item) => (item.id === id ? res.integration : item))
      );

      setActionFeedback({
        id,
        message: `Test complete: ${res.integration.status.toUpperCase()} (${res.integration.latencyMs ?? 0}ms)${customPayload ? ' [Tested Custom Parameters]' : ''}`,
        isError: res.integration.status === 'disconnected' || res.integration.status === 'degraded',
      });
    } catch (err: any) {
      setActionFeedback({
        id,
        message: err.message || 'Connection test failed.',
        isError: true,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleSaveIntegration = async (id: string) => {
    try {
      setSavingId(id);
      setActionFeedback(null);
      const payload = formData[id] || {};
      const res = await configureIntegration(id, payload);

      setIntegrations((prev) =>
        prev.map((item) => (item.id === id ? res.integration : item))
      );

      setActionFeedback({
        id,
        message: `Configuration saved and verified: ${res.integration.status.toUpperCase()} (${res.integration.latencyMs ?? 0}ms)`,
        isError: res.integration.status === 'disconnected' || res.integration.status === 'degraded',
      });
      setEditingId(null);
    } catch (err: any) {
      setActionFeedback({
        id,
        message: err.message || 'Failed to save configuration.',
        isError: true,
      });
    } finally {
      setSavingId(null);
    }
  };

  const toggleShowSecret = (fieldKey: string) => {
    setShowSecrets((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const updateFormField = (integrationId: string, field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [integrationId]: {
        ...(prev[integrationId] || {}),
        [field]: value,
      },
    }));
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'core':
        return <Cpu className="w-5 h-5 text-[#D7FF70]" />;
      case 'database':
        return <Database className="w-5 h-5 text-[#8C7CFF]" />;
      case 'payment':
        return <CreditCard className="w-5 h-5 text-[#38BDF8]" />;
      case 'ai':
        return <Bot className="w-5 h-5 text-[#F472B6]" />;
      default:
        return <Plug className="w-5 h-5 text-[#D7FF70]" />;
    }
  };

  const getStatusBadge = (status: string, isConfigured: boolean) => {
    if (!isConfigured || status === 'not_configured') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/[0.06] text-[#8E929C] border border-white/[0.08]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#8E929C]" />
          <span>Not Configured</span>
        </span>
      );
    }

    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Connected</span>
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Degraded</span>
          </span>
        );
      case 'disconnected':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>Disconnected</span>
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#171717] text-[#F4F4F5] font-sans">
      <Navigation />

      <main className="max-w-[1400px] mx-auto px-4 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#D7FF70]/15 flex items-center justify-center text-[#D7FF70]">
                <Plug className="w-4 h-4" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Integration & Health Monitoring
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#8E929C]">
              Real-time connectivity verification, credential modification, live handshake testing, and diagnostics.
            </p>
          </div>

          <button
            onClick={loadData}
            disabled={refreshing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#222222] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-white/90 hover:text-white transition-colors btn-press min-h-[42px] self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#D7FF70]' : ''}`} />
            <span>Refresh Status</span>
          </button>
        </div>

        {/* Security & Health Notice Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#222222] border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#D7FF70]/15 text-[#D7FF70] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Live Verification & Customizable Credentials
              </div>
              <p className="text-[11px] text-[#8E929C] mt-0.5">
                Test active endpoints or enter custom credentials below to verify API handshakes before applying them to production.
              </p>
            </div>
          </div>
        </div>

        {/* Integrations Grid */}
        {loading ? (
          <div className="p-16 text-center text-sm text-[#8E929C] flex items-center justify-center gap-3 bg-[#222222] rounded-3xl border border-white/[0.08]">
            <div className="w-5 h-5 border-2 border-[#D7FF70] border-t-transparent rounded-full animate-spin" />
            <span>Probing integration connections...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {integrations.map((item) => {
              const isTesting = testingId === item.id;
              const isSaving = savingId === item.id;
              const isEditing = editingId === item.id;
              const feedback = actionFeedback?.id === item.id ? actionFeedback : null;
              const form = formData[item.id] || {};

              return (
                <div
                  key={item.id}
                  className="bg-[#222222] border border-white/[0.08] rounded-3xl p-6 sm:p-7 flex flex-col justify-between space-y-5 shadow-xl hover:border-white/20 transition-all h-full min-w-0"
                >
                  <div className="space-y-4">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                          {getCategoryIcon(item.category)}
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-white tracking-tight">
                            {item.name}
                          </h2>
                          <div className="text-[11px] text-[#8E929C] capitalize flex items-center gap-1.5 mt-0.5">
                            <span>{item.category} component</span>
                            {item.latencyMs !== undefined && (
                              <>
                                <span>&bull;</span>
                                <span className="font-mono">{item.latencyMs}ms</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {getStatusBadge(item.status, item.isConfigured)}
                    </div>

                    {/* Setup / Context Guide */}
                    <p className="text-xs text-[#8E929C] leading-relaxed">
                      {item.setupGuide}
                    </p>

                    {/* Error display if any */}
                    {item.errorMessage && (
                      <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{item.errorMessage}</span>
                      </div>
                    )}

                    {/* Diagnostic Key-Value Attributes */}
                    <div className="p-3.5 rounded-2xl bg-[#171717] border border-white/[0.06] space-y-2 text-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#8E929C]">
                        Configuration & Attributes
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        {Object.entries(item.details).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white/[0.02]">
                            <span className="text-[#8E929C] capitalize">{k.replace(/([A-Z])/g, ' $1')}:</span>
                            <span className="font-mono text-white/90 font-medium truncate max-w-[140px]">
                              {String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Customizable Configuration Panel */}
                    {isEditing && (
                      <div className="p-4 rounded-2xl bg-[#171717] border border-[#D7FF70]/30 space-y-3 text-xs animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#D7FF70] text-xs flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5" />
                            <span>Edit & Test Custom Parameters</span>
                          </span>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-[#8E929C] hover:text-white p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {item.id === 'paypal' && (
                          <div className="space-y-2.5">
                            <div>
                              <label className="text-[11px] text-[#8E929C] block mb-1">PayPal Client ID</label>
                              <input
                                type="text"
                                placeholder="Enter PayPal Client ID"
                                value={form.clientId || ''}
                                onChange={(e) => updateFormField('paypal', 'clientId', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-[#222222] border border-white/[0.08] text-white text-xs placeholder-[#8E929C] focus:outline-none focus:border-[#D7FF70]"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-[#8E929C] block mb-1">PayPal Client Secret</label>
                              <div className="relative">
                                <input
                                  type={showSecrets['paypal'] ? 'text' : 'password'}
                                  placeholder="Enter PayPal Client Secret"
                                  value={form.clientSecret || ''}
                                  onChange={(e) => updateFormField('paypal', 'clientSecret', e.target.value)}
                                  className="w-full pl-3 pr-9 py-2 rounded-xl bg-[#222222] border border-white/[0.08] text-white text-xs placeholder-[#8E929C] focus:outline-none focus:border-[#D7FF70]"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleShowSecret('paypal')}
                                  className="absolute right-2.5 top-2.5 text-[#8E929C] hover:text-white"
                                >
                                  {showSecrets['paypal'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] text-[#8E929C] block mb-1">Environment</label>
                                <select
                                  value={form.environment || 'sandbox'}
                                  onChange={(e) => updateFormField('paypal', 'environment', e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-xl bg-[#222222] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                                >
                                  <option value="sandbox">Sandbox</option>
                                  <option value="live">Live</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[11px] text-[#8E929C] block mb-1">API Base URL</label>
                                <input
                                  type="text"
                                  placeholder="https://api-m.sandbox.paypal.com"
                                  value={form.apiBaseUrl || 'https://api-m.sandbox.paypal.com'}
                                  onChange={(e) => updateFormField('paypal', 'apiBaseUrl', e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-xl bg-[#222222] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {item.id === 'openrouter' && (
                          <div className="space-y-2.5">
                            <div>
                              <label className="text-[11px] text-[#8E929C] block mb-1">OpenRouter API Key</label>
                              <div className="relative">
                                <input
                                  type={showSecrets['openrouter'] ? 'text' : 'password'}
                                  placeholder="sk-or-v1-..."
                                  value={form.apiKey || ''}
                                  onChange={(e) => updateFormField('openrouter', 'apiKey', e.target.value)}
                                  className="w-full pl-3 pr-9 py-2 rounded-xl bg-[#222222] border border-white/[0.08] text-white text-xs placeholder-[#8E929C] focus:outline-none focus:border-[#D7FF70]"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleShowSecret('openrouter')}
                                  className="absolute right-2.5 top-2.5 text-[#8E929C] hover:text-white"
                                >
                                  {showSecrets['openrouter'] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] text-[#8E929C] block mb-1">Model</label>
                                <input
                                  type="text"
                                  placeholder="anthropic/claude-3.5-sonnet"
                                  value={form.model || 'anthropic/claude-3.5-sonnet'}
                                  onChange={(e) => updateFormField('openrouter', 'model', e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-xl bg-[#222222] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-[#8E929C] block mb-1">Base URL</label>
                                <input
                                  type="text"
                                  placeholder="https://openrouter.ai/api/v1"
                                  value={form.baseUrl || 'https://openrouter.ai/api/v1'}
                                  onChange={(e) => updateFormField('openrouter', 'baseUrl', e.target.value)}
                                  className="w-full px-2.5 py-2 rounded-xl bg-[#222222] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {item.id === 'postgres' && (
                          <div className="space-y-2.5">
                            <div>
                              <label className="text-[11px] text-[#8E929C] block mb-1">Database Connection String</label>
                              <input
                                type="text"
                                placeholder="postgresql://user:pass@host:5432/dbname"
                                value={form.connectionUrl || ''}
                                onChange={(e) => updateFormField('postgres', 'connectionUrl', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-[#222222] border border-white/[0.08] text-white text-xs placeholder-[#8E929C] focus:outline-none focus:border-[#D7FF70]"
                              />
                            </div>
                          </div>
                        )}

                        {item.id === 'gateway' && (
                          <div className="space-y-2.5">
                            <div>
                              <label className="text-[11px] text-[#8E929C] block mb-1">Log Level</label>
                              <select
                                value={form.logLevel || 'info'}
                                onChange={(e) => updateFormField('gateway', 'logLevel', e.target.value)}
                                className="w-full px-2.5 py-2 rounded-xl bg-[#222222] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-[#D7FF70]"
                              >
                                <option value="info">Info</option>
                                <option value="debug">Debug</option>
                                <option value="warn">Warn</option>
                                <option value="error">Error</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Config Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
                          <button
                            type="button"
                            onClick={() => handleTestIntegration(item.id, form)}
                            disabled={isTesting}
                            className="px-3 py-1.5 rounded-full bg-[#222222] hover:bg-[#2c2c2c] border border-white/[0.1] hover:border-[#D7FF70]/50 text-white text-[11px] font-semibold flex items-center gap-1.5 btn-press disabled:opacity-50 min-h-[34px]"
                          >
                            <Play className="w-3 h-3 text-[#D7FF70]" />
                            <span>{isTesting ? 'Testing...' : 'Test Entered Credentials'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSaveIntegration(item.id)}
                            disabled={isSaving}
                            className="px-3.5 py-1.5 rounded-full bg-[#D7FF70] text-[#0E1400] text-[11px] font-bold hover:bg-[#c4f250] flex items-center gap-1.5 btn-press disabled:opacity-50 min-h-[34px]"
                          >
                            <Save className="w-3 h-3" />
                            <span>{isSaving ? 'Saving...' : 'Save & Apply'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Live Test Feedback Banner */}
                    {feedback && (
                      <div
                        className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                          feedback.isError
                            ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                            : 'bg-[#D7FF70]/10 border border-[#D7FF70]/20 text-[#D7FF70]'
                        }`}
                      >
                        {feedback.isError ? (
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                        )}
                        <span>{feedback.message}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div className="mt-auto pt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06]">
                    <div className="text-[10px] text-[#8E929C] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Last checked: {new Date(item.lastCheckedAt).toLocaleTimeString()}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingId(isEditing ? null : item.id)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all flex items-center gap-1.5 btn-press min-h-[36px] ${
                          isEditing
                            ? 'bg-[#D7FF70]/15 text-[#D7FF70] border-[#D7FF70]/40'
                            : 'bg-[#171717] hover:bg-[#282828] border-white/[0.08] hover:border-white/20 text-[#8E929C] hover:text-white'
                        }`}
                      >
                        <Sliders className="w-3.5 h-3.5 text-[#D7FF70]" />
                        <span>{isEditing ? 'Close' : 'Configure & Test'}</span>
                      </button>

                      <button
                        onClick={() => handleTestIntegration(item.id)}
                        disabled={isTesting}
                        className="px-3.5 py-1.5 rounded-full bg-[#171717] hover:bg-[#282828] border border-white/[0.08] hover:border-[#D7FF70]/40 text-xs font-semibold text-white transition-all flex items-center gap-1.5 btn-press disabled:opacity-50 min-h-[36px]"
                      >
                        {isTesting ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-[#D7FF70] border-t-transparent rounded-full animate-spin" />
                            <span>Pinging...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 text-[#D7FF70]" />
                            <span>Test Connection</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
