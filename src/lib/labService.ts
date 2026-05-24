import { hasSupabase, supabase } from './supabase';
import type { LabFileType, LabMarker, LabMarkerStatus, LabResult, LabSummary } from '../types';

// ---------- Funções puras ----------

export function categorizeMarkers(markers: Record<string, LabMarker>): {
  normal: Record<string, LabMarker>;
  concerning: Record<string, LabMarker>;
} {
  const normal: Record<string, LabMarker> = {};
  const concerning: Record<string, LabMarker> = {};
  for (const [key, marker] of Object.entries(markers)) {
    if (marker.status === 'normal' || marker.status === 'nao_classificado') {
      normal[key] = marker;
    } else {
      concerning[key] = marker;
    }
  }
  return { normal, concerning };
}

export function getLabSummaryForInsights(results: LabResult[]): LabSummary {
  if (!results.length) {
    return { lastDate: null, normalCount: 0, concerningCount: 0, concerning: [] };
  }
  const latest = results[0]; // ordenado por date desc
  const { normal, concerning } = categorizeMarkers(latest.markers);
  return {
    lastDate: latest.date,
    normalCount: Object.keys(normal).length,
    concerningCount: Object.keys(concerning).length,
    concerning: Object.entries(concerning).map(([key, m]) => ({
      key,
      name: key.replace(/_/g, ' '),
      status: m.status as LabMarkerStatus,
      value: m.value,
      unit: m.unit,
    })),
  };
}

// ---------- Acesso a dados ----------

export async function fetchLabResults(userId: string): Promise<LabResult[]> {
  const { data, error } = await supabase
    .from('lab_results')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as LabResult[];
}

export async function saveLabResult(payload: {
  user_id: string;
  date: string;
  lab_name: string | null;
  photo_url: string | null;
  file_type: LabFileType;
  markers: Record<string, LabMarker>;
  notes: string | null;
}): Promise<LabResult> {
  const { data, error } = await supabase
    .from('lab_results')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as LabResult;
}

export async function uploadLabFile(
  userId: string,
  file: File,
): Promise<string> {
  if (!hasSupabase) {
    return readFileAsDataUrl(file);
  }
  const ext = file.name.split('.').pop() ?? (file.type === 'application/pdf' ? 'pdf' : 'jpg');
  const path = `${userId}/lab-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from('labs').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from('labs').getPublicUrl(data.path);
  return pub.publicUrl;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}
