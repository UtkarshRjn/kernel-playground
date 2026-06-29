import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

// Server-side gate: only signed-in users can reach the playground.
export default async function PlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/playground");
  return <>{children}</>;
}
