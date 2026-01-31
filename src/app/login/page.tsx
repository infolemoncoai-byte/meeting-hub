import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();
  if (session.user?.authed) redirect("/");

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Meeting Hub</h1>
      <p className="text-sm text-muted-foreground">Enter password to continue.</p>

      <form action="/api/login" method="post" className="space-y-3">
        <input
          name="password"
          type="password"
          className="w-full rounded-md border px-3 py-2"
          placeholder="Password"
        />
        <button className="w-full rounded-md bg-black px-3 py-2 text-white">Sign in</button>
      </form>
    </main>
  );
}
