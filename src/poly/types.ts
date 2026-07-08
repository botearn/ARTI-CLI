export interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface PolyEvent {
  id?: string;
  slug?: string;
  source?: string;
  title?: string;
  category?: string;
  endDate?: string;
  closeTime?: string;
  volume?: number;
  volume24hr?: number;
  markets?: PolyMarket[];
}

export interface PolyMarket {
  id?: string;
  slug?: string;
  ticker?: string;
  question?: string;
  title?: string;
  outcomes?: string[];
  outcomePrices?: number[];
  yesPrice?: number;
  noPrice?: number;
  volume?: number;
  volume24hr?: number;
  liquidityNum?: number;
  active?: boolean;
  closed?: boolean;
}

export interface SummaryData {
  topEvents?: PolyEvent[];
  artiPick?: ArtiPickData;
}

export interface ArtiPickData {
  high?: ArtiPick[];
  moderate?: ArtiPick[];
}

export interface ArtiPick {
  canonicalEvent?: {
    title?: string;
    category?: string;
    closeTime?: string;
  };
  polymarket?: {
    eventSlug?: string;
    marketSlug?: string;
    title?: string;
    yesPrice?: number;
  };
  kalshi?: {
    eventSlug?: string;
    marketSlug?: string;
    title?: string;
    yesPrice?: number;
  };
  priceDiff?: number;
  matchConfidence?: number;
  matchQuality?: string;
}
