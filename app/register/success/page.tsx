import Link from "next/link"

export default function RegisterSuccessPage() {
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
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">가입 완료</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          이메일로 인증 링크를 보냈습니다.
          <br />
          이메일을 확인하고 인증을 완료해주세요.
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
