import { autumnHandler } from "autumn-js/next";
import { auth } from "@/lib/auth"; // swap this for your auth setup
import { headers } from "next/headers";

export const { GET, POST } = autumnHandler({
  identify: async () => {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    return {
      customerId: session?.user.id, // required: unique ID for this user
      customerData: {               // optional: info Autumn stores
        name: session?.user.name,
        email: session?.user.email,
      },
    };
  },
});