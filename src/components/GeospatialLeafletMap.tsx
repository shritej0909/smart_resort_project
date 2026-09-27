import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Info, Eye, Droplets, Wind, Thermometer, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface FacilityNode {
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

interface GeospatialLeafletMapProps {
  resortLat: number;
  resortLng: number;
  resortName: string;
  liveWeather: {
    temperature: number;
    rainfall: number;
    wind_speed: number;
    condition: string;
  } | null;
  rainfall: number;
  temperature: number;
  wind: number;
  isSimulatedActive: boolean;
  facilities: FacilityNode[];
  selectedFacility: FacilityNode | null;
  onSelectFacility: (facility: FacilityNode) => void;
}

// Controller component to ensure Leaflet renders full tile canvas without grey patches
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    // Invalidate size after mount / tab visibility
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
}

export default function GeospatialLeafletMap({
  resortLat,
  resortLng,
  resortName,
  liveWeather,
  rainfall,
  temperature,
  wind,
  isSimulatedActive,
  facilities,
  selectedFacility,
  onSelectFacility
}: GeospatialLeafletMapProps) {
  const center: [number, number] = [resortLat, resortLng];

  // Dynamic Weather Impact Color & Radius
  const weatherZone = useMemo(() => {
    if (rainfall > 60 || wind > 50) {
      return {
        color: '#dc2626',
        fillColor: '#ef4444',
        fillOpacity: 0.28,
        label: 'Severe Impact Zone',
        badge: 'CRITICAL SEVERITY',
        radius: 950
      };
    }
    if (rainfall > 15 || wind > 25) {
      return {
        color: '#d97706',
        fillColor: '#f59e0b',
        fillOpacity: 0.22,
        label: 'Moderate Surge Zone',
        badge: 'MODERATE IMPACT',
        radius: 750
      };
    }
    return {
      color: '#059669',
      fillColor: '#10b981',
      fillOpacity: 0.14,
      label: 'Normal Atmospheric Zone',
      badge: 'STABLE CONDITIONS',
      radius: 600
    };
  }, [rainfall, wind]);

  // Resort Master Custom Icon
  const resortIcon = useMemo(() => {
    const pulseColor = isSimulatedActive && rainfall > 30 ? 'bg-red-500' : 'bg-amber-500';
    return L.divIcon({
      className: 'custom-resort-marker',
      html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
          <div style="position: absolute; top: -4px; width: 38px; height: 38px; border-radius: 50%; background: ${weatherZone.fillColor}; opacity: 0.45; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; z-index: 10; width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #1e293b, #0f172a); border: 2.5px solid #f59e0b; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.35);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
              <path d="M10 6h4"/>
              <path d="M10 10h4"/>
              <path d="M10 14h4"/>
              <path d="M10 18h4"/>
            </svg>
          </div>
          <div style="margin-top: 4px; padding: 2px 7px; background: rgba(15, 23, 42, 0.9); color: #fff; font-size: 10px; font-weight: 700; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">
            ${isSimulatedActive ? `Sim: ${rainfall}mm` : `${liveWeather?.temperature ?? 27}°C`}
          </div>
        </div>
      `,
      iconSize: [42, 54],
      iconAnchor: [21, 27],
      popupAnchor: [0, -25]
    });
  }, [weatherZone, isSimulatedActive, rainfall, liveWeather]);

  // Facility Node Marker Icons
  const createFacilityIcon = (facility: FacilityNode) => {
    const isSuspended = facility.status === 'Suspended';
    const isPeak = facility.status === 'Peak Capacity' || facility.status === 'Fully Booked';
    const isSelected = selectedFacility?.id === facility.id;

    let bg = '#0284c7'; // default blue
    let border = '#38bdf8';
    if (isSuspended) {
      bg = '#dc2626';
      border = '#f87171';
    } else if (isPeak) {
      bg = '#7c3aed';
      border = '#c084fc';
    } else if (facility.type === 'outdoor') {
      bg = '#059669';
      border = '#34d399';
    }

    return L.divIcon({
      className: 'custom-facility-marker',
      html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; transition: transform 0.2s;">
          <div style="width: ${isSelected ? '32px' : '26px'}; height: ${isSelected ? '32px' : '26px'}; border-radius: 50%; background: ${bg}; border: 2px solid ${border}; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(0,0,0,0.3); transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};">
            <span style="font-size: 10px; font-weight: 800; color: #fff;">${facility.simulatedUtilization}%</span>
          </div>
          <div style="margin-top: 3px; padding: 1px 5px; background: rgba(15, 23, 42, 0.85); color: #e2e8f0; font-size: 9px; font-weight: 600; border-radius: 4px; white-space: nowrap; max-width: 110px; overflow: hidden; text-overflow: ellipsis;">
            ${facility.name.split(' ')[0]}
          </div>
        </div>
      `,
      iconSize: [36, 44],
      iconAnchor: [18, 22],
      popupAnchor: [0, -20]
    });
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-900">
      {/* Top HUD Bar */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="pointer-events-auto px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-white text-xs flex items-center gap-2 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-slate-200">REAL GEOSPATIAL MAP</span>
          <span className="text-slate-400">|</span>
          <span className="text-[11px] text-slate-300 font-mono">15.2998° N, 74.1240° E</span>
        </div>

        <div className="pointer-events-auto px-3 py-1.5 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-xs flex items-center gap-2 shadow-lg">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
            isSimulatedActive ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}>
            {isSimulatedActive ? 'SIMULATED IMPACT OVERLAY' : 'LIVE WEATHER OVERLAY'}
          </span>
          <span className="text-slate-200 font-semibold">{weatherZone.badge}</span>
        </div>
      </div>

      {/* Right Legend HUD */}
      <div className="absolute top-3 right-3 z-[1000] hidden md:flex flex-col gap-1.5 pointer-events-none">
        <div className="pointer-events-auto p-3 rounded-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-white text-xs shadow-lg space-y-1.5 max-w-[210px]">
          <div className="font-bold text-slate-200 flex items-center justify-between">
            <span>Map Layers</span>
            <span className="text-[10px] text-slate-400 font-normal">OSM Tiles</span>
          </div>
          <div className="text-[11px] space-y-1 text-slate-300">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
              <span>The Palms Resort (Center)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
              <span>Outdoor & Recreations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-sky-500 shrink-0" />
              <span>Indoor & Dining</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
              <span>Suspended (Rain Trigger)</span>
            </div>
          </div>
          <div className="pt-1 border-t border-slate-700/60 text-[10px] text-slate-400">
            Scroll to zoom • Drag to pan
          </div>
        </div>
      </div>

      {/* Actual Leaflet Map Canvas */}
      <div className="w-full h-[460px] md:h-[500px]">
        <MapContainer
          center={center}
          zoom={16}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%', background: '#0f172a' }}
        >
          <MapController center={center} />

          {/* OpenStreetMap Real Geographic Map Tiles — 100% Free, No API Key Required */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          {/* Dynamic Weather Impact Radius Circle (Simulation Controlled) */}
          <Circle
            center={center}
            radius={weatherZone.radius}
            pathOptions={{
              color: weatherZone.color,
              fillColor: weatherZone.fillColor,
              fillOpacity: weatherZone.fillOpacity,
              weight: 2,
              dashArray: isSimulatedActive ? '6, 6' : undefined
            }}
          >
            <Popup>
              <div className="p-1 space-y-1 text-slate-800">
                <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-sky-600" />
                  {weatherZone.label}
                </div>
                <p className="text-xs text-slate-600">
                  {isSimulatedActive ? 'Simulated Digital Twin Weather Radius' : 'Current Active Weather Telemetry Radius'} centered on The Palms Resort.
                </p>
                <div className="text-xs bg-slate-100 p-2 rounded-lg space-y-0.5">
                  <div><b>Rainfall:</b> {rainfall} mm ({isSimulatedActive ? 'Simulated' : 'Live'})</div>
                  <div><b>Temperature:</b> {temperature}°C</div>
                  <div><b>Wind:</b> {wind} km/h</div>
                  <div><b>Impact Severity:</b> {weatherZone.badge}</div>
                </div>
              </div>
            </Popup>
          </Circle>

          {/* Main Resort Marker */}
          <Marker position={center} icon={resortIcon}>
            <Popup>
              <div className="p-1 space-y-2 text-slate-800 min-w-[220px]">
                <div className="border-b pb-1.5">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Official Resort Center</span>
                  <h4 className="font-bold text-sm text-slate-900">{resortName}</h4>
                  <p className="text-xs text-slate-500">South Goa Coastal Sanctuary</p>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Coordinates:</span>
                    <span className="font-mono font-medium text-slate-800">15.2998° N, 74.1240° E</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Live Weather:</span>
                    <span className="font-medium text-slate-800">{liveWeather?.temperature ?? 27}°C ({liveWeather?.condition ?? 'Clear'})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">What-If Rain:</span>
                    <span className="font-bold text-sky-700">{rainfall} mm</span>
                  </div>
                </div>
                <div className="pt-1 border-t text-[10px] text-slate-500">
                  Digital Twin anchor for all 7 facility micro-zones
                </div>
              </div>
            </Popup>
          </Marker>

          {/* 7 Facility Node Markers */}
          {facilities.map((facility) => (
            <Marker
              key={facility.id}
              position={[facility.lat, facility.lng]}
              icon={createFacilityIcon(facility)}
              eventHandlers={{
                click: () => onSelectFacility(facility)
              }}
            >
              <Popup>
                <div className="p-1 space-y-2 text-slate-800 min-w-[210px]">
                  <div className="border-b pb-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {facility.type}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        facility.status === 'Suspended' ? 'bg-red-100 text-red-700' :
                        facility.status === 'Peak Capacity' || facility.status === 'Fully Booked' ? 'bg-purple-100 text-purple-700' :
                        facility.status === 'Active Refuge' ? 'bg-sky-100 text-sky-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {facility.status}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 mt-1">{facility.name}</h4>
                    <p className="text-[11px] text-slate-500">{facility.category}</p>
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Coordinates:</span>
                      <span className="font-mono text-[11px] text-slate-700">{facility.lat.toFixed(4)}°N, {facility.lng.toFixed(4)}°E</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Capacity:</span>
                      <span className="font-medium text-slate-800">{facility.capacity} guests</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Utilization:</span>
                      <span className="font-bold text-slate-900">{facility.simulatedUtilization}% (Live: {facility.baseUtilization}%)</span>
                    </div>
                    {facility.rainThresholdMm && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Rain Threshold:</span>
                        <span className="text-slate-700">{facility.rainThresholdMm > 100 ? 'All-Weather' : `${facility.rainThresholdMm} mm/h`}</span>
                      </div>
                    )}
                  </div>

                  {facility.alert && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>{facility.alert}</span>
                    </div>
                  )}

                  <button
                    onClick={() => onSelectFacility(facility)}
                    className="w-full mt-1 py-1 px-2 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3 h-3" />
                    Inspect In Facility Layout
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Bottom Status Ticker */}
      <div className="px-4 py-2.5 bg-slate-950/90 border-t border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span>
            <b>Live Map Data:</b> OpenStreetMap tiles loaded at South Goa resort perimeter. All 7 facility nodes linked to What-If simulator.
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
          <span>LAT: {resortLat}°</span>
          <span>LNG: {resortLng}°</span>
          <span className="text-amber-400 font-semibold">{isSimulatedActive ? '● SIMULATION ACTIVE' : '● REAL TELEMETRY'}</span>
        </div>
      </div>
    </div>
  );
}
