import { Suspense } from "react";
import HomePageClient from "./HomePageClient";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";

export default function Page() {
  const showLocalDevFeatures = isLocalOnlyFeatureEnabled();

  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
          <div className="h-[520px] animate-pulse rounded-xl border border-gray-800 bg-gray-900/60" />
        </main>
      }
    >
      <HomePageClient
        showLocalDevFeatures={showLocalDevFeatures}
      />
    </Suspense>
  );
}
