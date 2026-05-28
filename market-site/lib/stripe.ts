import "server-only"
import Stripe from "stripe"

const globalForStripe = globalThis as unknown as { _stripe?: Stripe }

function getStripe(): Stripe {
  if (!globalForStripe._stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error("STRIPE_SECRET_KEY is missing")
    globalForStripe._stripe = new Stripe(key, { apiVersion: "2025-04-30.basil" })
  }
  return globalForStripe._stripe
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as any)[prop]
  },
})
