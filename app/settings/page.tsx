import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { SettingsContent } from "@/components/settings/settings-content"

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 p-4 lg:p-6 lg:ml-64">
        <Header title="설정" description="계정 및 앱 설정을 관리합니다." />

        <div className="mt-6">
          <SettingsContent />
        </div>
      </main>
    </div>
  )
}
