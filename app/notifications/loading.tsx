import { NotificationsSkeleton } from "./NotificationsList";

export default function NotificationsLoading() {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-8">
        <NotificationsSkeleton />
      </div>
    </div>
  );
}
