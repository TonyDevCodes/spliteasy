import { Skeleton } from "@/components/Skeleton";

export default function GroupDetailLoading() {
  return (
    <div
      className="flex flex-1 flex-col items-center gap-6 bg-background px-4 py-12"
      aria-busy="true"
      aria-label="Loading group"
    >
      <div className="flex w-full max-w-md items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-[20px] border border-border bg-surface p-8">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-20 w-full rounded-[20px]" />
        <div className="flex flex-col gap-3 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
