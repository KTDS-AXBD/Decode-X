import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, ComposedChart, ReferenceLine } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';

const mockData = [
  { date: '1/27', aiAccuracy: 0.68, hitlAccuracy: 0.82 },
  { date: '1/28', aiAccuracy: 0.71, hitlAccuracy: 0.84 },
  { date: '1/29', aiAccuracy: 0.69, hitlAccuracy: 0.83 },
  { date: '1/30', aiAccuracy: 0.73, hitlAccuracy: 0.86 },
  { date: '1/31', aiAccuracy: 0.70, hitlAccuracy: 0.85 },
  { date: '2/1', aiAccuracy: 0.74, hitlAccuracy: 0.87 },
  { date: '2/2', aiAccuracy: 0.72, hitlAccuracy: 0.86 },
  { date: '2/3', aiAccuracy: 0.75, hitlAccuracy: 0.88 },
  { date: '2/4', aiAccuracy: 0.76, hitlAccuracy: 0.89 },
  { date: '2/5', aiAccuracy: 0.74, hitlAccuracy: 0.87 },
  { date: '2/6', aiAccuracy: 0.77, hitlAccuracy: 0.90 },
  { date: '2/7', aiAccuracy: 0.75, hitlAccuracy: 0.88 },
  { date: '2/8', aiAccuracy: 0.78, hitlAccuracy: 0.91 },
  { date: '2/9', aiAccuracy: 0.76, hitlAccuracy: 0.89 },
  { date: '2/10', aiAccuracy: 0.79, hitlAccuracy: 0.92 },
];

export const PolicyQualityChart: React.FC = () => {
  // Calculate average HITL contribution
  const avgContribution = mockData.reduce((sum, d) => sum + (d.hitlAccuracy - d.aiAccuracy), 0) / mockData.length;

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">정책 품질 트렌드 Policy Quality Trend (30일)</CardTitle>
          <Badge
            className="flex items-center gap-1"
            style={{
              backgroundColor: 'var(--success-light)',
              color: 'var(--success)',
              border: 'none',
            }}
          >
            <TrendingUp className="w-3 h-3" />
            HITL 기여도: 평균 +{(avgContribution * 100).toFixed(1)}%p 향상
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ComposedChart
          width={800}
          height={300}
          data={mockData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="hitlGap" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--success)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            stroke="var(--border)"
          />
          <YAxis
            domain={[0.6, 1.0]}
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            stroke="var(--border)"
            tickFormatter={(value) => value.toFixed(2)}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
            formatter={(value: number) => value.toFixed(3)}
          />
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
          />
          {/* Reference line for target */}
          <ReferenceLine
            y={0.85}
            stroke="var(--accent)"
            strokeDasharray="5 5"
            strokeWidth={2}
            label={{
              value: '목표 기준 0.85',
              position: 'right',
              fill: 'var(--accent)',
              fontSize: 12,
            }}
          />
          {/* Shaded area showing HITL contribution */}
          <Area
            type="monotone"
            dataKey="hitlAccuracy"
            fill="url(#hitlGap)"
            stroke="none"
          />
          {/* AI Accuracy line */}
          <Line
            type="monotone"
            dataKey="aiAccuracy"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ r: 3, fill: '#3B82F6' }}
            name="AI 초기 추출 정확도"
          />
          {/* HITL Accuracy line */}
          <Line
            type="monotone"
            dataKey="hitlAccuracy"
            stroke="var(--success)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--success)' }}
            name="HITL 검증 후 정확도"
          />
        </ComposedChart>
      </CardContent>
    </Card>
  );
};
