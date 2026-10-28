'use client';

import React, { useEffect } from 'react';
import { X, AlertTriangle, ShieldCheck, Check } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'success' | 'lime';
  isLoading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm Action',
  cancelText = 'Cancel',
  type = 'lime',
  isLoading = false,
  children,
}: ConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-md bg-[#1C1E24] border border-white/[0.1] rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-150 focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-[#121316] text-[#8E929C] hover:text-white flex items-center justify-center transition-colors btn-press touch-manipulation"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-3.5 mb-4 pr-6">
          <div
            className={`w-10 h-10 rounded-2xl flex-shrink-0 flex items-center justify-center ${
              type === 'danger'
                ? 'bg-[#FF6B6B]/15 text-[#FF6B6B]'
                : type === 'warning'
                ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
                : 'bg-[#D7FF70]/15 text-[#D7FF70]'
            }`}
          >
            {type === 'danger' && <AlertTriangle className="w-5 h-5" />}
            {type === 'warning' && <AlertTriangle className="w-5 h-5" />}
            {(type === 'success' || type === 'lime') && <ShieldCheck className="w-5 h-5" />}
          </div>

          <div>
            <h3 id="modal-title" className="text-base font-bold text-white tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-[#8E929C] mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Custom Body / Form Inputs */}
        {children && <div className="my-4">{children}</div>}

        {/* Actions Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 mt-6 pt-4 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto px-5 py-3 rounded-full bg-[#121316] border border-white/[0.08] hover:bg-[#22252C] text-xs font-semibold text-[#8E929C] hover:text-white transition-colors btn-press touch-manipulation min-h-[44px] flex items-center justify-center"
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`w-full sm:w-auto px-6 py-3 rounded-full text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 btn-press touch-manipulation min-h-[44px] ${
              type === 'danger'
                ? 'bg-[#FF6B6B] hover:bg-[#FF5252] text-white shadow-[#FF6B6B]/20'
                : 'bg-[#D7FF70] hover:bg-[#C4F250] text-[#0E1400] shadow-[#D7FF70]/20'
            } disabled:opacity-50`}
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
            ) : (
              <Check className="w-4 h-4 shrink-0" />
            )}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
