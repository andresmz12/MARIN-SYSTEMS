export default function PlaybookPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Playbook de Trading</h1>
        <p className="text-gray-500 text-sm mt-0.5">Mis estrategias validadas y proceso de decisión</p>
      </div>

      {/* Setups */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600/30 rounded flex items-center justify-center text-xs text-blue-400 font-bold">1</span>
          Mis 4 Setups Válidos
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SetupCard
            number="A"
            title="London Breakout"
            description="Rompimiento de la consolidación durante la apertura de Londres (08:00-10:00 GMT)"
            conditions={[
              'Rango estrecho en las 2h previas a Londres',
              'Rompimiento con vela de cuerpo grande',
              'Retroceso para entrada (opcional)',
              'SL debajo/encima del rango',
            ]}
            color="blue"
          />
          <SetupCard
            number="B"
            title="NY Session Open"
            description="Continuación o reversión en la apertura de Nueva York (13:30-15:00 GMT)"
            conditions={[
              'Identificar dirección del mercado en Londres',
              'Esperar retroceso al nivel clave',
              'Confirmación en M15 o M5',
              'Volumen y momentum confirmados',
            ]}
            color="purple"
          />
          <SetupCard
            number="C"
            title="Estructura H4"
            description="Operación con el trend mayor basado en estructura de precio H4"
            conditions={[
              'Tendencia clara en H4 (HH/HL o LL/LH)',
              'Pullback a zona de valor (50-61.8% Fib)',
              'Rejección con vela de confirmación en H1',
              'Mínimo 1:2 R:R disponible',
            ]}
            color="green"
          />
          <SetupCard
            number="D"
            title="Soporte/Resistencia Clave"
            description="Rebote desde niveles de soporte o resistencia de largo plazo"
            conditions={[
              'Nivel S/R con al menos 2 toques históricos',
              'Precio llega al nivel con momentum decreciente',
              'Vela de rechazo (pin bar, engulfing)',
              'Confirmación en timeframe menor',
            ]}
            color="orange"
          />
        </div>
      </section>

      {/* Horarios */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600/30 rounded flex items-center justify-center text-xs text-blue-400 font-bold">2</span>
          Horarios Óptimos (Hora Colombia — UTC-5)
        </h2>
        <div className="card">
          <div className="space-y-3">
            <TimeSlot
              time="03:00 – 05:00"
              session="Pre-Londres"
              quality="baja"
              note="Evitar. Mercados sin dirección."
            />
            <TimeSlot
              time="03:00 – 08:00"
              session="Sesión Londres"
              quality="alta"
              note="Mejor sesión del día. London Breakout y Estructura H4."
            />
            <TimeSlot
              time="08:30 – 11:00"
              session="Sesión NY + Overlap"
              quality="muy-alta"
              note="Máxima liquidez. NY Session Open. Mayor volatilidad."
            />
            <TimeSlot
              time="11:00 – 15:00"
              session="Tarde NY"
              quality="media"
              note="Posible continuación si el trend es claro. Precaución."
            />
            <TimeSlot
              time="15:00+"
              session="Sesión Asiática"
              quality="baja"
              note="Baja volatilidad. Ideal para análisis y planificación."
            />
          </div>
        </div>
      </section>

      {/* Proceso de decisión */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600/30 rounded flex items-center justify-center text-xs text-blue-400 font-bold">3</span>
          Proceso de Decisión — 6 Pasos
        </h2>
        <div className="card">
          <div className="space-y-4">
            {[
              { step: 1, title: 'Analizar el contexto mayor (D1/H4)', desc: 'Identificar la tendencia principal. ¿Es alcista, bajista o lateral? ¿Dónde está el precio en relación a los niveles clave?' },
              { step: 2, title: 'Identificar zona de valor', desc: 'Marcar niveles de soporte/resistencia, zonas de suministro/demanda, Fibonacci del swing mayor.' },
              { step: 3, title: 'Esperar el setup en H1/M15', desc: 'Observar cómo llega el precio a la zona. Buscar el patrón de mi playbook con confirmación en timeframe menor.' },
              { step: 4, title: 'Verificar el checklist pre-trade', desc: 'Completar los 11 ítems del checklist. Si no están todos marcados, no entrar al trade.' },
              { step: 5, title: 'Calcular el riesgo y tamaño de posición', desc: 'Usar la calculadora: máximo 1-2% del capital. Verificar que el R:R sea mínimo 1:1.5.' },
              { step: 6, title: 'Ejecutar o esperar', desc: 'Si todo alinea: ejecutar con confianza. Si hay duda: esperar. El mercado siempre dará otra oportunidad.' },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="w-7 h-7 bg-blue-600/20 border border-blue-600/30 rounded-full flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0 mt-0.5">
                  {item.step}
                </div>
                <div>
                  <p className="font-medium text-white text-sm">{item.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reglas de salida */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600/30 rounded flex items-center justify-center text-xs text-blue-400 font-bold">4</span>
          Reglas de Salida
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card border-green-500/20">
            <p className="text-green-400 font-semibold text-sm mb-3 flex items-center gap-2">
              <span>✅</span> Salida en Ganancia
            </p>
            <ul className="space-y-2 text-xs text-gray-400">
              <li>• Mover SL a BE cuando el precio llegue al 1:1</li>
              <li>• Tomar el 50% en el primer TP, dejar el resto correr</li>
              <li>• Cerrar todo en resistencia mayor o nivel de retorno</li>
              <li>• No mover el TP hacia abajo por ansiedad</li>
            </ul>
          </div>
          <div className="card border-red-500/20">
            <p className="text-red-400 font-semibold text-sm mb-3 flex items-center gap-2">
              <span>🛑</span> Salida Obligatoria
            </p>
            <ul className="space-y-2 text-xs text-gray-400">
              <li>• 3 pérdidas consecutivas → cerrar el día</li>
              <li>• Drawdown del 5% del capital → parar la semana</li>
              <li>• Si se activa el SL → no re-entrar inmediatamente</li>
              <li>• Noticia de alto impacto → cerrar posición abierta</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}

function SetupCard({
  number, title, description, conditions, color,
}: {
  number: string
  title: string
  description: string
  conditions: string[]
  color: string
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-600/10 border-blue-600/20 text-blue-400',
    purple: 'bg-purple-600/10 border-purple-600/20 text-purple-400',
    green: 'bg-green-600/10 border-green-600/20 text-green-400',
    orange: 'bg-orange-600/10 border-orange-600/20 text-orange-400',
  }

  return (
    <div className={`card border ${colors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-lg font-bold`}>Setup {number}</span>
      </div>
      <p className="font-semibold text-white text-sm">{title}</p>
      <p className="text-gray-500 text-xs mt-1 mb-3 leading-relaxed">{description}</p>
      <ul className="space-y-1.5">
        {conditions.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
            <span className="text-gray-600 mt-0.5">›</span>
            {c}
          </li>
        ))}
      </ul>
    </div>
  )
}

function TimeSlot({
  time, session, quality, note,
}: {
  time: string
  session: string
  quality: 'alta' | 'muy-alta' | 'media' | 'baja'
  note: string
}) {
  const qConfig = {
    'muy-alta': { color: 'text-green-400', bg: 'bg-green-500/10', label: 'Óptima' },
    alta: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Buena' },
    media: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Media' },
    baja: { color: 'text-gray-500', bg: 'bg-gray-500/5', label: 'Baja' },
  }[quality]

  return (
    <div className={`flex items-start gap-4 p-3 rounded-lg ${qConfig.bg}`}>
      <div className="w-28 flex-shrink-0">
        <p className="text-xs font-mono font-semibold text-gray-300">{time}</p>
        <p className="text-xs text-gray-500 mt-0.5">{session}</p>
      </div>
      <div className="flex-1">
        <p className="text-xs text-gray-400 leading-relaxed">{note}</p>
      </div>
      <span className={`text-xs font-medium flex-shrink-0 ${qConfig.color}`}>{qConfig.label}</span>
    </div>
  )
}
