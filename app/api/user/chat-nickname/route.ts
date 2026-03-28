import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-client"

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("chat_nickname")
      .eq("id", userData.user.id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ chat_nickname: data?.chat_nickname || "" })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: userData, error: userError } = await supabase.auth.getUser()
    
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { chat_nickname } = await req.json()

    if (!chat_nickname || typeof chat_nickname !== "string" || chat_nickname.length > 20) {
      return NextResponse.json({ error: "Invalid nickname" }, { status: 400 })
    }

    const { error } = await supabase
      .from("profiles")
      .update({ chat_nickname })
      .eq("id", userData.user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, chat_nickname })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
