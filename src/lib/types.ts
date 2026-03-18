export interface CapabilityPricing {
  model: string;
  unit_price: number;
  currency: string;
}

export interface Capability {
  service_type: string;
  pricing: CapabilityPricing;
  description: string;
}
