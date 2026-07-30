"use client"

import { createAuthClient } from "better-auth/react"

export const payAuthClient = createAuthClient({
  baseURL: "/api/pay-auth",
})
