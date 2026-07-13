export const AgentProtocol = {
  /**
   * Game state sent to an agent on each tick.
   *
   * @typedef {Object} GameStateMessage
   * @property {"game_state"} type
   * @property {string} matchId - Unique match identifier
   * @property {string} agentId - This agent's assigned ID
   * @property {string} role - "pacman" or "ghost"
   * @property {Object} maze
   * @property {number} maze.rows
   * @property {number} maze.cols
   * @property {number[][]} maze.grid - 2D array: 0=path, 1=wall
   * @property {EntityState[]} entities - All living entities in the match
   * @property {{r:number, c:number}[]} pellets - Remaining dot pellet positions
   * @property {{r:number, c:number}[]} powerPellets - Remaining power pellet positions
   * @property {boolean} ghostsVulnerable - True when power pellet is active
   * @property {string} state - "playing" | "finished"
   * @property {string|null} winner - "pacmen" | "ghosts" | null
   */

  /**
   * @typedef {Object} EntityState
   * @property {string} id
   * @property {string} role - "pacman" | "ghost"
   * @property {string} team - "pacmen" | "ghosts"
   * @property {number} r - Row position
   * @property {number} c - Column position
   * @property {boolean} alive
   */

  /**
   * Move response from an agent.
   *
   * @typedef {Object} MoveMessage
   * @property {"move"} type
   * @property {string} agentId
   * @property {"up"|"down"|"left"|"right"} direction
   */

  /**
   * Join request from an agent.
   *
   * @typedef {Object} JoinMessage
   * @property {"join"} type
   * @property {string} agentId
   * @property {"pacman"|"ghost"} preferredRole - Can be null if no preference
   */
};

export const DIRECTIONS = ["up", "down", "left", "right"];

export const MESSAGE_TYPES = {
  JOIN: "join",
  GAME_STATE: "game_state",
  MOVE: "move",
  AGENT_LEFT: "agent_left",
  MATCH_START: "match_start",
  MATCH_END: "match_end",
};
