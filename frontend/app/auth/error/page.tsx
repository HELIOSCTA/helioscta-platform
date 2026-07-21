import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f1117] px-6 text-gray-100">
      <div className="max-w-md rounded-lg border border-gray-800 bg-[#111622] p-6 shadow-xl shadow-black/30">
        <h1 className="text-lg font-semibold text-white">Sign in failed</h1>
        <p className="mt-2 text-sm text-gray-400">
          The app could not verify your Vercel account for this session.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-md border border-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:border-gray-600 hover:bg-gray-800"
        >
          Back
        </Link>
      </div>
    </main>
  );
}
