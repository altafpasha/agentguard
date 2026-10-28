'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  ShieldCheck,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  User,
  ShieldAlert,
  ArrowRight,
  Info,
  Key,
} from 'lucide-react';
import { Navigation } from '../../components/Navigation';
import { ConfirmModal } from '../../components/ConfirmModal';
import { AuthGuard, useAuth } from '../../components/AuthGuard';
import {
  fetchPendingApprovals,
  approvePendingAction,
  rejectPendingAction,
  fetchCurrentReviewer,
  ensureReviewerSession,
} from '../../lib/api';
import { PendingApprovalRecord, ReviewerProfile } from '../../types';

export default function ApprovalsPage() {
  return (
    <AuthGuard>
      <ApprovalsContent />
    </AuthGuard>
  );
}

function ApprovalsContent() {
  const { isEditorOrAbove } = useAuth();
  const [approvals, setApprovals] = useState<PendingApprovalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewer, setReviewer] = useState<ReviewerProfile | null>(null);

  // Modal States
  const [selectedForApprove, setSelectedForApprove] = useState<PendingApprovalRecord | null>(null);
  const [selectedForReject, setSelectedForReject] = useState<PendingApprovalRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Transaction exceeds normal operational parameters');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadApprovals = async () => {
    try {
      const res = await fetchPendingApprovals();
      setApprovals(res.pendingApprovals || []);
    } catch {
      // In case of error or empty queue, show honest empty state
      setApprovals([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    ensureReviewerSession()
      .then(() => {
        loadApprovals();
        fetchCurrentReviewer()
          .then((r) => {
            if (r) setReviewer(r);
          })
          .catch(() => {});
      })
      .catch(() => {
        loadApprovals();
      });
  }, []);

  const handleApproveConfirm = async () => {
    if (!selectedForApprove) return;
    setIsSubmitting(true);
    try {
      await ensureReviewerSession();
      const res = await approvePendingAction(selectedForApprove.id);
      setNotification({
        message: `Action ${selectedForApprove.requestId} approved successfully! Short-lived token generated.`,
        type: 'success',
      });
      setSelectedForApprove(null);
      await loadApprovals();
    } catch (err) {
      setNotification({
        message: (err as Error).message || 'Failed to approve action',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!selectedForReject) return;
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }
    setIsSubmitting(true);
    try {
      await rejectPendingAction(selectedForReject.id, rejectionReason.trim());
      setNotification({
        message: `Action ${selectedForReject.requestId} rejected by reviewer.`,
        type: 'success',
      });
      setSelectedForReject(null);
      await loadApprovals();
    } catch (err) {
      setNotification({
        message: (err as Error).message || 'Failed to reject action',
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#171717] text-[#F4F4F5] font-sans">
      <Navigation />

      <main className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Human Approval Queue (HITL)
              </h1>
              <span className="px-3 py-1 rounded-full bg-[#D7FF70] text-[#0E1400] text-xs font-bold shadow-sm">
                {approvals.length} Pending Review
              </span>
            </div>
            <p className="text-xs text-[#8E929C] mt-1">
              Transactions requiring supervisory authorization under deterministic policy thresholds
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Reviewer Profile Badge */}
            {reviewer && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1C1E24] border border-white/[0.08] text-xs">
                <span className="w-2 h-2 rounded-full bg-[#D7FF70]" />
                <span className="text-white font-semibold">{reviewer.name}</span>
                <span className="text-[#8E929C] hidden sm:inline">({reviewer.role})</span>
              </div>
            )}

            <button
              onClick={loadApprovals}
              className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-[#1C1E24] border border-white/[0.08] hover:border-white/20 text-[#8E929C] hover:text-white transition-colors flex items-center justify-center btn-press touch-manipulation"
              aria-label="Refresh Queue"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notification Toast */}
        {notification && (
          <div
            className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-[#D7FF70]/15 text-[#D7FF70] border border-[#D7FF70]/30'
                : 'bg-[#FF6B6B]/15 text-[#FF6B6B] border border-[#FF6B6B]/30'
            }`}
          >
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="p-1 hover:opacity-75"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Read-Only Viewer Notice */}
        {!isEditorOrAbove && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-xs text-amber-300">
            <Info className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              <strong>Read-Only Mode:</strong> Your account is configured with Viewer privileges. Approving or rejecting transactions requires an Editor or Administrator role.
            </span>
          </div>
        )}

        {/* Approvals List */}
        {approvals.length === 0 ? (
          <div className="p-16 rounded-[24px] bg-[#1C1E24] border border-white/[0.07] text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#D7FF70]/15 text-[#D7FF70] mx-auto flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Approval Queue is Clear</h3>
            <p className="text-xs text-[#8E929C] max-w-sm mx-auto">
              All transactions have been reviewed or processed within deterministic policy guidelines.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {approvals.map((appr) => {
              return (
                <div
                  key={appr.id}
                  className="p-4 sm:p-6 rounded-[22px] bg-[#1C1E24] border border-white/[0.08] hover:border-[#D7FF70]/40 transition-all flex flex-col justify-between space-y-4 shadow-[0_4px_24px_rgba(0,0,0,0.35)]"
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold font-mono text-white">
                          {appr.amountFormatted}
                        </span>
                        <span className="text-xs text-[#8E929C] uppercase font-mono">
                          {appr.currency}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-white mt-1">
                        {appr.merchant}
                      </h3>
                      <p className="text-xs text-[#8E929C] mt-0.5">
                        {appr.description}
                      </p>
                    </div>

                    {/* Expiry Pill */}
                    <div className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F59E0B]/15 text-[#F59E0B] text-[11px] font-semibold border border-[#F59E0B]/30">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Pending Review</span>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div className="p-3.5 rounded-2xl bg-[#121316] border border-white/[0.04] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#8E929C]">Requesting Agent:</span>
                      <span className="font-mono text-[#D7FF70] font-semibold">{appr.agentId}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#8E929C]">Operation:</span>
                      <span className="font-mono text-white">{appr.tool} &bull; {appr.operation}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#8E929C]">Request ID:</span>
                      <span className="font-mono text-white/70 text-[10px]">{appr.requestId}</span>
                    </div>
                  </div>

                  {/* Policy / Risk Reason */}
                  <div className="p-3.5 rounded-2xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 space-y-1">
                    <span className="text-[10px] text-[#F59E0B] font-bold uppercase tracking-wider block">
                      Trigger Reason
                    </span>
                    <p className="text-xs text-white/90">
                      {appr.riskReasons && appr.riskReasons.length > 0
                        ? appr.riskReasons.join('; ')
                        : 'Single transaction exceeds $25.00 human approval threshold'}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
                    <button
                      onClick={() => setSelectedForReject(appr)}
                      disabled={!isEditorOrAbove}
                      title={!isEditorOrAbove ? 'Requires Editor or Administrator privileges' : undefined}
                      id={`reject-btn-${appr.id}`}
                      className="w-full sm:w-auto px-5 py-3 rounded-full bg-[#121316] border border-white/[0.08] hover:border-[#FF6B6B]/50 hover:bg-[#FF6B6B]/10 text-xs font-semibold text-[#FF6B6B] transition-all flex items-center justify-center gap-1.5 btn-press touch-manipulation min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4 shrink-0" />
                      <span>Reject</span>
                    </button>

                    <button
                      onClick={() => setSelectedForApprove(appr)}
                      disabled={!isEditorOrAbove}
                      title={!isEditorOrAbove ? 'Requires Editor or Administrator privileges' : undefined}
                      id={`approve-btn-${appr.id}`}
                      className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#D7FF70] hover:bg-[#C4F250] text-xs font-bold text-[#0E1400] transition-all shadow-[0_2px_12px_rgba(215,255,112,0.25)] flex items-center justify-center gap-1.5 btn-press touch-manipulation min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Check className="w-4 h-4 shrink-0" />
                      <span>Approve Action</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Confirmation Modal for APPROVE */}
      <ConfirmModal
        isOpen={Boolean(selectedForApprove)}
        onClose={() => setSelectedForApprove(null)}
        onConfirm={handleApproveConfirm}
        title="Approve Transaction Authorization"
        description={`You are authorizing ${selectedForApprove?.merchant} for ${selectedForApprove?.amountFormatted}. A single-use server authorization token valid for 5 minutes will be issued.`}
        confirmText="Confirm Authorization"
        cancelText="Cancel"
        type="lime"
        isLoading={isSubmitting}
      >
        <div className="p-3.5 rounded-2xl bg-[#121316] border border-white/[0.06] text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[#8E929C]">Authorizing Reviewer:</span>
            <span className="font-bold text-white">{reviewer?.name || 'Authorized Operator'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#8E929C]">Reviewer Role:</span>
            <span className="text-[#D7FF70] font-semibold">{reviewer?.role || 'Reviewer'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#8E929C]">Token Lifetime:</span>
            <span className="text-white font-mono">300 seconds (Single-Use)</span>
          </div>
        </div>
      </ConfirmModal>

      {/* Confirmation Modal for REJECT */}
      <ConfirmModal
        isOpen={Boolean(selectedForReject)}
        onClose={() => setSelectedForReject(null)}
        onConfirm={handleRejectConfirm}
        title="Reject Transaction Authorization"
        description={`Are you sure you want to reject transaction ${selectedForReject?.requestId}? The requesting agent will receive a 403 Forbidden decision.`}
        confirmText="Confirm Rejection"
        cancelText="Cancel"
        type="danger"
        isLoading={isSubmitting}
      >
        <div className="space-y-2">
          <label className="text-xs font-semibold text-white block">
            Rejection Reason (Required)
          </label>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
            className="w-full p-3 rounded-2xl bg-[#121316] border border-white/[0.08] focus:border-[#FF6B6B] text-xs text-white focus:outline-none"
            placeholder="Specify reason for policy rejection..."
          />
        </div>
      </ConfirmModal>
    </div>
  );
}
