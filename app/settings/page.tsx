import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { SettingsContent } from "@/components/settings/settings-content"

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-6 lg:ml-64">
        <Header title="Settings" description="Manage your account preferences and application settings." />

        <div className="mt-6">
          <SettingsContent />
        </div>
      </main>
    </div>
  )
}
