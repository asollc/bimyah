import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  priceId: string;
  returnUrl: string;
  quantity?: number;
  giftType?: "friend" | "random";
  recipientEmail?: string;
}

export function StripeEmbeddedCheckout({
  priceId,
  returnUrl,
  quantity,
  giftType,
  recipientEmail,
}: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        priceId,
        returnUrl,
        environment: getStripeEnvironment(),
        ...(quantity !== undefined && { quantity }),
        ...(giftType && { giftType }),
        ...(recipientEmail && { recipientEmail }),
      },
    });
    if (error || !data?.clientSecret) {
      throw new Error(error?.message || data?.error || "Failed to create checkout session");
    }
    return data.clientSecret;
  };

  return (
    <div id="checkout" className="w-full">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
