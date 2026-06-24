import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import OffRampChart from './OffRampChart';
import mockExchangeRates from '../mocks/mockExchangeRates';

const EXCHANGE_RATE = 25450;

const banks = [
  { value: 'VPBank', label: 'VPBank (CAEX Thi diem)' },
  { value: 'Techcombank', label: 'Techcombank (TCEX Thi diem)' },
  { value: 'Vietcombank', label: 'Vietcombank' },
  { value: 'MB Bank', label: 'MB Bank' },
  { value: 'ACB', label: 'ACB' }
];

function OffRampModal({
  isOpen,
  order,
  exchangeRates = mockExchangeRates,
  onClose,
  onComplete
}) {
  const [bankName, setBankName] = useState('VPBank');
  const [bankAccount, setBankAccount] = useState('1234567890');
  const [step, setStep] = useState('form');

  const amount = Number(order?.amount || 0);
  const receivedVnd = useMemo(() => amount * EXCHANGE_RATE, [amount]);

  const handleSubmit = () => {
    setStep('processing');
    window.setTimeout(() => {
      setStep('success');
      onComplete?.(order);
    }, 1200);
  };

  const handleClose = () => {
    setStep('form');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Dong modal rut tien"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          <motion.section
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
                  Off-ramp
                </p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Rut USDC ve ngan hang</h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="Dong"
              >
                x
              </button>
            </div>

            {step === 'form' && (
              <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-500">So du kha dung</p>
                    <p className="mt-1 text-3xl font-semibold text-slate-950">{amount.toFixed(2)} USDC</p>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Ty gia gia dinh</span>
                        <span className="font-semibold text-slate-950">
                          {EXCHANGE_RATE.toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Thuc nhan</span>
                        <span className="font-semibold text-teal-700">
                          {receivedVnd.toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Ngan hang</span>
                    <select
                      value={bankName}
                      onChange={(event) => setBankName(event.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                    >
                      {banks.map((bank) => (
                        <option key={bank.value} value={bank.value}>{bank.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">So tai khoan</span>
                    <input
                      value={bankAccount}
                      onChange={(event) => setBankAccount(event.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                      placeholder="Nhap so tai khoan"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!bankAccount.trim()}
                    className="h-11 w-full rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Xac nhan rut tien
                  </button>
                </div>

                <OffRampChart data={exchangeRates} />
              </div>
            )}

            {step === 'processing' && (
              <div className="py-16 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
                <h3 className="mt-5 text-lg font-semibold text-slate-950">Dang xu ly lenh rut</h3>
                <p className="mt-2 text-sm text-slate-500">ShopTalk dang gui yeu cau sang doi tac off-ramp.</p>
              </div>
            )}

            {step === 'success' && (
              <div className="py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-2xl font-semibold text-teal-700">
                  OK
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">Rut tien thanh cong</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  {amount.toFixed(2)} USDC da duoc quy doi thanh{' '}
                  <span className="font-semibold text-slate-900">{receivedVnd.toLocaleString('vi-VN')} VND</span>{' '}
                  va chuyen ve tai khoan {bankAccount} tai {bankName}.
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-6 h-11 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Dong
                </button>
              </div>
            )}
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}

export default OffRampModal;
