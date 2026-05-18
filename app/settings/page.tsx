import { Sidebar } from "@/components/dashboard/sidebar"
import { SettingsContent } from "@/components/settings/settings-content"

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-6 lg:ml-64">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">설정</h1>
          <p className="text-xs text-muted-foreground mt-1">계정 및 앱 설정을 관리합니다.</p>
        </div>
        <SettingsContent />
      </main>
    </div>
  )
}
