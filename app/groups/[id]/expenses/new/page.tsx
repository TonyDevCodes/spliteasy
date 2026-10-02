import Link from 'next/link'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getDisplayName } from '@/lib/displayName'
import { isReceiptPathForGroup } from '@/lib/receipts'
import { isValidCategory } from '@/lib/categories'
import { buildRecurringRow } from '@/lib/recurring'
import ExpenseForm from './ExpenseForm'

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: groupId } = await params
  const supabase = await createClient()

  const user = await getCurrentUser(supabase)

  if (!user) {
    redirect('/login')
  }

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, currency')
    .eq('id', groupId)
    .single()

  if (groupError || !group) {
    notFound()
  }

  const { data: members, error: membersError } = await supabase
    .from('group_members')
    .select('user_id, profiles(id, display_name, email)')
    .eq('group_id', groupId)

  if (membersError || !members) {
    notFound()
  }

  const formattedMembers = members.map((m: any) => ({
    id: m.profiles.id,
    name: getDisplayName(m.profiles),
  }))

  async function addExpense(formData: FormData) {
    'use server'

    const supabase = await createClient()
    const user = await getCurrentUser(supabase)

    if (!user) {
      throw new Error('Not authenticated')
    }

    const description = formData.get('description') as string
    const paidBy = formData.get('paidBy') as string
    const categoryRaw = formData.get('category')
    const category = isValidCategory(categoryRaw) ? categoryRaw : null
    const amountCents = parseInt(formData.get('amountCents') as string, 10)
    const splitsRaw = formData.get('splits') as string
    const splits = JSON.parse(splitsRaw) as { userId: string; amountCents: number }[]

    const totalSplit = splits.reduce((sum, s) => sum + s.amountCents, 0)
    if (totalSplit !== amountCents) {
      throw new Error('Split totals do not match expense amount')
    }

    // "weekly" or "monthly" saves a recurring template instead of an expense;
    // anything else (including no value) is a normal one-off expense.
    const repeat = formData.get('repeat')
    if (repeat === 'weekly' || repeat === 'monthly') {
      const built = buildRecurringRow({
        groupId,
        createdBy: user.id,
        paidBy,
        description,
        category,
        amountCents,
        splits,
        frequency: repeat,
        startDate: (formData.get('startDate') as string | null) ?? '',
        memberIds: formattedMembers.map((m) => m.id),
      })
      if (!built.ok) {
        throw new Error(built.error)
      }

      const { error: recurringError } = await supabase
        .from('recurring_expenses')
        .insert(built.row)

      if (recurringError) {
        throw new Error(recurringError.message)
      }

      redirect(`/groups/${groupId}`)
    }

    // Uploaded by the form; only a path inside this group's folder is stored.
    const receiptPath = (formData.get('receiptPath') as string | null) || null
    if (receiptPath && !isReceiptPathForGroup(receiptPath, groupId)) {
      throw new Error('Invalid receipt')
    }

    // Created once per form instance, so a retry after a failed save is idempotent.
    const idempotencyKey = (formData.get('idempotencyKey') as string | null) || null
    if (!idempotencyKey) {
      throw new Error('Missing idempotency key')
    }

    const { error: expenseError } = await supabase.rpc('create_expense_with_splits', {
      p_group_id: groupId,
      p_paid_by: paidBy,
      p_amount: amountCents / 100,
      p_description: description,
      p_category: category,
      p_receipt_url: receiptPath ?? null,
      p_idempotency_key: idempotencyKey,
      p_splits: splits.map((s) => ({
        user_id: s.userId,
        amount_owed: s.amountCents / 100,
      })),
    })

    if (expenseError) {
      throw new Error(expenseError.message || 'Failed to create expense')
    }

    // The form saves the expense even when the receipt upload failed; the
    // group page then says so.
    const receiptFailed = formData.get('receiptFailed') === '1'
    redirect(receiptFailed ? `/groups/${groupId}?receipt=failed` : `/groups/${groupId}`)
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <Link
        href={`/groups/${groupId}`}
        className="mb-4 inline-block text-sm text-text-muted hover:text-text"
      >
        &larr; Back to group
      </Link>
      <h1 className="text-xl font-semibold mb-4">
        Add expense — {group.name}
      </h1>
      <ExpenseForm
        groupId={groupId}
        members={formattedMembers}
        currentUserId={user.id}
        currency={group.currency}
        addExpenseAction={addExpense}
      />
    </div>
  )
}