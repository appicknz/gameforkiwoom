import "server-only"
import Stripe from "stripe"

const globalForStripe = globalThis as unknown as { _stripe?: Stripe }

if (!globalForStripe._stripe) {
  globalForStripe._stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-04-30.basil",
  })
}

export const stripe = globalForStripe._stripe!
