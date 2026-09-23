import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeDetailedBalances, computeSettlements } from "@/lib/settlements";
import { getDisplayName } from "@/lib/displayName";
import { formatMoney } from "@/lib/money";
import RealtimeGroupListener from "./RealtimeGroupListener";
import BalancesSection from "./BalancesSection";
import CurrencySelector from "./CurrencySelector";
import ExportMenu from "./ExportMenu";
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
    .select("id, name, created_at, currency, created_by")
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
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-4 py-12">
      <RealtimeGroupListener groupId={group.id} />
      <div className="flex w-full max-w-md items-center justify-between">
        <Link
          href="/groups"
          className="text-sm text-text-muted hover:text-text"
        >
          &larr; Your groups
        </Link>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Link
            href="/profile"
            className="font-medium text-text hover:underline"
          >
            {nameById[user.id] ?? getDisplayName({ display_name: null, email: user.email ?? "" })}
          </Link>
          <SignOutButton small />
        </div>
      </div>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-surface p-8">
        {hasLoadError && (
          <div className="rounded-md bg-danger-background p-3 text-sm text-danger">
            Some data failed to load — the numbers below may be incomplete.
            Try refreshing the page.
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-text">
            {group.name}
          </h1>
          <div className="flex items-start gap-2">
            <CurrencySelector
              key={group.currency}
              groupId={group.id}
              currency={group.currency}
              editable={group.created_by === user.id}
            />
            <ExportMenu
              group={{ name: group.name, currency: group.currency }}
              expenses={expenses ?? []}
              splits={(splits ?? []).map((s: any) => ({
                expense_id: s.expense_id,
                user_id: s.user_id,
                amount_owed: s.amount_owed,
              }))}
              settlements={settlements ?? []}
              members={(members ?? [])
                .map((m: any) => m.profiles)
                .filter((p: any) => p !== null)}
              currentUserId={user.id}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <h2 className="text-lg font-bold text-text">
            Your balance
          </h2>
          {myNet === 0 ? (
            <p className="text-sm text-text-muted">
              You&apos;re all settled up!
            </p>
          ) : (
            <>
              {totalOwedByMe > 0 && (
                <p className="text-base font-semibold text-danger">
                  You owe {formatMoney(totalOwedByMe, group.currency)}
                </p>
              )}
              {totalOwedToMe > 0 && (
                <p className="text-base font-semibold text-success">
                  You are owed {formatMoney(totalOwedToMe, group.currency)}
                </p>
              )}
              <p className="text-sm text-text-muted">
                Net:{" "}
                {myNet > 0
                  ? `You are owed ${formatMoney(myNet, group.currency)}`
                  : `You owe ${formatMoney(Math.abs(myNet), group.currency)}`}
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
          currency={group.currency}
        />

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-text">
            Expenses
          </h2>
          {!hasExpenses ? (
            <p className="text-sm text-text-muted">
              No expenses yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(expenses ?? []).map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-text">
                    {e.description}
                    <span className="text-text-muted">
                      {" "}
                      — paid by {nameById[e.paid_by] ?? "someone"}
                    </span>
                  </span>
                  <span className="font-medium text-text">
                    {formatMoney(Number(e.amount), group.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/groups/${group.id}/expenses/new`}
            className="text-sm font-medium text-text hover:underline"
          >
            + Add expense
          </Link>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {inviteUrl === null ? (
            <p className="text-sm text-text-muted">
              No active invite link.
            </p>
          ) : (
           <a 
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm text-link hover:underline"
            >
              {inviteUrl}
            </a>
          )}
          <form action={createInvite}>
            <input type="hidden" name="groupId" value={group.id} />
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover"
            >
              Generate invite link
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}