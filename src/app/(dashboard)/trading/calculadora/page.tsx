'use client'

import { useState, useEffect } from 'react'

const PIP_VALUES: Record<string, number> = {
  'EUR/USD': 10,
  'GBP/USD': 10,
  'AUD/USD': 10,
  'NZD/USD': 10,
  'USD/CHF': 9.8,
  'USD/CAD': 7.5,
  'USD/JPY': 9.1,
  'GBP/JPY': 9.1,
  'EUR/JPY': 9.1,
  'XAU/USD': 10,
}

export default function CalculadoraPage() {
  const [capital, setCapital] = useState('10000')
  const [riskPct, setRiskPct] = useState('1')
  const [par, setPar] = useState('EUR/USD')
  const [slPips, setSlPips] = useState('20')
  const [tpPips, setTpPips] = useState('40')

  const capitalNum = parseFloat(capital) || 0
  const riskPctNum = parseFloat(riskPct) || 0
  const slPipsNum = parseFloat(slPips) || 0
  const tpPipsNum = parseFloat(tpPips) || 0
  const pipValue = PIP_VALUES[par] || 10

  const riskAmount = capitalNum * (riskPctNum / 100)
  const lotSize = slPipsNum > 0 ? riskAmount / (slPipsNum * pipValue) : 0
  const potentialLoss = lotSize * slPipsNum * pipValue
  const potentialGain = lotSize * tpPipsNum * pipValue
  const rrRatio = slPipsNum > 0 ? tpPipsNum / slPipsNum : 0

  const rrColor = rrRatio >= 2 ? 'text-green-400' : rrRatio >= 1.5 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Calculadora de Posición</h1>
        <p className="text-gray-500 text-sm mt-0.5">Calcula el tamaño de lote basado en tu gestión de riesgo</p>
      </div>

      {/* Inputs */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-white text-sm">Parámetros de entrada</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Capital en cuenta (USD)</label>
            <input
              type="number"
              className="input"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              min="0"
              step="100"
            />
          </div>
          <div>
            <label className="label">Riesgo por trade (%)</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                min="0.1"
                max="10"
                step="0.1"
              />
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {['0.5', '1', '1.5', '2'].map((v) => (
                <button
                  key={v}
                  onClick={() => setRiskPct(v)}
                  className={`flex-1 text-xs py-1 rounded transition-colors ${
                    riskPct === v
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#111] text-gray-500 hover:text-gray-300 border border-[#2a2a2a]'
                  }`}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Par de divisas</label>
            <select className="input" value={par} onChange={(e) => setPar(e.target.value)}>
              {Object.keys(PIP_VALUES).map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Valor por pip (1 lote estándar)</label>
            <input
              type="text"
              className="input bg-[#111] text-gray-500 cursor-not-allowed"
              value={`$${pipValue}`}
              readOnly
            />
          </div>
          <div>
            <label className="label">Stop Loss (pips)</label>
            <input
              type="number"
              className="input"
              value={slPips}
              onChange={(e) => setSlPips(e.target.value)}
              min="1"
              step="1"
            />
          </div>
          <div>
            <label className="label">Take Profit (pips)</label>
            <input
              type="number"
              className="input"
              value={tpPips}
              onChange={(e) => setTpPips(e.target.value)}
              min="1"
              step="1"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-white text-sm">Resultados del cálculo</h2>
        <div className="grid grid-cols-2 gap-3">
          <ResultCard
            label="Tamaño de lote"
            value={lotSize > 0 ? lotSize.toFixed(2) : '0.00'}
            unit="lotes"
            highlight
          />
          <ResultCard
            label="Riesgo en USD"
            value={`$${riskAmount.toFixed(2)}`}
            unit={`${riskPctNum}% del capital`}
            danger
          />
          <ResultCard
            label="Pérdida potencial"
            value={`-$${potentialLoss.toFixed(2)}`}
            unit={`${slPipsNum} pips × $${(lotSize * pipValue).toFixed(2)}/pip`}
            danger
          />
          <ResultCard
            label="Ganancia potencial"
            value={`+$${potentialGain.toFixed(2)}`}
            unit={`${tpPipsNum} pips`}
            success
          />
        </div>

        {/* R:R */}
        <div className={`card border ${rrRatio >= 2 ? 'border-green-500/30 bg-green-500/5' : rrRatio >= 1.5 ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Relación Riesgo:Beneficio</p>
              <p className={`text-4xl font-bold mt-1 ${rrColor}`}>
                1 : {rrRatio.toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${rrColor}`}>
                {rrRatio >= 2 ? '✅ Excelente' : rrRatio >= 1.5 ? '⚠️ Aceptable' : '🛑 Bajo'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {rrRatio >= 2 ? 'Cumple el mínimo recomendado' : rrRatio >= 1 ? 'Considera mejorar el R:R' : 'No tomes este trade'}
              </p>
            </div>
          </div>
        </div>

        {/* Mini lotajes */}
        <div className="mt-2">
          <p className="text-xs text-gray-500 mb-2">Equivalencia en lotajes:</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-[#111] rounded p-2 text-center">
              <p className="text-gray-500">Lote estándar</p>
              <p className="text-white font-semibold">{lotSize.toFixed(2)}</p>
            </div>
            <div className="bg-[#111] rounded p-2 text-center">
              <p className="text-gray-500">Mini lote (0.1)</p>
              <p className="text-white font-semibold">{(lotSize * 10).toFixed(1)}</p>
            </div>
            <div className="bg-[#111] rounded p-2 text-center">
              <p className="text-gray-500">Micro lote (0.01)</p>
              <p className="text-white font-semibold">{(lotSize * 100).toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-600">
        * Los valores de pip son aproximados para cuentas en USD. Verifica con tu broker.
      </div>
    </div>
  )
}

function ResultCard({
  label, value, unit, highlight, danger, success,
}: {
  label: string
  value: string
  unit: string
  highlight?: boolean
  danger?: boolean
  success?: boolean
}) {
  const textColor = highlight
    ? 'text-blue-400'
    : danger
    ? 'text-red-400'
    : success
    ? 'text-green-400'
    : 'text-white'

  return (
    <div className="bg-[#111] border border-[#2a2a2a] rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${textColor}`}>{value}</p>
      <p className="text-xs text-gray-600 mt-0.5">{unit}</p>
    </div>
  )
}
