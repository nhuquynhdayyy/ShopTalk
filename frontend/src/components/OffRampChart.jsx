import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

function OffRampChart({ data = [], title = 'USDC/VND', subtitle = 'Dien bien ty gia 7 ngay' }) {
  const trend = useMemo(() => {
    if (data.length < 2) return 0;
    const first = Number(data[0].rate || 0);
    const last = Number(data[data.length - 1].rate || 0);
    return first ? ((last - first) / first) * 100 : 0;
  }, [data]);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
          trend >= 0 ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'
        }`}
        >
          {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
        </span>
      </div>

      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              formatter={(value) => [`${Number(value).toLocaleString('vi-VN')} VND`, 'Ty gia']}
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
  );
}

export default OffRampChart;
