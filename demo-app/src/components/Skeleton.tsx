interface Props {
  className?: string;
  rows?: number;
}

export function Skeleton({ className = "h-4 w-full", rows = 1 }: Props) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`skeleton ${className} ${i > 0 ? "mt-2" : ""}`} />
      ))}
    </>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
