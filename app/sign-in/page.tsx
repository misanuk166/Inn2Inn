import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in · Inn2Inn" };

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-zinc-900">Sign in to Inn2Inn</h1>
        <p className="mb-4 text-xs text-zinc-500">
          We&rsquo;ll send you a magic link so you can save and load itineraries. No password needed.
        </p>
        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
