"use client";

import { useState } from "react";
import { Transaction } from "@/types";
import { transactionEventDate } from "@/utils/transactionDate";

export interface EditPendingTransactionValues {
  amount: number;
  description: string;
  date: string; // ISO date string (YYYY-MM-DD)
}

interface EditPendingTransactionFormProps {
  tx: Transaction;
  onSave: (values: EditPendingTransactionValues) => void;
  onCancel: () => void;
}

function toDateInputValue(tx: Transaction): string {
  const date = transactionEventDate(tx) ?? new Date();
  return date.toISOString().split("T")[0]!;
}

/** Inline editor for a pending transaction, available only to its creator. */
export default function EditPendingTransactionForm({
  tx,
  onSave,
  onCancel,
}: EditPendingTransactionFormProps) {
  const [amount, setAmount] = useState(String(tx.amount));
  const [description, setDescription] = useState(tx.description ?? "");
  const [date, setDate] = useState(toDateInputValue(tx));

  const numAmount = parseFloat(amount);
  const isValid = Number.isFinite(numAmount) && numAmount > 0;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Amount</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          className="input-field text-sm"
          aria-label="Edit amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Description</label>
        <input
          type="text"
          className="input-field text-sm"
          aria-label="Edit description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Date</label>
        <input
          type="date"
          className="input-field text-sm"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={new Date().toISOString().split("T")[0]}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave({ amount: numAmount, description: description.trim(), date })}
          className="btn-primary text-xs px-3 py-1"
          disabled={!isValid}
        >
          Save changes
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs px-3 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}
