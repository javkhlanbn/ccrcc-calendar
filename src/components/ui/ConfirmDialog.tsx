import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

// Апп даяар нэг загвартай баталгаажуулах popup.
// Хэрэглээ: const confirmDialog = useConfirm();
//          if (!(await confirmDialog('Устгах уу?'))) return;
type ConfirmOptions = {
  confirmLabel?: string; // Баталгаажуулах товчны бичиг (өгөгдмөл: Устгах)
};

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language } = useAppContext();
  const [pending, setPending] = useState<{ message: string; options?: ConfirmOptions } | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const mn = language === 'MN';

  const confirm = useCallback<ConfirmFn>((message, options) => {
    setPending({ message, options });
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => close(false)}
        >
          <div className="card w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {mn ? 'Баталгаажуулах' : 'Are you sure?'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{pending.message}</p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => close(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {mn ? 'Болих' : 'Cancel'}
              </button>
              <button
                onClick={() => close(true)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20"
              >
                {pending.options?.confirmLabel || (mn ? 'Устгах' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};
