class Game {
  constructor(maze) {
    this.maze = maze;
    this.entities = [];
    this.state = "waiting";
    this.pellets = maze.pellets.map((p) => ({ ...p }));
    this.powerPellets = maze.powerPellets.map((p) => ({ ...p }));
    this.powerPelletTimer = null;
    this.ghostsVulnerable = false;
    this.pacmenScore = 0;
    this.ghostsScore = 0;
  }

  addEntity(id, role, r, c) {
    const entity = {
      id,
      role,
      team: role === "pacman" ? "pacmen" : "ghosts",
      r,
      c,
      alive: true,
      color: role === "pacman" ? "#ffff00" : "#ff0000",
      lastMove: null,
    };
    this.entities.push(entity);
    return entity;
  }

  removeEntity(id) {
    const idx = this.entities.findIndex((e) => e.id === id);
    if (idx !== -1) {
      this.entities[idx].alive = false;
    }
  }

  moveEntity(id, direction) {
    const entity = this.entities.find((e) => e.id === id);
    if (!entity || !entity.alive) return false;

    const dirs = {
      up: { dr: -1, dc: 0 },
      down: { dr: 1, dc: 0 },
      left: { dr: 0, dc: -1 },
      right: { dr: 0, dc: 1 },
    };

    const d = dirs[direction];
    if (!d) return false;

    const nr = entity.r + d.dr;
    const nc = entity.c + d.dc;

    if (this.maze.isWall(nr, nc)) return false;

    entity.r = nr;
    entity.c = nc;
    entity.lastMove = direction;

    this._checkPellet(entity);
    this._checkPowerPellet(entity);
    this._checkCollisions(entity);

    return true;
  }

  _checkPellet(entity) {
    const idx = this.pellets.findIndex(
      (p) => p.r === entity.r && p.c === entity.c
    );
    if (idx !== -1) {
      this.pellets.splice(idx, 1);
      if (entity.role === "pacman") this.pacmenScore += 10;
    }
  }

  _checkPowerPellet(entity) {
    const idx = this.powerPellets.findIndex(
      (p) => p.r === entity.r && p.c === entity.c
    );
    if (idx !== -1 && entity.role === "pacman") {
      this.powerPellets.splice(idx, 1);
      this.pacmenScore += 50;
      this.ghostsVulnerable = true;
      clearTimeout(this.powerPelletTimer);
      this.powerPelletTimer = setTimeout(() => {
        this.ghostsVulnerable = false;
      }, 10000);
    }
  }

  _checkCollisions(entity) {
    for (const other of this.entities) {
      if (other.id === entity.id || !other.alive) continue;
      if (other.r === entity.r && other.c === entity.c) {
        if (entity.team !== other.team) {
          if (entity.role === "pacman" && other.role === "ghost") {
            if (this.ghostsVulnerable) {
              other.alive = false;
              this.pacmenScore += 200;
            } else {
              entity.alive = false;
              this.ghostsScore += 100;
            }
          } else if (entity.role === "ghost" && other.role === "pacman") {
            if (this.ghostsVulnerable) {
              entity.alive = false;
              this.pacmenScore += 200;
            } else {
              other.alive = false;
              this.ghostsScore += 100;
            }
          }
        }
      }
    }
  }

  getWinner() {
    const pacmenAlive = this.entities.some(
      (e) => e.team === "pacmen" && e.alive
    );
    const ghostsAlive = this.entities.some(
      (e) => e.team === "ghosts" && e.alive
    );
    if (!pacmenAlive && !ghostsAlive) return null;
    if (!pacmenAlive) return "ghosts";
    if (!ghostsAlive) return "pacmen";
    return null;
  }

  getState() {
    return {
      maze: {
        rows: this.maze.rows,
        cols: this.maze.cols,
        grid: this.maze.grid,
      },
      entities: this.entities.map((e) => ({
        id: e.id,
        role: e.role,
        team: e.team,
        r: e.r,
        c: e.c,
        alive: e.alive,
        color: e.color,
        lastMove: e.lastMove,
      })),
      pellets: [...this.pellets],
      powerPellets: [...this.powerPellets],
      ghostsVulnerable: this.ghostsVulnerable,
      state: this.state,
      winner: this.getWinner(),
      pacmenScore: this.pacmenScore,
      ghostsScore: this.ghostsScore,
    };
  }

  reset() {
    this.entities = [];
    this.state = "waiting";
    this.pellets = this.maze.pellets.map((p) => ({ ...p }));
    this.powerPellets = this.maze.powerPellets.map((p) => ({ ...p }));
    this.ghostsVulnerable = false;
    this.pacmenScore = 0;
    this.ghostsScore = 0;
    clearTimeout(this.powerPelletTimer);
    this.powerPelletTimer = null;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { Game };
}
