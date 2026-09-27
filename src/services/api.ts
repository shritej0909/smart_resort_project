export type User = { id: string; name: string; email: string; role: 'guest' | 'manager'; room: string };
export type ServiceRequest = { id: string; user_id: string; category: string; title: string; detail: string; total: number; status: string; created_at: string; guest_name: string; room: string };
export type Feedback = { id: string; guest_name: string; room: string; rating: number; comment: string; created_at: string; analysis: { sentiment: string; aspects: string[]; recommendation: string; method: string } };
export type MenuItem = { id: string; name: string; description: string; price: number; kind: string; symbol: string; image?: string; badge?: string; category?: string };
export type RoomRecord = {
  room_number: string;
  floor: number;
  type: string;
  price_per_night: number;
  status: 'Occupied' | 'Available' | 'Cleaning' | 'Maintenance';
  guest_name: string | null;
  guest_age: number | null;
  guest_gender: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string | null;
  check_out: string | null;
  guest_count: number | null;
  vip_tier: string | null;
  special_requests: string | null;
  notes: string | null;
};
export type RoomsOverview = {
  stats: {
    total: number;
    occupied: number;
    available: number;
    cleaning: number;
    maintenance: number;
    occupancyRate: number;
  };
  rooms: RoomRecord[];
};
export async function api<T>(endpoint: string, method = 'GET', body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api${endpoint}`, {
      method,
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-SR360': 'portal' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data: any = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text || 'Invalid server response.' };
      }
    }
    if (!response.ok) {
      if (response.status === 401 && !endpoint.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
      throw new Error((data && data.error) || 'The request could not be completed.');
    }
    return data as T;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) throw new Error('We could not reach the resort. Please check your connection and try again.');
    throw error;
  } finally { window.clearTimeout(timer); }
}
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export const formatINRShort = (val: number) => {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)} L`;
  return money(val);
};

export type RoomCalculation = {
  type: string;
  total: number;
  occupied: number;
  available: number;
  cleaning: number;
  maintenance: number;
  pricePerNight: number;
  subtotal: number;
  potentialMax: number;
  occupancyRate: number;
  utilizationGap: number;
};

export type ShiftBreakdown = {
  shift: string;
  label: string;
  rooms: number;
  dining: number;
  services: number;
  total: number;
};

export type DayRevenueItem = {
  date: string;
  day: string;
  occupiedRooms: number;
  occupancyPct: number;
  roomRevenue: number;
  diningRevenue: number;
  servicesRevenue: number;
  totalRevenue: number;
  adr: number;
};

export type ThirtyDayPoint = {
  dayIndex: number;
  date: string;
  weekday: string;
  occupiedRooms: number;
  occupancyPct: number;
  revenueLakhs: number;
  totalRevenue: number;
};

export type SavedCalculation = {
  id: string;
  user_id: string;
  title: string;
  calculation_data: {
    targetOccupancy?: number;
    customRates?: Record<string, number>;
    diningPerGuest?: number;
    notes?: string;
    [key: string]: any;
  };
  daily_revenue: number;
  weekly_revenue: number;
  monthly_revenue: number;
  created_at: string;
};

export type RevenueOverview = {
  kpis: {
    totalRooms: number;
    occupiedRooms: number;
    overallOccupancy: number;
    dailyRoomRevenue: number;
    dailyDiningRevenue: number;
    dailyServicesRevenue: number;
    dailyTotalRevenue: number;
    adr: number;
    revpar: number;
    sevenDaysTotalRevenue: number;
    sevenDaysRoomNights: number;
    sevenDaysAvgDaily: number;
    thirtyDaysTotalRevenue: number;
    thirtyDaysRoomNights: number;
    thirtyDaysAvgOccupancy: number;
  };
  roomCalculations: RoomCalculation[];
  oneDayTracker: {
    today: string;
    totalRevenue: number;
    roomRevenue: number;
    diningRevenue: number;
    servicesRevenue: number;
    occupancyPct: number;
    occupiedRooms: number;
    adr: number;
    revpar: number;
    shifts: ShiftBreakdown[];
  };
  sevenDaysTracker: {
    totalRevenue: number;
    roomNights: number;
    days: DayRevenueItem[];
  };
  thirtyDaysTracker: {
    totalRevenue: number;
    roomNights: number;
    weeklySummary: { week: string; revenue: number; avgOcc: number }[];
    days: ThirtyDayPoint[];
  };
  savedCalculations: SavedCalculation[];
};

export type ServiceSlot = {
  time: string;
  status: 'Available' | 'Booked' | 'Completed' | 'Sold Out';
  room?: string | null;
};

export type ResortServiceRecord = {
  id: string;
  category: string;
  name: string;
  tagline: string;
  location: string;
  timing: string;
  price: number;
  unit: string;
  total_capacity: number;
  booked_slots: number;
  status: string;
  description: string;
  slots: ServiceSlot[];
  staff_assigned: string;
  popular_score: number;
  image: string;
  occupancyRate: number;
  available_slots: number;
  isNearCapacity: boolean;
  isSoldOut: boolean;
};

export type ServicesOverview = {
  stats: {
    totalServices: number;
    totalCapacity: number;
    totalBooked: number;
    availableSlots: number;
    overallOccupancy: number;
    highCapacityCount: number;
    activeAlertsCount: number;
  };
  services: ResortServiceRecord[];
};

export type Rate = {
  id: string;
  name?: string;
  amount: number;
  base_amount: number;
  applied_at: string | null;
  expires_at: string | null;
  duration_hours: number | null;
  is_surge: number | boolean;
  remaining_seconds?: number;
  remaining_formatted?: string;
  updated_at: string;
  updated_by?: string;
};

export type PricingTimelineEvent = {
  id: string;
  room_id: string;
  room_name: string;
  from_price: number;
  to_price: number;
  action: 'ML_SURGE_APPLIED' | 'AUTO_RESET_EXPIRED' | 'MANUAL_RESET_BASE';
  duration_hours: number | null;
  expires_at: string | null;
  created_at: string;
};

export type GroupedWearService = {
  id: string;
  name: string;
  category: string;
  location: string;
  icon: string;
  wearThreshold: number;
  weightHigh: number;
  weightNeutral: number;
  weightLow: number;
  currentWearUnits: number;
  wearPercentage: number;
  dailyBurnRate: number;
  projectedCycleDays: number;
  daysElapsed: number;
  daysRemaining: number;
  urgencyStatus: string;
  urgencyBadge: 'critical' | 'warning' | 'optimal';
  mathFormula: string;
  aiMechanism: string;
  lastMaintenance: string;
  nextDueDate: string;
  technicianTeam: string;
  estimatedCost: string;
  priority: string;
  standardRuntime: string;
};

export type MaintenanceActionLog = {
  id: string;
  service_id: string;
  service_name: string;
  action_type: string;
  performed_by: string;
  notes: string;
  created_at: string;
};

export type GroupedMaintenanceOverview = {
  activeScenario: 'scenario-60' | 'scenario-90' | 'scenario-offpeak' | 'custom';
  activeScenarioTitle: string;
  sessionMix: {
    totalDays: number;
    highDays: number;
    neutralDays: number;
    lowDays: number;
    highPct: number;
    neutralPct: number;
    lowPct: number;
  };
  services: GroupedWearService[];
  stats: {
    totalMonitoredServices: number;
    dueImmediatelyCount: number;
    warningCount: number;
    operationalCount: number;
    averageWearIndex: number;
    averageCycleDays: number;
  };
  actionLogs: MaintenanceActionLog[];
};

export type BookingRecord = {
  id: string;
  guest_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  room_number: string;
  room_type: string;
  check_in: string;
  check_out: string;
  nights: number;
  guests: number;
  price_per_night: number;
  total_amount: number;
  payment_status: 'PENDING' | 'SUCCESS' | 'FAILED';
  booking_status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'MANAGER_REVIEW';
  created_at: string;
};

export type BookingSummary = {
  room_number: string;
  room_type: string;
  roomNumber?: string;
  roomType?: string;
  floor?: number;
  check_in: string;
  check_out: string;
  checkIn?: string;
  checkOut?: string;
  nights: number;
  guests: number;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  guestName?: string;
  price_per_night: number;
  total_amount: number;
  pricePerNight?: number;
  totalAmount?: number;
};

export type BookingConfirmation = {
  ok: boolean;
  booking: {
    booking_id: string;
    guest_name: string;
    room_number: string;
    room_type: string;
    check_in: string;
    check_out: string;
    nights: number;
    guests: number;
    price_per_night: number;
    total_amount: number;
    payment_status: string;
    booking_status: string;
  };
  credentials: {
    guest_id: string;
    email: string;
    password: string;
  };
  bookingId?: string;
  guestName?: string;
  roomNumber?: string;
  roomType?: string;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  guests?: number;
  pricePerNight?: number;
  totalAmount?: number;
  guestLoginId?: string;
  guestPassword?: string;
};
