import { NotificationsProvider } from "../../components/notifications/notifications-provider";
import { WorkspaceProvider } from "../../components/workspace-provider";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider><NotificationsProvider>{children}</NotificationsProvider></WorkspaceProvider>;
}
