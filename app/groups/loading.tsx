import { Skeleton } from "@/components/Skeleton";

export default function GroupsLoading() {
  return (
    <div
      className="flex flex-1 flex-col items-center gap-6 bg-background px-4 py-12"
      aria-busy="true"
      aria-label="Loading your groups"
    >
      <div className="flex w-full max-w-md">
        <Skeleton className="h-6 w-36" />
      </div>
      <div className="flex w-full max-w-md items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <ul className="flex w-full max-w-md flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <Skeleton className="h-16 w-full rounded-[20px]" />
          </li>
        ))}
      </ul>
    </div>
  );
}
