import type { RecordModel } from 'pocketbase';

export interface Workspace extends RecordModel {
  name: string;
  invite_code: string;
  owner: string;
}

export type MemberRole = 'owner' | 'member';

export interface WorkspaceMember extends RecordModel {
  workspace: string;
  user: string;
  role: MemberRole;
  expand?: {
    user?: { id: string; name: string; email: string };
  };
}

export type PropertyStatus = 'checking' | 'strong' | 'offer_submitted' | 'rejected';

export interface Property extends RecordModel {
  workspace: string;
  title: string;
  address: string;
  rooms: number | null;
  floor: number | null;
  rent: number | null;
  arnona: number | null;
  vaad_bayit: number | null;
  parking_est: number | null;
  status: PropertyStatus;
  created_by: string;
}

export interface PropertyRating extends RecordModel {
  property: string;
  user: string;
  price_score: number | null;
  location_score: number | null;
  condition_score: number | null;
  is_dealbreaker: boolean;
  notes: string;
}

export type ChecklistItem =
  | 'water_pressure' | 'sockets' | 'ac'
  | 'natural_light' | 'street_noise' | 'windows_blinds'
  | 'dampness' | 'cracks';

export type ChecklistStatus = 'good' | 'bad' | 'na';

export interface InspectionLog extends RecordModel {
  property: string;
  user: string;
  checklist_item: ChecklistItem;
  status: ChecklistStatus;
  photo?: string;
}
