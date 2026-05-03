import "dotenv/config";
import { createPaymentIntent } from "../src/services/psp/stripe.adapter";

(async () => {
  try {
    const pi = await createPaymentIntent({ amount_cents: 100, currency: "usd" });
    console.log("SUCCESS", pi.id);
    process.exit(0);
  } catch (err) {
    console.error("ERROR", err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
