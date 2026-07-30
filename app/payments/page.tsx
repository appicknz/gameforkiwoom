import { Suspense } from "react"
import { PayRequestForm } from "@/components/pay/request-form"
import Script from "next/script"

interface Props {
  searchParams: Promise<{ code?: string }>
}

export default async function PaymentsPage({ searchParams }: Props) {
  const { code } = await searchParams
  const managerCode = code ?? ""

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <PayRequestForm managerCode={managerCode} />
      </Suspense>
    </>
  )
}
