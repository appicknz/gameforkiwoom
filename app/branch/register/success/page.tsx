import Link from "next/link"

export default function BranchRegisterSuccessPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
          <svg
            className="w-8 h-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">신청 완료</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-2">
          지점 가입 신청이 접수되었습니다.
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          본사 검토 후 이메일로 승인 결과와<br />
          지점 코드를 안내드립니다.
        </p>
        <Link
          href="/login"
          className="inline-block w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition text-center"
        >
          로그인 페이지로
        </Link>
      </div>
    </div>
  )
}
