'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { MonitoredApp } from '@/types/agents';

interface ManageAgentsModalProps {
  apps: MonitoredApp[];
  onClose: () => void;
}

interface FormState {
  id: string | null;
  name: string;
  agentName: string;
  role: string;
  healthUrl: string;
  color: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  agentName: '',
  role: '',
  healthUrl: '',
  color: '#22d3ee',
};

export function ManageAgentsModal({ apps, onClose }: ManageAgentsModalProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isEditing = form.id !== null;

  function edit(app: MonitoredApp) {
    setForm({
      id: app.id,
      name: app.name,
      agentName: app.agentName,
      role: app.role ?? '',
      healthUrl: app.healthUrl,
      color: app.color,
    });
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        agentName: form.agentName || 'Agente',
        role: form.role || null,
        healthUrl: form.healthUrl,
        color: form.color,
      };
      const res = await fetch(isEditing ? `/api/agents/${form.id}` : '/api/agents', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'No se pudo guardar el agente');
        return;
      }
      setForm(EMPTY_FORM);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Gestionar agentes" size="lg">
      <div className="space-y-5">
        <div className="space-y-2">
          {apps.length === 0 && (
            <p className="text-xs text-slate-500">Aún no hay agentes configurados.</p>
          )}
          {apps.map((app) => (
            <div
              key={app.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--bg-border)] bg-[var(--bg-elevated)] p-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: app.color }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{app.agentName} — {app.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{app.healthUrl}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => edit(app)} className="text-xs px-2 py-1 rounded-md text-cyan-300 hover:bg-cyan-500/10">
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(app.id)}
                  disabled={deletingId === app.id}
                  className="text-xs px-2 py-1 rounded-md text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                >
                  {deletingId === app.id ? 'Borrando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 border-t border-[var(--bg-border)] pt-4">
          <h3 className="text-xs font-semibold text-slate-300">
            {isEditing ? 'Editar agente' : 'Agregar nuevo agente'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre de la app *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Report System"
                required
              />
            </div>
            <div>
              <label className="label">Nombre del agente</label>
              <input
                className="input"
                value={form.agentName}
                onChange={(e) => setForm((f) => ({ ...f, agentName: e.target.value }))}
                placeholder="Ángela"
              />
            </div>
          </div>
          <div>
            <label className="label">URL del health check *</label>
            <input
              className="input"
              value={form.healthUrl}
              onChange={(e) => setForm((f) => ({ ...f, healthUrl: e.target.value }))}
              placeholder="https://mi-app.railway.app/api/health"
              required
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Debe responder JSON (idealmente {'{ status: "ok" }'}) con código 2xx cuando esté sana.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Rol</label>
              <input
                className="input"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="Generación de reportes"
              />
            </div>
            <div>
              <label className="label">Color</label>
              <input
                type="color"
                className="input h-9 p-1"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Agregar agente'}
            </button>
            {isEditing && (
              <button type="button" className="btn-secondary" onClick={() => setForm(EMPTY_FORM)}>
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}
