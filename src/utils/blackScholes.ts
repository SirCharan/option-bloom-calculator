
/**
 * Black-Scholes Option Pricing Model and Greeks Calculator
 * 
 * This utility provides functions to calculate option premiums and Greeks
 * using the Black-Scholes-Merton model.
 */

// Standard normal cumulative distribution function
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1 / (1 + p * x);
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * erf);
}

// Standard normal probability density function
export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Black-Scholes-Merton formula for European options
export function calculateOptionPremium(
  spotPrice: number,     // Current price of the underlying asset
  strikePrice: number,   // Strike price of the option
  timeToExpiry: number,  // Time to expiry in years
  volatility: number,    // Implied volatility as a decimal (e.g., 0.2 for 20%)
  riskFreeRate: number,  // Risk-free interest rate as a decimal
  isCall: boolean        // true for call option, false for put option
): number {
  // Check for invalid inputs
  if (spotPrice <= 0 || strikePrice <= 0 || timeToExpiry <= 0 || volatility <= 0) {
    return 0;
  }

  // Calculate d1 and d2 parameters
  const d1 = (Math.log(spotPrice / strikePrice) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / 
            (volatility * Math.sqrt(timeToExpiry));
  const d2 = d1 - volatility * Math.sqrt(timeToExpiry);

  // Calculate option premium
  if (isCall) {
    // Call option: C = S * N(d1) - K * e^(-rt) * N(d2)
    return spotPrice * normalCDF(d1) - strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(d2);
  } else {
    // Put option: P = K * e^(-rt) * N(-d2) - S * N(-d1)
    return strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(-d2) - spotPrice * normalCDF(-d1);
  }
}

// Calculate all option Greeks
export function calculateGreeks(
  spotPrice: number,     // Current price of the underlying asset
  strikePrice: number,   // Strike price of the option
  timeToExpiry: number,  // Time to expiry in years
  volatility: number,    // Implied volatility as a decimal
  riskFreeRate: number,  // Risk-free interest rate as a decimal
  isCall: boolean        // true for call option, false for put option
): {
  delta: number;  // Change in option price / Change in underlying price
  gamma: number;  // Rate of change of delta with respect to underlying price
  theta: number;  // Rate of change of option price with respect to time (daily)
  vega: number;   // Rate of change of option price with respect to volatility (per 1% change)
  rho: number;    // Rate of change of option price with respect to interest rate (per 1% change)
} {
  // Check for invalid inputs
  if (spotPrice <= 0 || strikePrice <= 0 || timeToExpiry <= 0 || volatility <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  // Calculate d1 and d2 parameters
  const d1 = (Math.log(spotPrice / strikePrice) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) / 
            (volatility * Math.sqrt(timeToExpiry));
  const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
  
  // Calculate Greeks
  let delta: number;
  
  if (isCall) {
    // Delta for call option: N(d1)
    delta = normalCDF(d1);
  } else {
    // Delta for put option: N(d1) - 1
    delta = normalCDF(d1) - 1;
  }
  
  // Gamma (same for both call and put): N'(d1) / (S * σ * √t)
  const gamma = normalPDF(d1) / (spotPrice * volatility * Math.sqrt(timeToExpiry));
  
  // Vega (same for both call and put): S * N'(d1) * √t * 0.01
  const vega = spotPrice * normalPDF(d1) * Math.sqrt(timeToExpiry) * 0.01;
  
  // Theta calculation (different for call and put)
  const term1 = -(spotPrice * volatility * normalPDF(d1)) / (2 * Math.sqrt(timeToExpiry));
  const term2 = riskFreeRate * strikePrice * Math.exp(-riskFreeRate * timeToExpiry);
  
  let theta: number;
  if (isCall) {
    // Theta for call (daily): -S * σ * N'(d1) / (2 * √t) - r * K * e^(-rt) * N(d2)
    theta = (term1 - term2 * normalCDF(d2)) / 365;
  } else {
    // Theta for put (daily): -S * σ * N'(d1) / (2 * √t) + r * K * e^(-rt) * N(-d2)
    theta = (term1 + term2 * normalCDF(-d2)) / 365;
  }
  
  // Rho calculation (different for call and put) - per 1% change
  let rho: number;
  if (isCall) {
    // Rho for call: K * t * e^(-rt) * N(d2) * 0.01
    rho = strikePrice * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(d2) * 0.01;
  } else {
    // Rho for put: -K * t * e^(-rt) * N(-d2) * 0.01
    rho = -strikePrice * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * normalCDF(-d2) * 0.01;
  }
  
  return {
    delta,
    gamma,
    theta,
    vega,
    rho
  };
}

// Convert date to time to expiry in years
export function dateToTimeToExpiry(expiryDate: Date): number {
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays / 365; // Convert days to years
}

// Convert duration (hours, minutes, seconds) to time to expiry in years
export function durationToTimeToExpiry(hours: number, minutes: number, seconds: number): number {
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const totalDays = totalSeconds / (24 * 3600);
  return totalDays / 365; // Convert days to years
}
