import { Suspense } from "react";
import HomePageClient from "./HomePageClient";
import { getNavPositionsClientAuth } from "@/lib/server/appAuth";
import { isLocalOnlyFeatureEnabled } from "@/lib/server/devFeatures";

export const dynamic = "force-dynamic";

export default async function Page() {
  const showLocalDevFeatures = isLocalOnlyFeatureEnabled();
  const navPositionsAuth = await getNavPositionsClientAuth();
  const showNavPositionsFeature = navPositionsAuth.allowed;

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
        showNavPositionsFeature={showNavPositionsFeature}
        navPositionsAuth={navPositionsAuth}
      />
    </Suspense>
  );
}
