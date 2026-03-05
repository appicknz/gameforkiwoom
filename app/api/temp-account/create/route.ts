import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

function generateTempUsername(): string {
  // bp + 임의 4자리 영어 + 임의 4자리 숫자
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const randomLetters = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("")
  const randomNumbers = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  return `bp${randomLetters}${randomNumbers}`
}

function generatePassword(): string {
  // 임시 비밀번호: 8자리 (영어+숫자)
  return Math.random().toString(36).substring(2, 10)
}

export async function POST() {
  try {
    const supabase = createClient()

    // 임시 사용자명 생성 (중복 체크)
    let username = generateTempUsername()
    let attempts = 0
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .single()

      if (!existing) break
      username = generateTempUsername()
      attempts++
    }

    if (attempts === 10) {
      return NextResponse.json({ error: "Failed to generate unique username" }, { status: 500 })
    }

    const password = generatePassword()
    const email = `${username}@game.local`

    // 1. Supabase Auth에 사용자 생성 (service role)
    const adminAuthRes = await fetch(
      "https://cugvictfarorfjhcfdsm.supabase.co/auth/v1/admin/users",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
        }),
      }
    )

    if (!adminAuthRes.ok) {
      const error = await adminAuthRes.json()
      console.error("[v0] Auth creation failed:", error)
      return NextResponse.json({ error: "Failed to create auth user" }, { status: 500 })
    }

    const authUser = await adminAuthRes.json()
    const userId = authUser.user.id

    // 2. profiles 테이블에 프로필 추가
    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      username,
      role: "user",
    })

    if (profileError) {
      console.error("[v0] Profile creation failed:", profileError)
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 })
    }

    // 3. balances 테이블에 잔고 추가 (초기값 0)
    const { error: balanceError } = await supabase.from("balances").insert({
      user_id: userId,
      amount: 0,
    })

    if (balanceError) {
      console.error("[v0] Balance creation failed:", balanceError)
    }

    // 4. 클라이언트에서 자동 로그인할 수 있도록 credential 반환
    return NextResponse.json({
      success: true,
      username,
      password,
      email,
      userId,
    })
  } catch (error) {
    console.error("[v0] Temp account creation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
