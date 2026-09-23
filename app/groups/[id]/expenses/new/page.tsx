import Link from 'next/link'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getDisplayName } from '@/lib/displayName'
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
    const amountCents = parseInt(formData.get('amountCents') as string, 10)
    const splitsRaw = formData.get('splits') as string
    const splits = JSON.parse(splitsRaw) as { userId: string; amountCents: number }[]

    const totalSplit = splits.reduce((sum, s) => sum + s.amountCents, 0)
    if (totalSplit !== amountCents) {
      throw new Error('Split totals do not match expense amount')
    }

    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        group_id: groupId,
        paid_by: paidBy,
        description,
        amount: amountCents / 100,
      })
      .select('id')
      .single()

    if (expenseError || !expense) {
      throw new Error(expenseError?.message || 'Failed to create expense')
    }

    const splitRows = splits.map((s) => ({
      expense_id: expense.id,
      user_id: s.userId,
      amount_owed: s.amountCents / 100,
    }))

    const { error: splitsError } = await supabase
      .from('expense_splits')
      .insert(splitRows)

    if (splitsError) {
      throw new Error(splitsError.message)
    }

    redirect(`/groups/${groupId}`)
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