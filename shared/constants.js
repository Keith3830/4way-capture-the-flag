export const TEAMS = ["red", "blue", "yellow", "pink"];

export const TEAM_COLORS = {
  red: "#E23B3B",
  blue: "#2F6FED",
  yellow: "#E0B000",
  pink: "#E85A9B",
};

export const TEAM_LABELS = {
  red: "Red",
  blue: "Blue",
  yellow: "Yellow",
  pink: "Pink",
};

export const FIELD_SIZE = 1000;
export const CENTER = FIELD_SIZE / 2;
export const CONE_ZONE = 168;
export const PLAYER_RADIUS = 18;
export const PLAYER_SPEED = 200;
export const TAG_RANGE = 42;
export const PICKUP_RANGE = 36;
export const FREEZE_DURATION = 12;
export const GRACE_DURATION = 1.5;
export const TICK_HZ = 25;
export const TICK_DT = 1 / TICK_HZ;
export const DEFAULT_MATCH_SECONDS = 600;
export const MATCH_LENGTHS = [600, 900, 1200];
export const TEAM_SIZE_OPTIONS = [2, 3];
export const DIFFICULTIES = ["easy", "normal", "hard"];
export const ROLES = ["guard", "runner", "rescuer"];
export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const TEAM_LAYOUT = {
  red: {
    x0: 0,
    y0: 0,
    x1: CENTER,
    y1: CENTER,
    stashX: 0,
    stashY: 0,
  },
  blue: {
    x0: CENTER,
    y0: 0,
    x1: FIELD_SIZE,
    y1: CENTER,
    stashX: FIELD_SIZE - CONE_ZONE,
    stashY: 0,
  },
  yellow: {
    x0: 0,
    y0: CENTER,
    x1: CENTER,
    y1: FIELD_SIZE,
    stashX: 0,
    stashY: FIELD_SIZE - CONE_ZONE,
  },
  pink: {
    x0: CENTER,
    y0: CENTER,
    x1: FIELD_SIZE,
    y1: FIELD_SIZE,
    stashX: FIELD_SIZE - CONE_ZONE,
    stashY: FIELD_SIZE - CONE_ZONE,
  },
};

export const STARTING_AVAILABLE = {
  red: { red: 0, blue: 2, yellow: 2, pink: 2 },
  blue: { red: 2, blue: 0, yellow: 2, pink: 2 },
  yellow: { red: 2, blue: 2, yellow: 0, pink: 2 },
  pink: { red: 2, blue: 2, yellow: 2, pink: 0 },
};

export const BOT_SPEED = {
  easy: 0.72,
  normal: 0.92,
  hard: 1.0,
};
