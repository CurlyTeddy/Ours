import { cn } from "@/lib/utils";
import type { Note } from "@/features/moments/models/responses";

// The viewer's notes are blue, the partner's rose.
function AuthorBadge({
  author,
  viewerId,
  className,
}: {
  author: Note["author"];
  viewerId: string | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex flex-none items-center justify-center overflow-hidden rounded-full font-black text-white",
        className,
      )}
      style={{
        background: author.id === viewerId ? "#4F70A8" : "#A8505F",
      }}
    >
      {author.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
        <img src={author.imageUrl} alt="" className="size-full object-cover" />
      ) : (
        author.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

export { AuthorBadge };
