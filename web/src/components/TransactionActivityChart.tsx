"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { PairTransaction } from "@/hooks/useAllTransactions";
import { getCurrencySymbol } from "@/utils/currency";
import { buildActivity } from "@/utils/activity";

type Period = "7D" | "30D" | "90D" | "1Y" | "all";

interface TransactionActivityChartProps {
  transactions: PairTransaction[];
  currency: string;
  period: Period;
}

export default function TransactionActivityChart({
  transactions,
  currency,
  period,
}: TransactionActivityChartProps) {
  const symbol = getCurrencySymbol(currency);
  const cutoff = period === "all" ? 0 : new Date().toDateString();

  const chartData = useMemo(
    () => buildActivity(transactions, period),
    [transactions, cutoff, period],
  );

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[140px] text-sm text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
        No activity in this period
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart
        data={chartData}
        margin={{ top: 4, right: 4, left: -12, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#f0f0f0"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${symbol}${v}`}
          width={45}
        />
        <Tooltip
          formatter={(value, name) => [
            `${symbol}${(value as number).toFixed(2)}`,
            name === "received" ? "Received" : "Paid",
          ]}
          labelStyle={{ fontSize: 11, color: "#6b7280" }}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        />
        <Legend
          iconSize={8}
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          formatter={(value) => (value === "received" ? "Received" : "Paid")}
        />
        <Bar dataKey="received" fill="#16a34a" radius={[3, 3, 0, 0]} />
        <Bar dataKey="paid" fill="#ef4444" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
