import { RestaurantFeatureBoundary } from "../../components/restaurant-feature-boundary";
import { NotificationsProvider } from "../../components/notifications/notifications-provider";
import { WorkspaceProvider } from "../../components/workspace-provider";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider><NotificationsProvider><RestaurantFeatureBoundary>{children}</RestaurantFeatureBoundary></NotificationsProvider></WorkspaceProvider>;
}
