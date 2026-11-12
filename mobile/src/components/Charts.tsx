import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { BalanceHistoryPoint } from "../utils/balanceHistory";
import { buildActivity, Period } from "../utils/activity";
import { historyForPeriod } from "../utils/balanceHistory";
import { Transaction } from "../types";
import { formatAmount, formatSignedAmount } from "../utils/currency";
import { colors } from "../theme";
import { ui } from "./Screen";
import Choices from "./Choices";
import Button from "./Button";
export const periods: Period[] = ["7D", "30D", "90D", "1Y", "all"];
export function BalanceChart({
  points,
  currency,
  period,
  mini = false,
}: {
  points: BalanceHistoryPoint[];
  currency: string;
  period?: Period;
  mini?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [width, setWidth] = useState(300);
  const data = period
    ? historyForPeriod(
        points,
        period === "all"
          ? 0
          : Date.now() -
              { "7D": 7, "30D": 30, "90D": 90, "1Y": 365 }[period] * 86400000,
      )
    : points;
  const height = mini ? 54 : 170;
  const pad = mini ? 4 : 14;
  if (!data.length)
    return <Text style={ui.muted}>No balance history in this period.</Text>;
  const min = Math.min(0, ...data.map((p) => p.value));
  const max = Math.max(0, ...data.map((p) => p.value));
  const span = max - min || 1;
  const x = (i: number) =>
    pad + (i * (width - pad * 2)) / Math.max(1, data.length - 1);
  const y = (v: number) =>
    height - pad - ((v - min) / span) * (height - pad * 2);
  const line = data
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`)
    .join(" ");
  const index = Math.max(
    0,
    data.findIndex((p) => p.dayKey === selected),
  );
  const point = selected ? data[index] : data[data.length - 1];
  const active = selected ? index : data.length - 1;
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View
        onTouchEnd={(event) => {
          if (!mini) {
            const i = Math.max(
              0,
              Math.min(
                data.length - 1,
                Math.round(
                  ((event.nativeEvent.locationX - pad) / (width - pad * 2)) *
                    (data.length - 1),
                ),
              ),
            );
            setSelected(data[i].dayKey);
          }
        }}
      >
        <Svg width="100%" height={height} accessible={false}>
          <Line
            x1={pad}
            x2={width - pad}
            y1={y(0)}
            y2={y(0)}
            stroke={colors.border}
            strokeDasharray="4 4"
          />
          <Path
            d={`${line} L${x(data.length - 1)},${height - pad} L${pad},${height - pad} Z`}
            fill="#DBEAFE"
          />
          <Path
            d={line}
            fill="none"
            stroke={colors.primary}
            strokeWidth={2.5}
          />
          {!mini && (
            <Circle
              cx={x(active)}
              cy={y(point.value)}
              r={5}
              fill={colors.primary}
            />
          )}
        </Svg>
      </View>
      {!mini && (
        <>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={ui.muted}>{data[0].axisLabel}</Text>
            <Text style={ui.muted}>{data[data.length - 1].axisLabel}</Text>
          </View>
          <Text accessibilityLiveRegion="polite" style={ui.title}>
            {point.tooltipDate} · {formatSignedAmount(point.value, currency)}
          </Text>
          <Text style={ui.muted}>
            Change {formatSignedAmount(point.change, currency)} ·{" "}
            {point.transactionCount} transactions
            {point.isOpeningBalance ? " · Opening balance" : ""}
          </Text>
          <View style={ui.row}>
            <Button
              title="Previous point"
              small
              variant="ghost"
              disabled={active === 0}
              onPress={() => setSelected(data[active - 1].dayKey)}
            />
            <Button
              title="Next point"
              small
              variant="ghost"
              disabled={active === data.length - 1}
              onPress={() => setSelected(data[active + 1].dayKey)}
            />
          </View>
        </>
      )}
    </View>
  );
}
export function ActivityChart({
  transactions,
  currency,
  period,
}: {
  transactions: Transaction[];
  currency: string;
  period: Period;
}) {
  const data = buildActivity(transactions, period);
  const [selected, setSelected] = useState(0);
  const [width, setWidth] = useState(300);
  if (!data.length)
    return <Text style={ui.muted}>No activity in this period.</Text>;
  const max = Math.max(1, ...data.flatMap((p) => [p.received, p.paid]));
  const step = width / data.length;
  const point = data[Math.min(selected, data.length - 1)];
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View
        onTouchEnd={(e) =>
          setSelected(
            Math.max(
              0,
              Math.min(
                data.length - 1,
                Math.floor(e.nativeEvent.locationX / step),
              ),
            ),
          )
        }
      >
        <Svg height={130} width="100%" accessible={false}>
          {data.map((p, i) => (
            <ViewBars
              key={i}
              x={i * step}
              step={step}
              received={(p.received / max) * 120}
              paid={(p.paid / max) * 120}
            />
          ))}
        </Svg>
      </View>
      <Text accessibilityLiveRegion="polite" style={ui.muted}>
        {point.label} · Received {formatAmount(point.received, currency)} · Paid{" "}
        {formatAmount(point.paid, currency)}
      </Text>
      <Choices
        value={String(Math.min(selected, data.length - 1))}
        options={data.map((p, i) => ({ value: String(i), label: p.label }))}
        onChange={(v) => setSelected(Number(v))}
      />
    </View>
  );
}
function ViewBars({
  x,
  step,
  received,
  paid,
}: {
  x: number;
  step: number;
  received: number;
  paid: number;
}) {
  return (
    <>
      <Rect
        x={x + step * 0.15}
        y={125 - received}
        width={step * 0.3}
        height={received}
        fill={colors.success}
      />
      <Rect
        x={x + step * 0.5}
        y={125 - paid}
        width={step * 0.3}
        height={paid}
        fill={colors.danger}
      />
    </>
  );
}
