import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RealtimeGroupListener from "./RealtimeGroupListener";

async function createInvite(formData: FormData) {
  "use server";

  const groupId = formData.get("groupId") as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("group_invites").insert({
    group_id: groupId,
    created_by: user.id,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("Create invite error:", error);
  }

  redirect(`/groups/${groupId}`);
}

async function recordSettlement(formData: FormData) {
  "use server";

  const groupId = formData.get("groupId") as string;
  const fromUser = formData.get("fromUser") as string;
  const toUser = formData.get("toUser") as string;
  const amount = formData.get("amount") as string;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("settlements").insert({
    group_id: groupId,
    from_user: fromUser,
    to_user: toUser,
    amount: parseFloat(amount),
  });

  if (error) {
    console.error("Record settlement error:", error);
  }

  redirect(`/groups/${groupId}`);
}

type BalanceLine = {
  from: string;
  to: string;
  amount: number;
};

function computeSettlements(net: Record<string, number>): BalanceLine[] {
  const creditors: { id: string; amount: number }[] = [];
  const debtors: { id: string; amount: number }[] = [];

  for (const [id, amount] of Object.entries(net)) {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.005) creditors.push({ id, amount: rounded });
    else if (rounded < -0.005) debtors.push({ id, amount: -rounded });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const lines: BalanceLine[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settled = Math.min(debtor.amount, creditor.amount);

    lines.push({ from: debtor.id, to: creditor.id, amount: settled });

    debtor.amount -= settled;
    creditor.amount -= settled;

    if (debtor.amount <= 0.005) i++;
    if (creditor.amount <= 0.005) j++;
  }

  return lines;
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: group, error } = await supabase
    .from("groups")
    .select("id, name, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Group detail query error:", error);
  }

  if (!group) {
    notFound();
  }

  const { data: invites } = await supabase
    .from("group_invites")
    .select("id, token, expires_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestInvite = invites?.[0];

  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, paid_by, amount, description, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const { data: splits } = await supabase
    .from("expense_splits")
    .select("expense_id, user_id, amount_owed, expenses!inner(group_id)")
    .eq("expenses.group_id", id);

  const { data: settlements } = await supabase
    .from("settlements")
    .select("from_user, to_user, amount")
    .eq("group_id", id);

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, profiles(id, display_name, email)")
    .eq("group_id", id);

  const nameById: Record<string, string> = {};
  (members ?? []).forEach((m: any) => {
    nameById[m.profiles.id] = m.profiles.display_name || m.profiles.email;
  });

  const net: Record<string, number> = {};

  (expenses ?? []).forEach((e) => {
    net[e.paid_by] = (net[e.paid_by] ?? 0) + Number(e.amount);
  });

  (splits ?? []).forEach((s: any) => {
    net[s.user_id] = (net[s.user_id] ?? 0) - Number(s.amount_owed);
  });

  (settlements ?? []).forEach((s) => {
    net[s.from_user] = (net[s.from_user] ?? 0) + Number(s.amount);
    net[s.to_user] = (net[s.to_user] ?? 0) - Number(s.amount);
  });

  const balanceLines = computeSettlements(net);
  const hasExpenses = (expenses ?? []).length > 0;

  const totalOwedByMe = balanceLines
    .filter((line) => line.from === user.id)
    .reduce((sum, line) => sum + line.amount, 0);

  const totalOwedToMe = balanceLines
    .filter((line) => line.to === user.id)
    .reduce((sum, line) => sum + line.amount, 0);

  const myNet = Math.round((totalOwedToMe - totalOwedByMe) * 100) / 100;

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-12 dark:bg-black">
      <RealtimeGroupListener groupId={group.id} />
      <div className="flex w-full max-w-md items-center justify-between">
        <Link
          href="/groups"
          className="text-sm text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          &larr; Your groups
        </Link>
      </div>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          {group.name}
        </h1>

        <div className="flex flex-col gap-1 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-black dark:text-zinc-50">
            Your balance
          </h2>
          {myNet === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              You&apos;re all settled up!
            </p>
          ) : (
            <>
              {totalOwedByMe > 0 && (
                <p className="text-base font-semibold text-red-600 dark:text-red-400">
                  You owe €{totalOwedByMe.toFixed(2)}
                </p>
              )}
              {totalOwedToMe > 0 && (
                <p className="text-base font-semibold text-green-600 dark:text-green-400">
                  You are owed €{totalOwedToMe.toFixed(2)}
                </p>
              )}
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Net:{" "}
                {myNet > 0
                  ? `You are owed €${myNet.toFixed(2)}`
                  : `You owe €${Math.abs(myNet).toFixed(2)}`}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            All balances in this group
          </h2>
          {!hasExpenses ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No expenses yet.
            </p>
          ) : balanceLines.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              All settled up!
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {balanceLines.map((line, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {nameById[line.from] ?? "Someone"} owes{" "}
                    {nameById[line.to] ?? "someone"}: €
                    {line.amount.toFixed(2)}
                  </span>
                  <form action={recordSettlement}>
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="fromUser" value={line.from} />
                    <input type="hidden" name="toUser" value={line.to} />
                    <input
                      type="hidden"
                      name="amount"
                      value={line.amount.toFixed(2)}
                    />
                    <button
                      type="submit"
                      className="whitespace-nowrap rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Mark as settled
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Expenses
          </h2>
          {!hasExpenses ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No expenses yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(expenses ?? []).map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {e.description}
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {" "}
                      — paid by {nameById[e.paid_by] ?? "someone"}
                    </span>
                  </span>
                  <span className="font-medium text-black dark:text-zinc-50">
                    €{Number(e.amount).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/groups/${group.id}/expenses/new`}
            className="text-sm font-medium text-black hover:underline dark:text-zinc-50"
          >
            + Add expense
          </Link>
        </div>

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {latestInvite ? (
            <p className="break-all text-sm text-zinc-600 dark:text-zinc-400">
              Invite link: /invite/{latestInvite.token}
            </p>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No active invite link.
            </p>
          )}
          <form action={createInvite}>
            <input type="hidden" name="groupId" value={group.id} />
            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Generate invite link
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}