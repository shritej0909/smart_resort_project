import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useEffect } from 'react';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Calendar,
  ShieldCheck,
  Check,
  X,
  Wind,
  Droplets,
  Flame,
  ArrowUpDown,
  Layers,
  Settings,
  Activity,
  Calculator,
  Sliders,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { api, GroupedMaintenanceOverview, GroupedWearService } from '../services/api';

function getServiceIcon(iconName: string) {
  switch (iconName) {
    case 'Wind':
      return <Wind className="w-5 h-5 text-sky-600" />;
    case 'Droplets':
      return <Droplets className="w-5 h-5 text-cyan-600" />;
    case 'Flame':
      return <Flame className="w-5 h-5 text-amber-600" />;
    case 'ArrowUpDown':
      return <ArrowUpDown className="w-5 h-5 text-indigo-600" />;
    default:
      return <Wrench className="w-5 h-5 text-purple-600" />;
  }
}

export default function PredictiveMaintenance() {
  const [data, setData] = useState<GroupedMaintenanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [performingServiceId, setPerformingServiceId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  // Simulator state
  const [showSimulator, setShowSimulator] = useState(false);
  const [simHighDays, setSimHighDays] = useState(45);
  const [simNeutralDays, setSimNeutralDays] = useState(15);
  const [simLowDays, setSimLowDays] = useState(0);

  // Perform modal state
  const [serviceToPerform, setServiceToPerform] = useState<GroupedWearService | null>(null);
  const [performNotes, setPerformNotes] = useState('');
  const [performedBy, setPerformedBy] = useState('Chief Engineer & Technical Unit');

  const [expandedMathId, setExpandedMathId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await api<GroupedMaintenanceOverview>('/maintenance/overview');
      setData(res);
      if (res.sessionMix) {
        setSimHighDays(res.sessionMix.highDays);
        setSimNeutralDays(res.sessionMix.neutralDays);
        setSimLowDays(res.sessionMix.lowDays);
      }
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Could not connect to maintenance predictive engine.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4500);
  };

  // Switch grouped scenario
  const handleScenarioSwitch = async (scenario: 'scenario-60' | 'scenario-90' | 'scenario-offpeak' | 'custom') => {
    setEvaluating(true);
    try {
      const res = await api<GroupedMaintenanceOverview & { ok: boolean; message: string }>('/maintenance/scenario', 'POST', {
        scenario,
        highDays: scenario === 'custom' ? simHighDays : undefined,
        neutralDays: scenario === 'custom' ? simNeutralDays : undefined,
        lowDays: scenario === 'custom' ? simLowDays : undefined
      });
      setData(res);
      showToastMsg(`Evaluated ${res.activeScenarioTitle}!`);
    } catch (err: any) {
      setError(err?.message || 'Failed to switch scenario.');
    } finally {
      setEvaluating(false);
    }
  };

  // Custom simulator submit
  const handleApplyCustomSimulator = async (e: React.FormEvent) => {
    e.preventDefault();
    setEvaluating(true);
    try {
      const res = await api<GroupedMaintenanceOverview & { ok: boolean; message: string }>('/maintenance/scenario', 'POST', {
        scenario: 'custom',
        highDays: Number(simHighDays),
        neutralDays: Number(simNeutralDays),
        lowDays: Number(simLowDays)
      });
      setData(res);
      showToastMsg(`Custom operational session mix applied (${simHighDays + simNeutralDays + simLowDays} days total)!`);
    } catch (err: any) {
      setError(err?.message || 'Failed to apply custom session mix.');
    } finally {
      setEvaluating(false);
    }
  };

  // Perform maintenance & reset cumulative fatigue
  const handleConfirmPerform = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceToPerform) return;
    setPerformingServiceId(serviceToPerform.id);
    try {
      const res = await api<{ ok: boolean; message: string; overview: GroupedMaintenanceOverview }>('/maintenance/perform', 'POST', {
        serviceId: serviceToPerform.id,
        notes: performNotes,
        performedBy: performedBy.trim() || 'Chief Engineer & Technical Unit'
      });
      if (res && res.overview) {
        setData(res.overview);
      } else {
        await fetchData();
      }
      showToastMsg(`Certified maintenance completed for ${serviceToPerform.name}. Cumulative fatigue reset to 0.0 units!`);
      setServiceToPerform(null);
      setPerformNotes('');
    } catch (err: any) {
      setError(err?.message || 'Failed to record maintenance completion.');
    } finally {
      setPerformingServiceId(null);
    }
  };

  const currentServices = data?.services || [];
  const sessionMix = data?.sessionMix || { totalDays: 60, highDays: 45, neutralDays: 10, lowDays: 5, highPct: 75, neutralPct: 17, lowPct: 8 };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-slate-600 font-medium">Computing cumulative fatigue index & degradation model...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-4">
      {/* Toast Alert */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-indigo-500/40"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-semibold">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Header with Mathematical Degradation Overview */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-xs font-semibold uppercase tracking-wider mb-3">
              <Calculator className="w-3.5 h-3.5 text-indigo-400" />
              Cumulative Fatigue & Session-Grouped Predictive Model
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Predictive Equipment Fatigue & Wear Analysis
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl leading-relaxed">
              Equipment degradation is non-linear and governed by cumulative historical stress sessions. High-occupancy days burn fatigue capacity rapidly, while neutral/low days dilute wear. When accumulated fatigue crosses the critical threshold (<code className="text-indigo-300">W_cum &ge; W_threshold</code>), preventative maintenance is triggered.
            </p>
          </div>

          <button
            onClick={() => setShowSimulator(!showSimulator)}
            className="self-start lg:self-center px-4 py-2.5 rounded-2xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-xs font-bold text-white flex items-center gap-2 transition-all shadow-lg"
          >
            <Sliders className="w-4 h-4 text-indigo-300" />
            <span>{showSimulator ? 'Hide Session Simulator' : 'Custom Session Mix Simulator'}</span>
          </button>
        </div>

        {/* Grouped Operational Scenario Selector Tabs */}
        <div className="mt-8 pt-6 border-t border-slate-800/80">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              Select Grouped Operational Scenario
            </span>
            <span className="text-xs text-slate-400">
              Evaluated Window: <b className="text-white">{sessionMix.totalDays} Total Days</b>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Scenario 60 */}
            <button
              type="button"
              onClick={() => handleScenarioSwitch('scenario-60')}
              disabled={evaluating}
              className={`p-4 rounded-2xl text-left border transition-all ${
                data?.activeScenario === 'scenario-60'
                  ? 'bg-gradient-to-br from-indigo-900/80 to-slate-900 border-indigo-400 ring-2 ring-indigo-400/40 shadow-lg'
                  : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-extrabold text-white">Scenario 1 &bull; 60-Day Window</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800/60">
                  45 High / 15 Low
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                Heavy occupancy stress. Central AC hits its 50-unit threshold and triggers maintenance at <b className="text-red-400">Day 60</b>.
              </p>
            </button>

            {/* Scenario 90 */}
            <button
              type="button"
              onClick={() => handleScenarioSwitch('scenario-90')}
              disabled={evaluating}
              className={`p-4 rounded-2xl text-left border transition-all ${
                data?.activeScenario === 'scenario-90'
                  ? 'bg-gradient-to-br from-indigo-900/80 to-slate-900 border-indigo-400 ring-2 ring-indigo-400/40 shadow-lg'
                  : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-extrabold text-white">Scenario 2 &bull; 90-Day Window</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-800/60">
                  45 High / 45 Low
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                Equal neutral dilution. The same 50 units stretches over 90 days, triggering service at <b className="text-blue-400">Day 90</b>.
              </p>
            </button>

            {/* Scenario Offpeak */}
            <button
              type="button"
              onClick={() => handleScenarioSwitch('scenario-offpeak')}
              disabled={evaluating}
              className={`p-4 rounded-2xl text-left border transition-all ${
                data?.activeScenario === 'scenario-offpeak'
                  ? 'bg-gradient-to-br from-indigo-900/80 to-slate-900 border-indigo-400 ring-2 ring-indigo-400/40 shadow-lg'
                  : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-extrabold text-white">Scenario 3 &bull; Conservation</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                  15 High / 60 Low
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                Light off-peak usage. Daily fatigue drops to ~0.35/day, extending AC cycle to <b className="text-emerald-400">140+ Days</b>.
              </p>
            </button>
          </div>

          {/* Observed Operational Session Distribution Bar */}
          <div className="mt-5 p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Session Breakdown:</span>
              <div className="flex items-center gap-1.5 font-bold">
                <span className="text-red-400">{sessionMix.highDays} High ({sessionMix.highPct}%)</span>
                <span className="text-slate-500">&bull;</span>
                <span className="text-blue-400">{sessionMix.neutralDays} Neutral ({sessionMix.neutralPct}%)</span>
                <span className="text-slate-500">&bull;</span>
                <span className="text-emerald-400">{sessionMix.lowDays} Low ({sessionMix.lowPct}%)</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-slate-400">
              <div>Average Fleet Wear: <b className="text-white">{data?.stats?.averageWearIndex}%</b></div>
              <div>&bull;</div>
              <button onClick={fetchData} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold">
                <RefreshCw className="w-3.5 h-3.5" /> Re-sync Telemetry
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Custom Session Simulator Drawer */}
      <AnimatePresence>
        {showSimulator && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-3xl border border-indigo-200 shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Custom Session Mix Simulator</h3>
                    <p className="text-xs text-slate-500">Tune the number of High, Neutral, and Low demand days to observe real-time fatigue curves</p>
                  </div>
                </div>
                <button onClick={() => setShowSimulator(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleApplyCustomSimulator} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* High Days Slider */}
                  <div className="bg-red-50/70 p-4 rounded-2xl border border-red-100">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-red-900 flex items-center gap-1">
                        🔥 High Demand Sessions (w = 1.00)
                      </label>
                      <span className="text-xs font-extrabold text-red-600 bg-white px-2.5 py-0.5 rounded-lg border border-red-200">
                        {simHighDays} Days
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={simHighDays}
                      onChange={e => setSimHighDays(Number(e.target.value))}
                      className="w-full accent-red-600 cursor-pointer"
                    />
                    <span className="text-[11px] text-red-700 mt-1 block">90%+ Peak occupancy, heavy continuous equipment runtime</span>
                  </div>

                  {/* Neutral Days Slider */}
                  <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-100">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-blue-900 flex items-center gap-1">
                        ⚡ Neutral Demand Sessions (w = 0.35 - 0.40)
                      </label>
                      <span className="text-xs font-extrabold text-blue-600 bg-white px-2.5 py-0.5 rounded-lg border border-blue-200">
                        {simNeutralDays} Days
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={simNeutralDays}
                      onChange={e => setSimNeutralDays(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                    <span className="text-[11px] text-blue-700 mt-1 block">65-75% standard occupancy, baseline OEM stress</span>
                  </div>

                  {/* Low Days Slider */}
                  <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-emerald-900 flex items-center gap-1">
                        🌿 Low Demand Sessions (w = 0.11 - 0.15)
                      </label>
                      <span className="text-xs font-extrabold text-emerald-600 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-200">
                        {simLowDays} Days
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={simLowDays}
                      onChange={e => setSimLowDays(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                    <span className="text-[11px] text-emerald-700 mt-1 block">&le;35% off-peak occupancy, intermittent conservation cycles</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-slate-600">
                    Total Window Length: <b className="text-slate-900">{simHighDays + simNeutralDays + simLowDays} Operating Days</b>
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setSimHighDays(45); setSimNeutralDays(15); setSimLowDays(0); }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                    >
                      Reset to 45 / 15
                    </button>
                    <button
                      type="submit"
                      disabled={evaluating}
                      className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-colors"
                    >
                      Recalculate Wear Curves
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Monitored Facilities</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">{data?.stats?.totalMonitoredServices || 4} Core Services</div>
            <span className="text-xs text-slate-500 mt-0.5 block">Grouped wear degradation models</span>
          </div>
          <div className="p-3 bg-indigo-50 rounded-2xl">
            <Layers className="w-6 h-6 text-indigo-600" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Due Immediately (100% Fatigue)</span>
            <div className="text-2xl font-bold text-red-600 mt-1">{data?.stats?.dueImmediatelyCount || 0} Facilities</div>
            <span className="text-xs text-red-500 font-medium mt-0.5 block">Threshold reached &bull; Service now</span>
          </div>
          <div className="p-3 bg-red-50 rounded-2xl">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Approaching Threshold</span>
            <div className="text-2xl font-bold text-amber-600 mt-1">{data?.stats?.warningCount || 0} Facilities</div>
            <span className="text-xs text-amber-600 font-medium mt-0.5 block">&ge;80% wear limit reached</span>
          </div>
          <div className="p-3 bg-amber-50 rounded-2xl">
            <Clock className="w-6 h-6 text-amber-600" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Operational / Safe</span>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{data?.stats?.operationalCount || 0} Facilities</div>
            <span className="text-xs text-emerald-600 font-medium mt-0.5 block">Fatigue capacity available</span>
          </div>
          <div className="p-3 bg-emerald-50 rounded-2xl">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* The 4 Core Service Cards with Exact Mathematical Decomposition */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {currentServices.map((service) => {
          const isCritical = service.urgencyBadge === 'critical';
          const isWarning = service.urgencyBadge === 'warning';
          const isMathOpen = expandedMathId === service.id;

          return (
            <motion.div
              key={service.id}
              layout
              className={`bg-white rounded-3xl border transition-all duration-300 shadow-sm hover:shadow-md overflow-hidden flex flex-col justify-between ${
                isCritical
                  ? 'border-red-300 ring-2 ring-red-100'
                  : isWarning
                  ? 'border-amber-300 ring-2 ring-amber-100'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex-shrink-0 shadow-sm">
                      {getServiceIcon(service.icon)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base leading-snug">{service.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{service.category} &bull; {service.location}</p>
                    </div>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border flex-shrink-0 flex items-center gap-1.5 ${
                      isCritical
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : isWarning
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isCritical ? 'bg-red-500 animate-pulse' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} />
                    {service.urgencyStatus}
                  </span>
                </div>

                {/* Cumulative Fatigue Bar & Dynamic Trigger Days */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-indigo-600" />
                      Accumulated Fatigue Capacity
                    </span>
                    <span className="font-extrabold text-slate-900">
                      {service.currentWearUnits} / {service.wearThreshold} Units ({service.wearPercentage}%)
                    </span>
                  </div>

                  <div className="w-full h-3 bg-slate-200/80 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCritical
                          ? 'bg-gradient-to-r from-orange-500 to-red-600'
                          : isWarning
                          ? 'bg-gradient-to-r from-amber-400 to-amber-600'
                          : 'bg-gradient-to-r from-teal-400 to-emerald-500'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${service.wearPercentage}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>
                      Observed Operating Sessions: <b className="text-slate-800">{service.daysElapsed} Days</b>
                    </span>
                    <span>
                      Dynamic Trigger At: <b className="text-indigo-700">{service.projectedCycleDays} Days</b>
                    </span>
                  </div>
                </div>

                {/* Mathematical Formula Box */}
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1">
                      <Calculator className="w-3.5 h-3.5 text-indigo-600" />
                      Mathematical Fatigue Formulation
                    </span>
                    <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                      Burn Rate: {service.dailyBurnRate} u/day
                    </span>
                  </div>

                  <code className="text-xs font-mono font-semibold text-slate-800 block bg-white/80 p-2.5 rounded-xl border border-indigo-100 overflow-x-auto">
                    {service.mathFormula}
                  </code>

                  <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                    Under current session distribution, threshold (<b>{service.wearThreshold} units</b>) will be reached in <b>{service.projectedCycleDays} days</b>. Days remaining: <b className={isCritical ? 'text-red-600 font-bold' : 'text-slate-900'}>{service.daysRemaining} days</b>.
                  </p>
                </div>

                {/* AI Physical Degradation Mechanism Accordion */}
                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => setExpandedMathId(isMathOpen ? null : service.id)}
                    className="w-full px-4 py-2.5 text-left flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100/70 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      AI Physical Degradation Mechanism & Rationale
                    </span>
                    {isMathOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>

                  {isMathOpen && (
                    <div className="px-4 pb-3.5 pt-1 text-xs text-slate-600 leading-relaxed border-t border-slate-100">
                      <p>{service.aiMechanism}</p>
                      <div className="flex items-center gap-4 mt-2.5 text-[11px] text-slate-500 font-medium">
                        <span>Team: <b className="text-slate-800">{service.technicianTeam}</b></span>
                        <span>&bull;</span>
                        <span>Est. Cost: <b className="text-slate-800">{service.estimatedCost}</b></span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Action */}
              <div className="px-6 py-4 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  Last Serviced: <b className="text-slate-700">{service.lastMaintenance}</b>
                </div>

                <button
                  type="button"
                  onClick={() => setServiceToPerform(service)}
                  disabled={performingServiceId === service.id}
                  className={`text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-sm ${
                    isCritical
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/30'
                      : isWarning
                      ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/30'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30'
                  }`}
                >
                  {performingServiceId === service.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Perform Service & Reset Wear</span>
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Real-Time Activity and Evaluation Log */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              Real-Time Cumulative Model & Certification Log
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live audit trail of evaluated session mixes, cumulative fatigue threshold alerts, and technician service signoffs.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-600">
            {data?.actionLogs?.length || 0} Synced Events
          </span>
        </div>

        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
          {data?.actionLogs?.map((log) => (
            <div key={log.id} className="py-3 flex items-start justify-between gap-4 text-xs">
              <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded-lg mt-0.5 ${
                  log.action_type === 'Maintenance Certified'
                    ? 'bg-emerald-100 text-emerald-700'
                    : log.action_type === 'Scenario Evaluated'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {log.action_type === 'Maintenance Certified' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Activity className="w-3.5 h-3.5" />
                  )}
                </div>
                <div>
                  <div className="font-semibold text-slate-900 flex items-center gap-2">
                    <span>{log.service_name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                      {log.action_type}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-0.5 leading-relaxed">{log.notes}</p>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Certified by: <b className="text-slate-600">{log.performed_by}</b>
                  </span>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">
                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* PERFORM SERVICE MODAL */}
      <AnimatePresence>
        {serviceToPerform && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setServiceToPerform(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">Certify Preventative Maintenance</h3>
                    <p className="text-xs text-slate-500">Reset cumulative fatigue & certify physical inspection</p>
                  </div>
                </div>
                <button onClick={() => setServiceToPerform(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmPerform} className="mt-4 space-y-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="text-sm font-bold text-slate-900">{serviceToPerform.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{serviceToPerform.category} &bull; {serviceToPerform.location}</div>
                  <div className="mt-2 text-xs text-slate-600 flex items-center gap-4">
                    <span>Fatigue: <b className="text-red-600">{serviceToPerform.currentWearUnits} / {serviceToPerform.wearThreshold} units</b></span>
                    <span>Est. Cost: <b>{serviceToPerform.estimatedCost}</b></span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Lead Technician / Certified Team</label>
                  <input
                    type="text"
                    required
                    value={performedBy}
                    onChange={e => setPerformedBy(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="Enter technician or team name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Service & Physical Overhaul Notes</label>
                  <textarea
                    rows={3}
                    value={performNotes}
                    onChange={e => setPerformNotes(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="E.g. Cleaned coils, balanced refrigerant pressures, verified safety cutoffs..."
                  />
                </div>

                <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-xs flex items-center gap-2 border border-emerald-200">
                  <Info className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Submitting certifies the service in SQLite and resets the Cumulative Fatigue Index to 0.0 units.</span>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setServiceToPerform(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-colors"
                  >
                    Certify & Reset Fatigue
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
