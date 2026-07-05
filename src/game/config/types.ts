export type DebrisShape = {
  key: string;
  width: number;
  height: number;
  // visual weight: just a hint for color/intensity, not physics
  heavy?: boolean;
};

export type InputState = {
  moveX: number;          // -1..1 from joystick
  moveY: number;          // -1..1 from joystick (down positive)
  jumpPressed: boolean;   // edge-triggered: true for the frame jump goes down
  jumpHeld: boolean;
  airDodgePressed: boolean;
  specialPressed: boolean;
  climbPressed: boolean;
  fireHeld: boolean;
};

export type RunStats = {
  maxHeightPx: number;    // how high above the floor the player has climbed (px)
  survivalSeconds: number;
  score: number;
};
