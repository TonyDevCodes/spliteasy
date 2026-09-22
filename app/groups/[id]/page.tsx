import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeDetailedBalances, computeSettlements } from "@/lib/settlements";
import { getDisplayName } from "@/lib/displayName";
import RealtimeGroupListener from "./RealtimeGroupListener";
import BalancesSection from "./BalancesSection";
import { createInvite } from "./actions";
import { SignOutButton } from "@/app/sign-out-button";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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

  const { data: invites, error: invitesError } = await supabase
    .from("group_invites")
    .select("id, token, expires_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestInvite = invites?.[0];

  const { data: expenses, error: expensesError } = await supabase
    .from("expenses")
    .select("id, paid_by, amount, description, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const { data: splits, error: splitsError } = await supabase
    .from("expense_splits")
    .select("expense_id, user_id, amount_owed, expenses!inner(group_id)")
    .eq("expenses.group_id", id);

  const { data: settlements, error: settlementsError } = await supabase
    .from("settlements")
    .select("from_user, to_user, amount")
    .eq("group_id", id);

  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("user_id, profiles(id, display_name, email)")
    .eq("group_id", id);

  const hasLoadError = Boolean(
    invitesError || expensesError || splitsError || settlementsError || membersError
  );

  if (hasLoadError) {
    console.error("Group detail partial load error:", {
      invitesError,
      expensesError,
      splitsError,
      settlementsError,
      membersError,
    });
  }

  const nameById: Record<string, string> = {};
  (members ?? []).forEach((m: any) => {
    nameById[m.profiles.id] = getDisplayName(m.profiles);
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

  const simplifiedLines = computeSettlements(net);
  const detailedLines = computeDetailedBalances(
    expenses ?? [],
    splits ?? [],
    settlements ?? []
  );
  const hasExpenses = (expenses ?? []).length > 0;

  const totalOwedByMe = simplifiedLines
    .filter((line) => line.from === user.id)
    .reduce((sum, line) => sum + line.amount, 0);

  const totalOwedToMe = simplifiedLines
    .filter((line) => line.to === user.id)
    .reduce((sum, line) => sum + line.amount, 0);

  const myNet = Math.round((totalOwedToMe - totalOwedByMe) * 100) / 100;

  const inviteUrl = latestInvite
    ? SITE_URL + "/invite/" + latestInvite.token
    : null;

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
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <Link
            href="/profile"
            className="font-medium text-black hover:underline dark:text-zinc-50"
          >
            {nameById[user.id] ?? getDisplayName({ display_name: null, email: user.email ?? "" })}
          </Link>
          <SignOutButton small />
        </div>
      </div>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        {hasLoadError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            Some data failed to load — the numbers below may be incomplete.
            Try refreshing the page.
          </div>
        )}

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

        <BalancesSection
          groupId={group.id}
          hasExpenses={hasExpenses}
          detailedLines={detailedLines}
          simplifiedLines={simplifiedLines}
          nameById={nameById}
        />

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
          {inviteUrl === null ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No active invite link.
            </p>
          ) : (
           <a 
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              {inviteUrl}
            </a>
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