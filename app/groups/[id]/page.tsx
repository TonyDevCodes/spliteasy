import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { computeDetailedBalances, computeNetBalances, computeSettlements } from "@/lib/settlements";
import { getDisplayName, nameForUserId } from "@/lib/displayName";
import { formatMoney } from "@/lib/money";
import {
  collectReceiptPaths,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  RECEIPTS_BUCKET,
  signedUrlsByPath,
} from "@/lib/receipts";
import RealtimeGroupListener from "./RealtimeGroupListener";
import BalancesSection from "./BalancesSection";
import CurrencySelector from "./CurrencySelector";
import ExportMenu from "./ExportMenu";
import ReceiptThumbnail from "./ReceiptThumbnail";
import { createInvite } from "./actions";
import { EmptyState } from "@/components/EmptyState";
import CategoryIcon from "@/components/CategoryIcon";
import { categoryForExpense } from "@/lib/categories";
import { SignOutButton } from "@/app/sign-out-button";
import { NotificationBell } from "@/app/notification-bell";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const receiptFailed = (await searchParams).receipt === "failed";

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);

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
    .select("id, paid_by, amount, description, category, created_at, receipt_url")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const { data: splits, error: splitsError } = await supabase
    .from("expense_splits")
    .select("expense_id, user_id, amount_owed, expenses!inner(group_id)")
    .eq("expenses.group_id", id);

  const { data: settlements, error: settlementsError } = await supabase
    .from("settlements")
    .select("from_user, to_user, amount, settled_at, kind")
    .eq("group_id", id);

  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("user_id, role, profiles(id, display_name, email)")
    .eq("group_id", id);

  // Group settings (currency) are editable by group admins, matching the
  // groups_update RLS policy. Write-offs are admin-only as well.
  const myRole = (members ?? []).find((m: any) => m.user_id === user.id)?.role;
  const isAdmin = myRole === "admin" || myRole === "owner";

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

  // The bucket is private: sign each receipt path for 60 minutes. A failure
  // only hides the thumbnails.
  const receiptPaths = collectReceiptPaths(expenses ?? []);
  let receiptUrls: Record<string, string> = {};
  if (receiptPaths.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrls(receiptPaths, RECEIPT_SIGNED_URL_TTL_SECONDS);
    if (signError) {
      console.error("Receipt signed URL error:", signError);
    }
    receiptUrls = signedUrlsByPath(signed);
  }

  const nameById: Record<string, string> = {};
  (members ?? []).forEach((m: any) => {
    if (m.profiles) nameById[m.profiles.id] = getDisplayName(m.profiles);
  });

  const simplifiedLines = computeSettlements(
    computeNetBalances(expenses ?? [], splits ?? [], settlements ?? [])
  );
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
          <NotificationBell userId={user.id} />
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
        {receiptFailed && (
          <div className="rounded-md bg-danger-background p-3 text-sm text-danger">
            The expense was saved, but the receipt could not be uploaded.
          </div>
        )}
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
              editable={isAdmin}
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
          isAdmin={isAdmin}
        />

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-text">
            Expenses
          </h2>
          {!hasExpenses ? (
            <EmptyState
              title="No expenses yet"
              description="Add the first expense to see who owes what."
              action={{ label: "Add expense", href: `/groups/${group.id}/expenses/new` }}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {(expenses ?? []).map((e) => {
                const receiptUrl = e.receipt_url ? receiptUrls[e.receipt_url] : undefined;
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <CategoryIcon category={categoryForExpense(e)} />
                    <span className="flex flex-1 flex-col gap-1 text-text">
                      <span>
                        {e.description}
                        <span className="text-text-muted">
                          {" "}
                          — paid by {nameForUserId(e.paid_by, nameById)}
                        </span>
                      </span>
                      {receiptUrl && (
                        <ReceiptThumbnail url={receiptUrl} description={e.description} />
                      )}
                    </span>
                    <span className="shrink-0 font-medium text-text">
                      {formatMoney(Number(e.amount), group.currency)}
                    </span>
                  </li>
                );
              })}
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