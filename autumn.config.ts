import { feature, plan, item } from "atmn";

export const analyses = feature({
  id: "analyses",
  name: "M&A Document Analyses",
  type: "metered",
  consumable: true,
});

export const free = plan({
  id: "free",
  name: "Free",
  autoEnable: true,
  items: [
    item({
      featureId: analyses.id,
      included: 1,
      reset: { interval: "month" },
    }),
  ],
});

export const professional = plan({
  id: "professional",
  name: "Professional",
  price: { amount: 49900, interval: "month" },
  items: [
    item({
      featureId: analyses.id,
      included: 10,
      reset: { interval: "month" },
    }),
  ],
});

export const business = plan({
  id: "business",
  name: "Business",
  price: { amount: 129900, interval: "month" },
  items: [
    item({
      featureId: analyses.id,
      included: 50,
      reset: { interval: "month" },
    }),
  ],
});

export const enterprise = plan({
  id: "enterprise",
  name: "Enterprise",
  price: { amount: 350000, interval: "month" },
  items: [
    item({
      featureId: analyses.id,
      included: 999999, // effectively unlimited
      reset: { interval: "month" },
    }),
  ],
});

export default {
  features: [analyses],
  plans: [free, professional, business, enterprise],
};
