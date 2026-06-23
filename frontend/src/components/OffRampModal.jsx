import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const EXCHANGE_RATE = 25450;

const rateHistory = [
  { day: 'T2', rate: 25340 },
  { day: 'T3', rate: 25390 },
  { day: 'T4', rate: 25420 },
  { day: 'T5', rate: 25410 },
  { day: 'T6', rate: 25480 },
  { day: 'T7', rate: 25430 },
  { day: 'CN', rate: EXCHANGE_RATE }
];

const banks = [
  { value: 'VPBank', label: 'VPBank (CAEX Thí điểm)' },
  { value: 'Techcombank', label: 'Techcombank (TCEX Thí điểm)' },
  { value: 'Vietcombank', label: 'Vietcombank' },
  { value: 'MB Bank', label: 'MB Bank' },
  { value: 'ACB', label: 'ACB' }
];

function OffRampModal({ isOpen, order, onClose, onComplete }) {
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
            aria-label="Đóng modal rút tiền"
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
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Rút USDC về ngân hàng</h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="Đóng"
              >
                x
              </button>
            </div>

            {step === 'form' && (
              <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-500">Số dư khả dụng</p>
                    <p className="mt-1 text-3xl font-semibold text-slate-950">{amount.toFixed(2)} USDC</p>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Tỷ giá giả định</span>
                        <span className="font-semibold text-slate-950">
                          {EXCHANGE_RATE.toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Thực nhận</span>
                        <span className="font-semibold text-teal-700">
                          {receivedVnd.toLocaleString('vi-VN')} VND
                        </span>
                      </div>
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">Ngân hàng</span>
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
                    <span className="text-sm font-semibold text-slate-700">Số tài khoản</span>
                    <input
                      value={bankAccount}
                      onChange={(event) => setBankAccount(event.target.value)}
                      className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                      placeholder="Nhập số tài khoản"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!bankAccount.trim()}
                    className="h-11 w-full rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Xác nhận rút tiền
                  </button>
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">USDC/VND</p>
                      <p className="text-xs text-slate-500">Diễn biến tỷ giá 7 ngày</p>
                    </div>
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                      +0.4%
                    </span>
                  </div>

                  <div className="mt-4 h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={rateHistory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="rateGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="5%" stopColor="#0d9488" stopOpacity={0.24} />
                            <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                        <YAxis
                          domain={['dataMin - 80', 'dataMax + 80']}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#64748b', fontSize: 12 }}
                          width={52}
                        />
                        <Tooltip
                          formatter={(value) => [`${Number(value).toLocaleString('vi-VN')} VND`, 'Tỷ giá']}
                          contentStyle={{
                            borderRadius: 8,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 10px 25px rgba(15, 23, 42, 0.1)'
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="rate"
                          stroke="#0d9488"
                          strokeWidth={2}
                          fill="url(#rateGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {step === 'processing' && (
              <div className="py-16 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" />
                <h3 className="mt-5 text-lg font-semibold text-slate-950">Đang xử lý lệnh rút</h3>
                <p className="mt-2 text-sm text-slate-500">ShopTalk đang gửi yêu cầu sang đối tác off-ramp.</p>
              </div>
            )}

            {step === 'success' && (
              <div className="py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-2xl font-semibold text-teal-700">
                  ✓
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">Rút tiền thành công</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  {amount.toFixed(2)} USDC đã được quy đổi thành{' '}
                  <span className="font-semibold text-slate-900">{receivedVnd.toLocaleString('vi-VN')} VND</span>{' '}
                  và chuyển về tài khoản {bankAccount} tại {bankName}.
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-6 h-11 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Đóng
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
