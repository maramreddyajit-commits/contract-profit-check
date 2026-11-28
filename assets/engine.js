// Single-contract profitability engine for commercial cleaning bids.
// Pure functions, no dependencies. Percentages are fractions (0.25 = 25%).
// All money is per month unless a name says otherwise.

const WEEKS_PER_MONTH = 52 / 12;

const DEFAULTS = Object.freeze({
  sqft: 10000,
  visitsPerWeek: 5,
  sqftPerHour: 2500,        // production rate: sq ft cleaned per labor hour
  extraHoursPerVisit: 0.5,  // setup, restocking, walkthrough, not covered by the rate
  wage: 16,                 // $/hour paid to the cleaner
  burdenPct: 0.25,          // payroll taxes, workers comp, other labor-linked cost
  suppliesMonthly: 150,
  equipmentMonthly: 100,    // equipment wear, replacement, vehicle share
  travelPerVisit: 8,        // fuel and vehicle cost per visit
  overheadPct: 0.10,        // insurance, admin, software, as a share of revenue
  targetMarginPct: 0.15,    // net profit you need on this contract
  quotedMonthly: 3000,      // the price you plan to bid or have been offered
  overruns: [0.10, 0.20],   // "what if the crew needs this much more time"
});

function num(v, name, errors, { min = -Infinity, positive = false } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) { errors.push(`${name} must be a number`); return NaN; }
  if (positive && n <= 0) errors.push(`${name} must be greater than 0`);
  else if (n < min) errors.push(`${name} must be at least ${min}`);
  return n;
}

function evaluate(input = {}) {
  const i = { ...DEFAULTS, ...input };
  const errors = [];
  const sqft = num(i.sqft, 'Square feet', errors, { positive: true });
  // Recurring work uses visitsPerWeek; one-off or irregular work can pass visitsPerMonth directly.
  const hasMonthly = input.visitsPerMonth !== undefined && input.visitsPerMonth !== null;
  const visitsPerWeek = hasMonthly ? NaN : num(i.visitsPerWeek, 'Visits per week', errors, { positive: true });
  const visitsMonthlyIn = hasMonthly ? num(input.visitsPerMonth, 'Visits per month', errors, { positive: true }) : NaN;
  const sqftPerHour = num(i.sqftPerHour, 'Production rate', errors, { positive: true });
  const extra = num(i.extraHoursPerVisit, 'Extra hours per visit', errors, { min: 0 });
  const wage = num(i.wage, 'Wage', errors, { min: 0 });
  const burden = num(i.burdenPct, 'Labor burden', errors, { min: 0 });
  const supplies = num(i.suppliesMonthly, 'Supplies', errors, { min: 0 });
  const equipment = num(i.equipmentMonthly, 'Equipment', errors, { min: 0 });
  const travel = num(i.travelPerVisit, 'Travel per visit', errors, { min: 0 });
  const overheadPct = num(i.overheadPct, 'Overhead', errors, { min: 0 });
  const targetMargin = num(i.targetMarginPct, 'Target margin', errors, { min: 0 });
  const quoted = num(i.quotedMonthly, 'Quoted price', errors, { min: 0 });
  if (overheadPct + targetMargin >= 1) errors.push('Overhead plus target margin must be under 100%');
  if (errors.length) return { ok: false, errors };

  const visitsPerMonth = hasMonthly ? visitsMonthlyIn : visitsPerWeek * WEEKS_PER_MONTH;
  const hoursPerVisit = sqft / sqftPerHour + extra;
  const laborHours = hoursPerVisit * visitsPerMonth;
  const loadedWage = wage * (1 + burden);
  const travelCost = travel * visitsPerMonth;

  const costAt = (hours) => hours * loadedWage + supplies + equipment + travelCost;
  const directCost = costAt(laborHours);

  const breakEven = directCost / (1 - overheadPct);
  const targetPrice = directCost / (1 - overheadPct - targetMargin);

  const outcomeAt = (hours) => {
    const direct = costAt(hours);
    const overhead = overheadPct * quoted;
    const profit = quoted - direct - overhead;
    return {
      laborHours: hours,
      directCost: direct,
      profit,
      margin: quoted > 0 ? profit / quoted : NaN,
    };
  };

  const base = outcomeAt(laborHours);
  // Compare at cent precision so float noise at exactly break-even or target
  // does not flip the verdict.
  const cents = Math.round(base.profit * 100);
  const targetCents = Math.round(targetMargin * quoted * 100);
  const verdict = quoted === 0 ? 'PASS'
    : cents >= targetCents ? 'GOOD'
    : cents >= 0 ? 'NEGOTIATE' : 'PASS';

  return {
    ok: true,
    errors: [],
    visitsPerMonth,
    hoursPerVisit,
    laborHours,
    loadedWage,
    laborCost: laborHours * loadedWage,
    suppliesCost: supplies,
    equipmentCost: equipment,
    travelCost,
    directCost,
    overheadAtQuote: overheadPct * quoted,
    breakEven,
    targetPrice,
    profit: base.profit,
    margin: base.margin,
    revenuePerLaborHour: quoted / laborHours,
    profitPerLaborHour: base.profit / laborHours,
    pricePerSqft: quoted / sqft,
    verdict,
    // How much less than the target price you are quoting (positive = under target price).
    gapToTarget: targetPrice - quoted,
    sensitivity: (i.overruns || []).map((o) => ({ overrun: o, ...outcomeAt(laborHours * (1 + o)) })),
  };
}
