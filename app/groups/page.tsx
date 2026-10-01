import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/displayName";
import { formatMoney } from "@/lib/money";
import { computeNetBalances } from "@/lib/settlements";
import { SignOutButton } from "@/app/sign-out-button";
import { EmptyState } from "@/components/EmptyState";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/app/notification-bell";

type GroupRow = {
  id: string;
  name: string;
  created_at: string;
  currency: string;
};

type MembershipRow = {
  groups: GroupRow | null;
};

export default async function GroupsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const myName = profile ? getDisplayName(profile) : getDisplayName({ display_name: null, email: user.email ?? "" });

  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("groups(id, name, created_at, currency)")
    .eq("user_id", user.id)
    .order("created_at", { referencedTable: "groups", ascending: false })
    .returns<MembershipRow[]>();

  if (error) {
    console.error("Groups query error:", error);
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <p className="text-danger">
          Something went wrong loading your groups.
        </p>
      </div>
    );
  }

  const groups = (memberships ?? [])
    .map((m) => m.groups)
    .filter((g): g is GroupRow => g !== null);

  // One query per table for all groups (not per group), then the same balance
  // function the group page uses, applied to each group's rows.
  const groupIds = groups.map((g) => g.id);
  const memberCount: Record<string, number> = {};
  const netByGroup: Record<string, number> = {};
  let balancesLoaded = false;

  if (groupIds.length > 0) {
    const [membersRes, expensesRes, splitsRes, settlementsRes] = await Promise.all([
      supabase.from("group_members").select("group_id").in("group_id", groupIds),
      supabase.from("expenses").select("id, group_id, paid_by, amount").in("group_id", groupIds),
      supabase
        .from("expense_splits")
        .select("expense_id, user_id, amount_owed, expenses!inner(group_id)")
        .in("expenses.group_id", groupIds),
      supabase
        .from("settlements")
        .select("group_id, from_user, to_user, amount, kind")
        .in("group_id", groupIds),
    ]);

    if (membersRes.error) console.error("Member count query error:", membersRes.error);
    (membersRes.data ?? []).forEach((row: { group_id: string }) => {
      memberCount[row.group_id] = (memberCount[row.group_id] ?? 0) + 1;
    });

    if (expensesRes.error || splitsRes.error || settlementsRes.error) {
      console.error("Group balances query error:", {
        expenses: expensesRes.error,
        splits: splitsRes.error,
        settlements: settlementsRes.error,
      });
    } else {
      balancesLoaded = true;
      const expenses = expensesRes.data ?? [];
      const splits = splitsRes.data ?? [];
      const settlements = settlementsRes.data ?? [];
      for (const g of groups) {
        const groupExpenses = expenses.filter((e) => e.group_id === g.id);
        const expenseIds = new Set(groupExpenses.map((e) => e.id));
        const net = computeNetBalances(
          groupExpenses,
          splits.filter((s) => expenseIds.has(s.expense_id)),
          settlements.filter((s) => s.group_id === g.id)
        );
        netByGroup[g.id] = Math.round((net[user.id] ?? 0) * 100) / 100;
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-4 py-12">
      <div className="flex w-full max-w-md">
        <Logo size={24} withWordmark />
      </div>

      <div className="flex w-full max-w-md items-center justify-between text-sm text-text-muted">
        <span>
          Signed in as{" "}
          <Link
            href="/profile"
            className="font-medium text-text hover:underline"
          >
            {myName}
          </Link>
        </span>
        <div className="flex items-center gap-2">
          <NotificationBell userId={user.id} />
          <SignOutButton small />
        </div>
      </div>

      <div className="flex w-full max-w-md items-center justify-between">
        <h1 className="text-xl font-semibold text-text">
          Your groups
        </h1>
        <Link
          href="/groups/new"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
        >
          Create group
        </Link>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          className="w-full max-w-md rounded-[20px] border border-border bg-surface"
          title="No groups yet"
          description="Create your first group and start splitting costs."
          action={{ label: "Create group", href: "/groups/new" }}
        />
      ) : (
        <ul className="flex w-full max-w-md flex-col gap-2">
          {groups.map((group) => {
            const count = memberCount[group.id];
            const net = netByGroup[group.id];
            return (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  className="flex items-center justify-between gap-4 rounded-[20px] border border-border bg-surface p-4 text-text transition-colors hover:bg-surface-hover"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-semibold">{group.name}</span>
                    {count !== undefined && (
                      <span className="text-sm text-text-muted">
                        {count} {count === 1 ? "member" : "members"}
                      </span>
                    )}
                  </span>
                  {balancesLoaded && net !== undefined && (
                    <span
                      className={`shrink-0 text-right text-sm font-semibold ${
                        net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-text-muted"
                      }`}
                    >
                      {net > 0
                        ? `You are owed ${formatMoney(net, group.currency)}`
                        : net < 0
                          ? `You owe ${formatMoney(Math.abs(net), group.currency)}`
                          : "Settled up"}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}