'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney, getCurrencySymbol } from '@/lib/money'

type Member = {
  id: string
  name: string
}

type Props = {
  members: Member[]
  currentUserId: string
  currency: string
  addExpenseAction: (formData: FormData) => Promise<void>
}

export default function ExpenseForm({ members, currentUserId, currency, addExpenseAction }: Props) {
  const currencySymbol = getCurrencySymbol(currency)
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(currentUserId)
  const [splitMode, setSplitMode] = useState<'equally' | 'custom'>('equally')
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const amountCents = Math.round(parseFloat(amount || '0') * 100)

  function getSplits(): { userId: string; amountCents: number }[] {
    if (splitMode === 'equally') {
      const share = Math.floor(amountCents / members.length)
      const remainder = amountCents - share * members.length
      return members.map((m, i) => ({
        userId: m.id,
        amountCents: share + (i < remainder ? 1 : 0),
      }))
    }

    return members.map((m) => ({
      userId: m.id,
      amountCents: Math.round(parseFloat(customSplits[m.id] || '0') * 100),
    }))
  }

  const splits = getSplits()
  const splitTotal = splits.reduce((sum, s) => sum + s.amountCents, 0)
  const splitMismatch = splitMode === 'custom' && splitTotal !== amountCents

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!description.trim()) {
      setError('Description is required')
      return
    }
    if (!amountCents || amountCents <= 0) {
      setError('Amount must be greater than 0')
      return
    }
    if (splitMismatch) {
      setError(
        `Split total (${formatMoney(splitTotal / 100, currency)}) does not match the expense amount (${formatMoney(amountCents / 100, currency)})`
      )
      return
    }

    const formData = new FormData()
    formData.set('description', description.trim())
    formData.set('paidBy', paidBy)
    formData.set('amountCents', String(amountCents))
    formData.set('splits', JSON.stringify(splits))

    setSubmitting(true)
    try {
      await addExpenseAction(formData)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border bg-white px-3 py-2 text-black"
          placeholder="e.g. Dinner"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Total amount ({currencySymbol})
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-md border bg-white px-3 py-2 text-black"
          placeholder="0.00"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Paid by</label>
        <select
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          className="w-full rounded-md border bg-white px-3 py-2 text-black"
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Split</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSplitMode('equally')}
            className={`px-3 py-1.5 rounded-md text-sm ${
              splitMode === 'equally'
                ? 'bg-black text-white'
                : 'bg-zinc-100 text-black'
            }`}
          >
            Equally
          </button>
          <button
            type="button"
            onClick={() => setSplitMode('custom')}
            className={`px-3 py-1.5 rounded-md text-sm ${
              splitMode === 'custom'
                ? 'bg-black text-white'
                : 'bg-zinc-100 text-black'
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {splitMode === 'custom' && (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{m.name}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={customSplits[m.id] || ''}
                onChange={(e) =>
                  setCustomSplits((prev) => ({ ...prev, [m.id]: e.target.value }))
                }
                className="w-28 rounded-md border bg-white px-2 py-1 text-black"
                placeholder={`${currencySymbol}0.00`}
              />
            </div>
          ))}
          <p className={`text-sm ${splitMismatch ? 'text-red-600' : 'text-zinc-500'}`}>
            Total: {formatMoney(splitTotal / 100, currency)} / {formatMoney(amountCents / 100, currency)}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-black px-4 py-2 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {submitting ? 'Adding...' : 'Add expense'}
      </button>
    </form>
  )
}