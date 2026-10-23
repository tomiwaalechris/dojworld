import type { Feature, SubscriptionAccess } from "@/lib/saas/types";
// Dojworld is a dedicated hotel installation. Staff roles remain database-enforced.
export function FeatureGate({ children }: { subscription?: SubscriptionAccess; feature: Feature; organizationId: string; children: React.ReactNode }) { return children; }
