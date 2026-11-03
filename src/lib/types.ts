export type Skill = "any" | "beginner" | "intermediate" | "advanced";
export type JoinMode = "open" | "request";
export type PlayerStatus = "joined" | "pending" | "declined" | "removed";

export type Club = {
  id: string;
  name: string;
  city: string;
  province: string | null;
  area: string | null;
  court_count: number | null;
  lat: number | null;
  lng: number | null;
};

export type Profile = {
  id: string;
  first_name: string;
  surname: string;
  phone: string;
  city: string;
  skill: Skill;
  lat?: number | null;
  lng?: number | null;
};

export type GamePlayer = {
  id: string;
  user_id: string;
  status: PlayerStatus;
  player: { id: string; first_name: string; surname: string } | null;
};

export type Game = {
  id: string;
  host_id: string;
  starts_at: string;
  spots_needed: number;
  court_booked: boolean;
  join_mode: JoinMode;
  skill: Skill;
  note: string | null;
  status: "open" | "cancelled";
  host: { id: string; first_name: string; surname: string; city: string; skill: Skill } | null;
  clubs: Club[];
  players: GamePlayer[];
};

export type Contact = {
  user_id: string;
  first_name: string;
  surname: string;
  phone: string;
  role: "host" | "player";
};

export const SKILLS: Skill[] = ["any", "beginner", "intermediate", "advanced"];

export const SKILL_LABEL: Record<Skill, string> = {
  any: "Any level",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
