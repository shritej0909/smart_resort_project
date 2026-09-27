import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CloudRain,
  Sun,
  Wind,
  Thermometer,
  Droplets,
  AlertTriangle,
  MapPin,
  RotateCcw,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Activity,
  Layers,
  Radio,
  Info,
  ArrowRight,
  Clock,
  Building2,
  Umbrella,
  Compass,
  Zap,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  ExternalLink,
  Map
} from 'lucide-react';
import { api } from '../services/api';
import GeospatialLeafletMap from '../components/GeospatialLeafletMap';

interface FacilityNode {
  id: string;
  name: string;
  type: 'outdoor' | 'indoor' | 'accommodation' | 'covered' | 'infrastructure';
  category: string;
  lat: number;
  lng: number;
  capacity: number;
  baseUtilization: number;
  simulatedUtilization: number;
  status: 'Optimal' | 'Caution' | 'Suspended' | 'Peak Capacity' | 'High Influx' | 'Fully Booked' | 'Active Refuge' | 'Heavy Load';
  alert: string | null;
  description: string;
  rainThresholdMm?: number;
}

interface CascadeStep {
  step: number;
  stage: string;
  name: string;
  detail: string;
  impact?: string;
  severity?: string;
}

interface PublicSignalItem {
  id: string;
  source: string;
  category: string;
  title: string;
  summary: string;
  timestamp: string;
  timeAgo: string;
  severity: 'low' | 'normal' | 'medium' | 'high' | 'critical';
  relevance: string;
  relationship: string;
  verified: boolean;
}

interface SimulationState {
  scenario: {
    rainfall: number;
    temperature: number;
    wind: number;
    duration: number;
    isSimulated: boolean;
  };
  metrics: {
    outdoorDemand: { baseline: number; simulated: number; delta: number; unit: string; estimate_range: string };
    indoorDemand: { baseline: number; simulated: number; delta: number; unit: string; estimate_range: string };
    restaurantDemand: { baseline: number; simulated: number; delta: number; unit: string; estimate_range: string };
    roomServiceDemand: { baseline: number; simulated: number; delta: number; unit: string; estimate_range: string };
    serviceDemand: { baseline: number; simulated: number; delta: number; unit: string; estimate_range: string };
    maintenancePressure: { baseline: number; simulated: number; delta: number; unit: string; estimate_range: string };
    operationalRisk: { level: string; color: string; score: number };
  };
  facilities: FacilityNode[];
  cascade: CascadeStep[];
  recommendations: { priority: string; title: string; description: string }[];
  calculated_at: string;
}

interface LiveWeatherTelemetry {
  source: string;
  location: { name: string; region: string; latitude: number; longitude: number };
  current: {
    temperature: number;
    feels_like: number;
    humidity: number;
    precipitation: number;
    wind_speed: number;
    condition: string;
    icon: string;
    severity: string;
  };
  forecast_today: {
    temp_max: number;
    temp_min: number;
    precipitation_sum: number;
    rain_probability: number;
    wind_max: number;
  };
  forecast_tomorrow: {
    temp_max: number;
    temp_min: number;
    precipitation_sum: number;
    rain_probability: number;
    condition: string;
    wind_max: number;
  };
  hourly: { time: string; temp: number; rain_prob: number; precipitation: number; condition: string }[];
}

export default function WeatherDigitalTwin({ navigate }: { navigate: (page: string) => void }) {
  // Live Data State
  const [liveWeather, setLiveWeather] = useState<LiveWeatherTelemetry | null>(null);
  const [signals, setSignals] = useState<PublicSignalItem[]>([]);
  const [liveOccupancy, setLiveOccupancy] = useState<number>(78);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // What-If Simulator Interactive Controls
  const [rainfall, setRainfall] = useState<number>(0);
  const [temperature, setTemperature] = useState<number>(29);
  const [wind, setWind] = useState<number>(14);
  const [duration, setDuration] = useState<number>(4);

  // Simulated Output State
  const [simResult, setSimResult] = useState<SimulationState | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<FacilityNode | null>(null);
  const [activeTab, setActiveTab] = useState<'simulation' | 'signals' | 'cascade'>('simulation');

  // Load initial digital twin state
  const fetchDigitalTwinState = useCallback(async () => {
    try {
      setSyncing(true);
      const res = await api<{
        digital_twin: any;
        live_resort_state: { occupancy_rate: number; total_rooms: number; occupied_rooms: number };
        live_weather: LiveWeatherTelemetry;
        baseline_impact: SimulationState;
        public_signals: { signals: PublicSignalItem[] };
      }>('/digital-twin/weather/state');

      setLiveWeather(res.live_weather);
      setLiveOccupancy(res.live_resort_state.occupancy_rate);
      setSignals(res.public_signals?.signals || []);

      // Initialize sliders to live weather values
      if (res.live_weather?.current) {
        setRainfall(res.live_weather.current.precipitation || 0);
        setTemperature(res.live_weather.current.temperature || 29);
        setWind(res.live_weather.current.wind_speed || 14);
      }

      setSimResult(res.baseline_impact);
      if (res.baseline_impact?.facilities?.length) {
        setSelectedFacility(res.baseline_impact.facilities[0]);
      }
    } catch (e: any) {
      console.warn('Digital twin initial fetch error:', e.message);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchDigitalTwinState();
  }, [fetchDigitalTwinState]);

  // Run What-If Simulation whenever slider changes (In-Memory execution)
  const runSimulation = useCallback(async (r: number, t: number, w: number, d: number) => {
    try {
      const res = await api<SimulationState>('/digital-twin/weather/simulate', 'POST', {
        rainfall: r,
        temperature: t,
        wind: w,
        duration: d
      });
      setSimResult(res);
      if (selectedFacility) {
        const updated = res.facilities.find(f => f.id === selectedFacility.id);
        if (updated) setSelectedFacility(updated);
      }
    } catch (e: any) {
      console.error('Simulation error:', e.message);
    }
  }, [selectedFacility]);

  // Handle immediate slider changes
  const handleRainfallChange = (val: number) => {
    setRainfall(val);
    runSimulation(val, temperature, wind, duration);
  };

  const handleTemperatureChange = (val: number) => {
    setTemperature(val);
    runSimulation(rainfall, val, wind, duration);
  };

  const handleWindChange = (val: number) => {
    setWind(val);
    runSimulation(rainfall, temperature, val, duration);
  };

  const handleDurationChange = (val: number) => {
    setDuration(val);
    runSimulation(rainfall, temperature, wind, val);
  };

  // Preset Scenario Handlers
  const applyPreset = (preset: 'sunny' | 'monsoon' | 'cyclone' | 'heatwave') => {
    let r = 0, t = 29, w = 12, d = 4;
    if (preset === 'sunny') {
      r = 0; t = 29; w = 12; d = 6;
    } else if (preset === 'monsoon') {
      r = 75; t = 25; w = 48; d = 6;
    } else if (preset === 'cyclone') {
      r = 120; t = 23; w = 78; d = 12;
    } else if (preset === 'heatwave') {
      r = 0; t = 42; w = 8; d = 8;
    }
    setRainfall(r);
    setTemperature(t);
    setWind(w);
    setDuration(d);
    runSimulation(r, t, w, d);
  };

  const resetToLive = () => {
    if (liveWeather?.current) {
      const r = liveWeather.current.precipitation || 0;
      const t = liveWeather.current.temperature || 29;
      const w = liveWeather.current.wind_speed || 14;
      setRainfall(r);
      setTemperature(t);
      setWind(w);
      setDuration(4);
      runSimulation(r, t, w, 4);
    }
  };

  const isSimulatedActive = rainfall > (liveWeather?.current.precipitation || 0) ||
    temperature !== (liveWeather?.current.temperature || 29) ||
    wind !== (liveWeather?.current.wind_speed || 14);

  return (
    <div className="flex flex-col gap-6 p-2 md:p-6 max-w-7xl mx-auto">
      {/* ── Top Header Banner ────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white p-6 md:p-8 rounded-3xl shadow-xl relative overflow-hidden border border-emerald-900/40">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Layers className="w-80 h-80" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                HACKCELESTIAL 3.0 CHALLENGE 1
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/80 border border-white/10">
                DIGITAL TWIN V1.4
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight font-serif text-white">
              Weather-Driven Digital Twin
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Real-time synchronization with Open-Meteo Goa telemetry and isolated in-memory What-If meteorological simulation across all 150 resort keys and 7 functional facilities.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDigitalTwinState}
              disabled={syncing}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur border border-white/20 transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Live Telemetry'}
            </button>
            <div className="text-right hidden sm:block">
              <div className="text-[11px] text-emerald-300 font-mono">GOA COASTAL PROPERTY</div>
              <div className="text-xs text-white/70">15.2993° N, 74.1240° E</div>
            </div>
          </div>
        </div>

        {/* Real vs Simulation State Protocol Notice */}
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" /> Real Operational DB Protected
            </span>
            <span className="text-slate-400">
              Simulation runs in an isolated in-memory projection matrix. Zero changes are committed to production SQLite tables.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              REAL LIVE DATA
            </span>
            <span className="text-slate-400">vs</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              SIMULATED DIGITAL TWIN
            </span>
          </div>
        </div>
      </div>

      {/* ── Section A & B: Live Weather & Baseline Operational State ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Live Weather Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-emerald-600" />
              Live Weather
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
              LIVE TELEMETRY
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-3xl font-extrabold text-slate-900">
                {liveWeather ? `${liveWeather.current.temperature}°C` : '27°C'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium">
                {liveWeather ? liveWeather.current.condition : 'Partly Cloudy'} · Feels like {liveWeather?.current.feels_like || 30}°C
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600">
              {liveWeather?.current.precipitation && liveWeather.current.precipitation > 0 ? (
                <CloudRain className="w-7 h-7 text-blue-600 animate-bounce" />
              ) : (
                <Sun className="w-7 h-7 text-amber-500" />
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Precip: <b>{liveWeather?.current.precipitation || 0} mm</b></span>
            <span>Humidity: <b>{liveWeather?.current.humidity || 78}%</b></span>
            <span>Wind: <b>{liveWeather?.current.wind_speed || 14} km/h</b></span>
          </div>
        </div>

        {/* Live Resort Occupancy */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Resort Occupancy
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              SQLITE REAL DATA
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-3xl font-extrabold text-slate-900">{liveOccupancy}%</div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium">
                {Math.round((liveOccupancy / 100) * 150)} of 150 keys active
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600">
              <Activity className="w-7 h-7" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Garden: <b>35 rooms</b></span>
            <span>Suites: <b>65 keys</b></span>
            <span>Villas: <b>50 units</b></span>
          </div>
        </div>

        {/* Tomorrow's Official Forecast */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-600" />
              Forecast Tomorrow
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
              METEO FORECAST
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-3xl font-extrabold text-slate-900">
                {liveWeather ? `${liveWeather.forecast_tomorrow.temp_max}° / ${liveWeather.forecast_tomorrow.temp_min}°` : '30° / 24°'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium truncate max-w-[140px]">
                {liveWeather?.forecast_tomorrow.condition || 'Scattered Rain'}
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-purple-50 text-purple-600">
              <CloudRain className="w-7 h-7" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Rain Prob: <b>{liveWeather?.forecast_tomorrow.rain_probability || 60}%</b></span>
            <span>Est. Rain: <b>{liveWeather?.forecast_tomorrow.precipitation_sum || 8.5} mm</b></span>
          </div>
        </div>

        {/* Operational Risk Index */}
        <div className={`rounded-2xl p-5 shadow-sm border flex flex-col justify-between transition-colors ${
          simResult?.metrics.operationalRisk.level === 'Critical'
            ? 'bg-red-50 border-red-200'
            : simResult?.metrics.operationalRisk.level === 'High'
              ? 'bg-amber-50 border-amber-200'
              : 'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-slate-700" />
              Twin Risk Index
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              simResult?.metrics.operationalRisk.level === 'Critical'
                ? 'bg-red-200 text-red-900'
                : simResult?.metrics.operationalRisk.level === 'High'
                  ? 'bg-amber-200 text-amber-900'
                  : 'bg-emerald-200 text-emerald-900'
            }`}>
              {isSimulatedActive ? 'SIMULATED' : 'LIVE'}
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-3xl font-extrabold text-slate-900">
                {simResult?.metrics.operationalRisk.level || 'Low'}
              </div>
              <div className="text-xs text-slate-600 mt-0.5 font-medium">
                Impact score: {simResult?.metrics.operationalRisk.score || 25} / 100
              </div>
            </div>
            <div className={`p-2.5 rounded-2xl ${
              simResult?.metrics.operationalRisk.level === 'Critical'
                ? 'bg-red-100 text-red-600'
                : simResult?.metrics.operationalRisk.level === 'High'
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-emerald-100 text-emerald-600'
            }`}>
              <AlertTriangle className="w-7 h-7" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200/60 text-[11px] text-slate-600 flex justify-between">
            <span>Beach Status: <b>{rainfall > 8 ? 'Suspended' : 'Open'}</b></span>
            <span>Indoor Surge: <b>+{simResult?.metrics.indoorDemand.delta || 0}%</b></span>
          </div>
        </div>
      </div>

      {/* ── Section C: Real Live Geospatial Weather Map (OpenStreetMap Tiles) ───── */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 font-serif">
                <Map className="w-5 h-5 text-emerald-600" />
                Live Geospatial Weather Map — South Goa Resort Perimeter
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                REAL GEOGRAPHIC TILES
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                OPENSTREETMAP
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Authentic interactive geographic map centered at The Palms Resort (15.2998° N, 74.1240° E). Visualizes geographic tiles, pan/zoom, dynamic weather impact radius, and facility micro-cluster markers.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <span className="text-slate-500 font-medium">Map Coordinates:</span>
            <span className="font-mono font-bold text-slate-800">15.2998° N, 74.1240° E</span>
          </div>
        </div>

        {/* Real Leaflet OpenStreetMap Component */}
        <GeospatialLeafletMap
          resortLat={15.2998}
          resortLng={74.1240}
          resortName="Smart Resort 360 (The Palms)"
          liveWeather={liveWeather?.current ? {
            temperature: liveWeather.current.temperature,
            rainfall: liveWeather.current.precipitation,
            wind_speed: liveWeather.current.wind_speed,
            condition: liveWeather.current.condition
          } : null}
          rainfall={rainfall}
          temperature={temperature}
          wind={wind}
          isSimulatedActive={isSimulatedActive}
          facilities={simResult?.facilities || []}
          selectedFacility={selectedFacility}
          onSelectFacility={(fac) => setSelectedFacility(fac)}
        />
      </div>

      {/* ── Section D: Digital Twin Facility Impact Layout ───── */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 font-serif">
                <Compass className="w-5 h-5 text-emerald-600" />
                Digital Twin Facility Impact Layout
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                CAMPUS MICRO-ZONE MODEL
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Tactical micro-climate layout of the 7 resort facility zones showing real-time guest migration patterns and rain particle dynamics.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Optimal
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Influx / Surge
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Suspended / Full
            </span>
          </div>
        </div>

        {/* Geospatial Map Canvas Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Visual Interactive Map Canvas */}
          <div className="lg:col-span-2 relative h-[420px] rounded-2xl bg-gradient-to-b from-sky-100 via-emerald-50 to-amber-50 border border-slate-200 overflow-hidden shadow-inner flex flex-col justify-between p-4">
            {/* Arabian Sea Coastline Backdrop */}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-cyan-600/30 to-transparent pointer-events-none flex items-end p-4">
              <span className="text-xs font-bold tracking-widest text-cyan-900/60 uppercase font-mono">
                🌊 Arabian Sea Coastline — South Goa (West Waterfront)
              </span>
            </div>

            {/* Rain simulation particle overlay */}
            {rainfall > 0 && (
              <div
                className="absolute inset-0 pointer-events-none opacity-40 z-10"
                style={{
                  backgroundImage: `radial-gradient(circle, #0284c7 1px, transparent 1px)`,
                  backgroundSize: `${Math.max(10, 40 - Math.min(25, rainfall * 0.3))}px ${Math.max(10, 40 - Math.min(25, rainfall * 0.3))}px`,
                  animation: `pulse ${Math.max(0.5, 2 - rainfall * 0.015)}s infinite`
                }}
              />
            )}

            {/* Map Top Status Bar */}
            <div className="relative z-20 flex items-center justify-between">
              <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 shadow-sm flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                <span>15.2993° N, 74.1240° E · South Goa</span>
              </div>

              <div className="bg-slate-900/80 backdrop-blur text-white px-3 py-1.5 rounded-xl text-xs flex items-center gap-2 shadow-sm font-mono">
                <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
                <span>Simulated Rain: {rainfall} mm/h</span>
              </div>
            </div>

            {/* Facility Markers positioned on the resort coordinate map */}
            <div className="relative z-20 w-full h-full flex flex-wrap items-center justify-around p-4 gap-4">
              {simResult?.facilities.map(fac => {
                const isSelected = selectedFacility?.id === fac.id;
                const isSuspended = fac.status === 'Suspended' || fac.status === 'Fully Booked';
                const isSurge = fac.status === 'Peak Capacity' || fac.status === 'High Influx' || fac.status === 'Active Refuge';

                return (
                  <motion.button
                    key={fac.id}
                    onClick={() => setSelectedFacility(fac)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative p-3.5 rounded-2xl transition-all shadow-md text-left flex items-start gap-3 border ${
                      isSelected
                        ? 'ring-4 ring-emerald-500/30 border-emerald-600 bg-white shadow-xl'
                        : isSuspended
                          ? 'bg-red-50/95 border-red-300 text-red-900'
                          : isSurge
                            ? 'bg-amber-50/95 border-amber-300 text-amber-900'
                            : 'bg-white/95 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className={`p-2 rounded-xl text-white ${
                      isSuspended ? 'bg-red-600' : isSurge ? 'bg-amber-600' : 'bg-emerald-600'
                    }`}>
                      {fac.type === 'outdoor' ? (
                        <Sun className="w-4 h-4" />
                      ) : fac.type === 'indoor' ? (
                        <Building2 className="w-4 h-4" />
                      ) : fac.type === 'covered' ? (
                        <Umbrella className="w-4 h-4" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold leading-tight">{fac.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isSuspended ? 'bg-red-500' : isSurge ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                        {fac.status} · {fac.simulatedUtilization}% Load
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Map Legend Footer */}
            <div className="relative z-20 text-[11px] text-slate-500 flex items-center justify-between bg-white/80 backdrop-blur p-2 rounded-xl border border-slate-200/60">
              <span>Smart Resort 360 Campus (150 Keys · 22 Coastal Acres)</span>
              <span className="font-semibold text-emerald-800">Geospatial Digital Twin Layer Active</span>
            </div>
          </div>

          {/* Facility Detail Inspector Panel */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between">
            {selectedFacility ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                    {selectedFacility.category}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    selectedFacility.status === 'Suspended' || selectedFacility.status === 'Fully Booked'
                      ? 'bg-red-100 text-red-800'
                      : selectedFacility.status === 'Peak Capacity' || selectedFacility.status === 'High Influx'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {selectedFacility.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 font-serif">
                    {selectedFacility.name}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {selectedFacility.description}
                  </p>
                </div>

                {/* Live vs Simulated Comparison on Facility */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Baseline Utilization:</span>
                    <span className="font-semibold text-slate-700">{selectedFacility.baseUtilization}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Simulated Weather Load:</span>
                    <span className="font-bold text-slate-900">{selectedFacility.simulatedUtilization}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Max Guest Capacity:</span>
                    <span className="font-semibold text-slate-700">{selectedFacility.capacity} guests</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Rain Threshold:</span>
                    <span className="font-semibold text-slate-700">
                      {selectedFacility.rainThresholdMm && selectedFacility.rainThresholdMm > 100 ? 'All-Weather' : selectedFacility.rainThresholdMm !== undefined ? `${selectedFacility.rainThresholdMm} mm/h` : 'All-Weather'}
                    </span>
                  </div>
                </div>

                {selectedFacility.alert && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <b className="block">Facility Weather Advisory</b>
                      {selectedFacility.alert}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                Select a facility marker on the map to inspect operational telemetry.
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-200 text-[11px] text-slate-500 flex justify-between items-center">
              <span>Telemetry Coordinates: {selectedFacility ? `${selectedFacility.lat}, ${selectedFacility.lng}` : 'Goa Campus'}</span>
              <span className="text-emerald-700 font-semibold">Real-Time Sync</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section D & E: What-If Weather Simulator & Side-by-Side Comparison ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* What-If Simulator Interactive Controls */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 font-serif">
                <Sliders className="w-5 h-5 text-emerald-600" />
                What-If Simulator
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                IN-MEMORY ONLY
              </span>
            </div>

            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Drag parameters to evaluate cascading operational demand without modifying real reservation records.
            </p>

            {/* Quick Presets */}
            <div className="mb-6">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-2">
                Scenario Presets
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => applyPreset('sunny')}
                  className="px-2.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium transition text-left"
                >
                  ☀️ Sunny Day (0mm)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('monsoon')}
                  className="px-2.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 font-medium transition text-left"
                >
                  🌧️ Monsoon (75mm)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('cyclone')}
                  className="px-2.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 font-medium transition text-left"
                >
                  🌪️ Cyclone (120mm)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('heatwave')}
                  className="px-2.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-medium transition text-left"
                >
                  🔥 Heatwave (42°C)
                </button>
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-5">
              {/* Rainfall Slider (Mandatory Challenge Requirement) */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <CloudRain className="w-3.5 h-3.5 text-blue-600" />
                    Precipitation / Rainfall
                  </span>
                  <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                    {rainfall} mm / hr
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="150"
                  step="5"
                  value={rainfall}
                  onChange={e => handleRainfallChange(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>0 mm (Dry)</span>
                  <span>40 mm (Heavy)</span>
                  <span>150 mm (Extreme)</span>
                </div>
              </div>

              {/* Temperature Slider */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-amber-600" />
                    Ambient Temperature
                  </span>
                  <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    {temperature}°C
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="50"
                  step="1"
                  value={temperature}
                  onChange={e => handleTemperatureChange(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>10°C</span>
                  <span>29°C (Goa Norm)</span>
                  <span>50°C</span>
                </div>
              </div>

              {/* Wind Speed Slider */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Wind className="w-3.5 h-3.5 text-teal-600" />
                    Coastal Wind Speed
                  </span>
                  <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-200">
                    {wind} km / h
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={wind}
                  onChange={e => handleWindChange(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>0 km/h (Calm)</span>
                  <span>35 km/h (Draft)</span>
                  <span>100 km/h (Gale)</span>
                </div>
              </div>

              {/* Duration Slider */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    Event Duration
                  </span>
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200">
                    {duration} Hours
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="24"
                  step="1"
                  value={duration}
                  onChange={e => handleDurationChange(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={resetToLive}
              className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset to Live Weather
            </button>
            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
              Reactive Instant Model
            </span>
          </div>
        </div>

        {/* Current State vs Simulated State (Before → After Matrix) */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-serif">
                  Current Live State vs Simulated Twin State
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Side-by-side operational comparison showing predicted demand shifts and uncertainty ranges.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs self-start">
                <button
                  type="button"
                  onClick={() => setActiveTab('simulation')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    activeTab === 'simulation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Comparison
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('cascade')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    activeTab === 'cascade' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cascade Chain
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('signals')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    activeTab === 'signals' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Public Signals ({signals.length})
                </button>
              </div>
            </div>

            {/* Tab 1: Operational Comparison Matrix */}
            {activeTab === 'simulation' && simResult && (
              <div className="space-y-3.5 mt-4">
                {/* Outdoor Demand Shift */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <b className="text-xs text-slate-900 block">Outdoor Activities & Beach Recreation</b>
                    <span className="text-[11px] text-slate-500">
                      Uncertainty Range: {simResult.metrics.outdoorDemand.estimate_range}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-right">
                      <small className="text-slate-400 block text-[10px] font-bold">LIVE BASELINE</small>
                      <span className="font-semibold text-slate-600">85%</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <div className="text-right">
                      <small className="text-amber-700 block text-[10px] font-bold">SIMULATED</small>
                      <span className="font-extrabold text-slate-900 text-sm">{simResult.metrics.outdoorDemand.simulated}%</span>
                    </div>
                    <span className={`px-2 py-1 rounded-lg font-bold text-xs flex items-center gap-1 ${
                      simResult.metrics.outdoorDemand.delta < 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      <TrendingDown className="w-3 h-3" />
                      {simResult.metrics.outdoorDemand.delta}%
                    </span>
                  </div>
                </div>

                {/* Indoor Activity Demand Shift */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <b className="text-xs text-slate-900 block">Indoor Wellness, Spa & Kids Club Dwell Time</b>
                    <span className="text-[11px] text-slate-500">
                      Uncertainty Range: {simResult.metrics.indoorDemand.estimate_range}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-right">
                      <small className="text-slate-400 block text-[10px] font-bold">LIVE BASELINE</small>
                      <span className="font-semibold text-slate-600">40%</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <div className="text-right">
                      <small className="text-amber-700 block text-[10px] font-bold">SIMULATED</small>
                      <span className="font-extrabold text-slate-900 text-sm">{simResult.metrics.indoorDemand.simulated}%</span>
                    </div>
                    <span className={`px-2 py-1 rounded-lg font-bold text-xs flex items-center gap-1 ${
                      simResult.metrics.indoorDemand.delta > 0 ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-800'
                    }`}>
                      <TrendingUp className="w-3 h-3" />
                      +{simResult.metrics.indoorDemand.delta}%
                    </span>
                  </div>
                </div>

                {/* Restaurant & Dining Demand Shift */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <b className="text-xs text-slate-900 block">The Palms Dining & Room Service Orders</b>
                    <span className="text-[11px] text-slate-500">
                      Uncertainty Range: {simResult.metrics.restaurantDemand.estimate_range}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-right">
                      <small className="text-slate-400 block text-[10px] font-bold">LIVE BASELINE</small>
                      <span className="font-semibold text-slate-600">65%</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <div className="text-right">
                      <small className="text-amber-700 block text-[10px] font-bold">SIMULATED</small>
                      <span className="font-extrabold text-slate-900 text-sm">{simResult.metrics.restaurantDemand.simulated}%</span>
                    </div>
                    <span className="px-2 py-1 rounded-lg font-bold text-xs bg-amber-100 text-amber-800 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      +{simResult.metrics.restaurantDemand.delta}%
                    </span>
                  </div>
                </div>

                {/* Service Demand & Maintenance Pressure */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <b className="text-xs text-slate-900 block">Housekeeping Load & Drainage Pump Pressure</b>
                    <span className="text-[11px] text-slate-500">
                      Uncertainty Range: {simResult.metrics.serviceDemand.estimate_range}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-right">
                      <small className="text-slate-400 block text-[10px] font-bold">LIVE BASELINE</small>
                      <span className="font-semibold text-slate-600">52%</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <div className="text-right">
                      <small className="text-amber-700 block text-[10px] font-bold">SIMULATED</small>
                      <span className="font-extrabold text-slate-900 text-sm">{simResult.metrics.serviceDemand.simulated}%</span>
                    </div>
                    <span className="px-2 py-1 rounded-lg font-bold text-xs bg-blue-100 text-blue-800 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      +{simResult.metrics.serviceDemand.delta}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Cascading Impact Visualization */}
            {activeTab === 'cascade' && simResult && (
              <div className="space-y-3 mt-4">
                {simResult.cascade.map(step => (
                  <div key={step.step} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 text-xs">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      {step.step}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <b className="text-slate-900 font-semibold">{step.stage}: {step.name}</b>
                        {step.impact && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            {step.impact}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: Public / Social Signals */}
            {activeTab === 'signals' && (
              <div className="space-y-3 mt-4">
                {signals.map(sig => (
                  <div key={sig.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                        {sig.category}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{sig.timeAgo}</span>
                    </div>
                    <b className="text-slate-900 block text-sm">{sig.title}</b>
                    <p className="text-slate-600 text-xs leading-relaxed">{sig.summary}</p>
                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Source: <b className="text-slate-700">{sig.source}</b></span>
                      <span className="text-emerald-700 font-medium">{sig.relevance}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Operational Recommendations Footer */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Digital Twin AI Proactive Manager Directives:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {simResult?.recommendations.slice(0, 2).map((rec, i) => (
                <div key={i} className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950">
                  <b>{rec.title}</b>
                  <p className="text-[11px] text-emerald-800 mt-0.5">{rec.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
