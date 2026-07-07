// Design Ref: §5.2 Module 6 — 통계 대시보드 그래프. 내부(Supabase) 집계 시각화.
// recharts 기반. 데이터는 서버(admin/page.tsx)에서 집계해 props로 주입.
'use client'

import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

export interface DailyPoint {
  label: string   // MM/DD
  count: number
}

const axisStyle = { fontSize: 11, fill: '#71717a' }

function ChartTooltipStyle() {
  return {
    contentStyle: {
      borderRadius: 10,
      border: '1px solid #e4e4e7',
      fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
    },
    labelStyle: { color: '#3f3f46', fontWeight: 600 },
  }
}

export function SignupTrendChart({ data }: { data: DailyPoint[] }) {
  const tip = ChartTooltipStyle()
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} interval="preserveStartEnd" minTickGap={24} axisLine={{ stroke: '#e4e4e7' }} tickLine={false} />
        <YAxis tick={axisStyle} allowDecimals={false} axisLine={false} tickLine={false} width={32} />
        <Tooltip {...tip} formatter={(v) => [`${v}명`, '가입']} />
        <Line type="monotone" dataKey="count" name="가입" stroke="#0070f3" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function SongTrendChart({ data }: { data: DailyPoint[] }) {
  const tip = ChartTooltipStyle()
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
        <XAxis dataKey="label" tick={axisStyle} interval="preserveStartEnd" minTickGap={24} axisLine={{ stroke: '#e4e4e7' }} tickLine={false} />
        <YAxis tick={axisStyle} allowDecimals={false} axisLine={false} tickLine={false} width={32} />
        <Tooltip {...tip} cursor={{ fill: '#f6f1fc' }} formatter={(v) => [`${v}곡`, '생성']} />
        <Bar dataKey="count" name="생성" fill="#7928ca" radius={[3, 3, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}

