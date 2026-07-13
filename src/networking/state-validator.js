class StateValidator {
  constructor(mazeGrid) {
    this.mazeGrid = mazeGrid;
    this.prevState = null;
    this.violations = [];
  }

  validate(newState) {
    this.violations = [];
    if (!this.prevState) {
      this.prevState = this._cloneState(newState);
      return { valid: true, violations: [] };
    }

    this._checkEntityJumps(newState);
    this._checkWallPassing(newState);
    this._checkPelletCount(newState);
    this._checkPowerPelletCount(newState);
    this._checkEntityResurrection(newState);
    this._checkGhostVulnerability(newState);

    if (this.violations.length === 0) {
      this.prevState = this._cloneState(newState);
    }

    return { valid: this.violations.length === 0, violations: this.violations };
  }

  _cloneState(s) {
    return {
      entities: (s.entities || []).map((e) => ({ id: e.id, r: e.r, c: e.c, alive: e.alive, role: e.role })),
      pellets: (s.pellets || []).map((p) => ({ r: p.r, c: p.c })),
      powerPellets: (s.powerPellets || []).map((p) => ({ r: p.r, c: p.c })),
      ghostsVulnerable: !!s.ghostsVulnerable,
    };
  }

  _checkEntityJumps(newState) {
    for (const entity of newState.entities || []) {
      const prev = (this.prevState.entities || []).find((e) => e.id === entity.id);
      if (!prev) continue;
      const dr = Math.abs(entity.r - prev.r);
      const dc = Math.abs(entity.c - prev.c);
      if (dr > 1 || dc > 1) {
        this.violations.push({
          type: "position_jump",
          entityId: entity.id,
          detail: `moved (${prev.r},${prev.c}) → (${entity.r},${entity.c}) (Δ${dr},${dc})`,
        });
      }
    }
  }

  _checkWallPassing(newState) {
    if (!this.mazeGrid || this.mazeGrid.length === 0) return;
    for (const entity of newState.entities || []) {
      if (!entity.alive) continue;
      const rows = this.mazeGrid.length;
      const cols = this.mazeGrid[0] ? this.mazeGrid[0].length : 0;
      if (entity.r < 0 || entity.r >= rows || entity.c < 0 || entity.c >= cols) {
        this.violations.push({
          type: "out_of_bounds",
          entityId: entity.id,
          detail: `position (${entity.r},${entity.c}) outside maze`,
        });
        continue;
      }
      if (this.mazeGrid[entity.r][entity.c] === 1) {
        this.violations.push({
          type: "wall_collision",
          entityId: entity.id,
          detail: `entity at (${entity.r},${entity.c}) which is a wall`,
        });
      }
    }
  }

  _checkPelletCount(newState) {
    if (!this.prevState.pellets) return;
    const newCount = (newState.pellets || []).length;
    const prevCount = this.prevState.pellets.length;
    if (newCount > prevCount) {
      this.violations.push({
        type: "pellet_count_increase",
        detail: `pellets: ${prevCount} → ${newCount}`,
      });
    }
  }

  _checkPowerPelletCount(newState) {
    if (!this.prevState.powerPellets) return;
    const newCount = (newState.powerPellets || []).length;
    const prevCount = this.prevState.powerPellets.length;
    if (newCount > prevCount) {
      this.violations.push({
        type: "power_pellet_count_increase",
        detail: `power pellets: ${prevCount} → ${newCount}`,
      });
    }
  }

  _checkEntityResurrection(newState) {
    for (const entity of newState.entities || []) {
      const prev = (this.prevState.entities || []).find((e) => e.id === entity.id);
      if (!prev) continue;
      if (!prev.alive && entity.alive) {
        this.violations.push({
          type: "entity_resurrection",
          entityId: entity.id,
          detail: `entity resurrected from dead to alive`,
        });
      }
    }
  }

  _checkGhostVulnerability(newState) {
    const prevVuln = this.prevState.ghostsVulnerable;
    const newVuln = !!newState.ghostsVulnerable;
    if (!newVuln && prevVuln) {
      const ppNew = (newState.powerPellets || []).length;
      const ppPrev = this.prevState.powerPellets.length;
      const pelletsAte = ppPrev - ppNew;
      if (pelletsAte > 0) {
        this.violations.push({
          type: "ghost_vulnerability_reset_with_pellet_eaten",
          detail: `vulnerability expired but ${pelletsAte} power pellets were also eaten`,
        });
      }
    }
  }

  reset() {
    this.prevState = null;
    this.violations = [];
  }

  getViolations() {
    return this.violations;
  }
}

module.exports = { StateValidator };
