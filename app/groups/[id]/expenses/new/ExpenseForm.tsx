'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formatMoney, getCurrencySymbol } from '@/lib/money'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, DEFAULT_CATEGORY_KEY, type CategoryKey } from '@/lib/categories'
import { categoryGlyph, categoryTint } from '@/components/CategoryIcon'
import { isDueNow, isValidDateString, type RecurringFrequency } from '@/lib/recurring'
import {
  buildReceiptPath,
  RECEIPT_HEADER_BYTES,
  receiptContentType,
  RECEIPTS_BUCKET,
  validateReceiptImage,
  type ReceiptImageFormat,
} from '@/lib/receipts'

function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

type Member = {
  id: string
  name: string
}

type Props = {
  groupId: string
  members: Member[]
  currentUserId: string
  currency: string
  addExpenseAction: (formData: FormData) => Promise<void>
}

export default function ExpenseForm({ groupId, members, currentUserId, currency, addExpenseAction }: Props) {
  const currencySymbol = getCurrencySymbol(currency)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<CategoryKey>(DEFAULT_CATEGORY_KEY)
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(currentUserId)
  const [splitMode, setSplitMode] = useState<'equally' | 'custom'>('equally')
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({})
  const [repeat, setRepeat] = useState<'none' | RecurringFrequency>('none')
  // Empty means "today" (in the browser's time zone).
  const [startDate, setStartDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // One key per form instance: a retry after a failed save reuses it.
  const idempotencyKey = useRef(crypto.randomUUID())
  // The picked receipt and its real format (from the file's first bytes).
  const [receipt, setReceipt] = useState<{ file: File; extension: ReceiptImageFormat } | null>(null)
  const receiptFile = receipt?.file ?? null
  const receiptPreview = useMemo(
    () => (receiptFile ? URL.createObjectURL(receiptFile) : null),
    [receiptFile]
  )

  useEffect(() => {
    return () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview)
    }
  }, [receiptPreview])

  // Checked when picked (size and signature), so a renamed, empty or broken
  // file is never attached.
  async function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    try {
      const header = new Uint8Array(await file.slice(0, RECEIPT_HEADER_BYTES).arrayBuffer())
      const check = validateReceiptImage(header, file.size)
      if (!check.ok) {
        setError(check.error)
        return
      }
      setError(null)
      setReceipt({ file, extension: check.extension })
    } catch {
      setError('The receipt image could not be read.')
    }
  }

  // Same path format as the mobile app: <group id>/<timestamp>.<ext>.
  // Returns null when the upload fails; the expense is then saved without it.
  async function uploadReceipt(file: File, extension: ReceiptImageFormat): Promise<string | null> {
    const path = buildReceiptPath(groupId, extension)
    const { error: uploadError } = await createClient()
      .storage.from(RECEIPTS_BUCKET)
      .upload(path, file, { contentType: receiptContentType(extension) })
    if (uploadError) {
      console.error('Receipt upload error:', uploadError)
      return null
    }
    return path
  }

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

    const recurring = repeat !== 'none'
    const start = startDate || localToday()
    if (recurring && !isValidDateString(start)) {
      setError('Choose a valid start date')
      return
    }

    const formData = new FormData()
    if (recurring) {
      formData.set('repeat', repeat)
      formData.set('startDate', start)
    }
    formData.set('description', description.trim())
    formData.set('category', category)
    formData.set('paidBy', paidBy)
    formData.set('amountCents', String(amountCents))
    formData.set('splits', JSON.stringify(splits))
    formData.set('idempotencyKey', idempotencyKey.current)

    setSubmitting(true)
    try {
      if (receipt && !recurring) {
        const receiptPath = await uploadReceipt(receipt.file, receipt.extension)
        if (receiptPath) {
          formData.set('receiptPath', receiptPath)
        } else {
          formData.set('receiptFailed', '1')
        }
      }
      await addExpenseAction(formData)
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-danger-background text-danger text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-border bg-input-background px-3 py-2 text-text"
          placeholder="e.g. Dinner"
        />
      </div>

      <div role="radiogroup" aria-labelledby="category-label">
        <span id="category-label" className="block text-sm font-medium mb-1">Category</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const selected = category === c.key
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCategory(c.key)}
                className="flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-sm text-text"
                style={{
                  borderColor: selected ? c.color : 'var(--border)',
                  backgroundColor: selected ? categoryTint(c.color) : 'transparent',
                }}
              >
                <span style={{ color: c.color }} className="flex">
                  {categoryGlyph(c, 16)}
                </span>
                {c.label}
              </button>
            )
          })}
        </div>
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
          className="w-full rounded-md border border-border bg-input-background px-3 py-2 text-text"
          placeholder="0.00"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Paid by</label>
        <select
          value={paidBy}
          onChange={(e) => setPaidBy(e.target.value)}
          className="w-full rounded-md border border-border bg-input-background px-3 py-2 text-text"
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
                ? 'bg-primary text-on-primary'
                : 'bg-surface-hover text-text'
            }`}
          >
            Equally
          </button>
          <button
            type="button"
            onClick={() => setSplitMode('custom')}
            className={`px-3 py-1.5 rounded-md text-sm ${
              splitMode === 'custom'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-hover text-text'
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
                className="w-28 rounded-md border border-border bg-input-background px-2 py-1 text-text"
                placeholder={`${currencySymbol}0.00`}
              />
            </div>
          ))}
          <p className={`text-sm ${splitMismatch ? 'text-danger' : 'text-text-muted'}`}>
            Total: {formatMoney(splitTotal / 100, currency)} / {formatMoney(amountCents / 100, currency)}
          </p>
        </div>
      )}

      <div>
        <label htmlFor="repeat" className="block text-sm font-medium mb-1">Repeat</label>
        <select
          id="repeat"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value as 'none' | RecurringFrequency)}
          className="w-full rounded-md border border-border bg-input-background px-3 py-2 text-text"
        >
          <option value="none">Does not repeat</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {repeat !== 'none' && (
        <div>
          <label htmlFor="start-date" className="block text-sm font-medium mb-1">Starts on</label>
          <input
            id="start-date"
            type="date"
            value={startDate || localToday()}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-border bg-input-background px-3 py-2 text-text"
          />
          {isValidDateString(startDate || localToday()) &&
            isDueNow(startDate || localToday(), localToday()) && (
              <p className="mt-1 text-sm text-text-muted">
                This date is today or in the past, so the first expense will be created by the next daily run.
              </p>
            )}
        </div>
      )}

      {repeat === 'none' && (
      <div>
        <span className="block text-sm font-medium mb-1">Receipt (optional)</span>
        {receiptFile && receiptPreview ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receiptPreview}
              alt="Receipt preview"
              className="h-16 w-16 rounded border border-border bg-surface-hover object-cover"
            />
            <span className="flex-1 truncate text-sm text-text-muted">{receiptFile.name}</span>
            <button
              type="button"
              onClick={() => setReceipt(null)}
              disabled={submitting}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-hover"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="inline-block cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-hover focus-within:ring-2 focus-within:ring-link">
            Attach receipt
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={handleReceiptChange}
              className="sr-only"
            />
          </label>
        )}
      </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-md bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover disabled:bg-disabled disabled:text-on-disabled"
        >
          {submitting ? 'Adding...' : repeat === 'none' ? 'Add expense' : 'Add recurring expense'}
        </button>
        <Link
          href={`/groups/${groupId}`}
          className="rounded-md border border-border px-4 py-2 font-medium text-text hover:bg-surface-hover"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}